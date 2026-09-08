/**
 * Sincronização de planilha do Google.
 *
 * O ponto que importa: a importação é IDEMPOTENTE. Cada linha vira uma
 * chave em `linhas_planilha_processadas`, com índice único. Rodar a
 * sincronização dez vezes seguidas importa a mesma linha uma vez só — e
 * isso é o que impede uma planilha de virar dez mensagens para o mesmo
 * cliente.
 *
 * A chave usa a coluna identificadora quando ela existe. Sem ela, cai
 * para número da linha + hash do conteúdo, para que inserir uma linha no
 * meio da planilha não faça todas as debaixo parecerem novas.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';
import { indiceDaColuna, lerPlanilha } from '@/lib/integracoes/google';
import { chaveLinhaPlanilha, hashConteudoLinha } from '@/lib/nucleo/idempotencia';
import { normalizarTelefone, variantesBrasil } from '@/lib/nucleo/telefone';
import { registrarAuditoria, ACOES } from '@/lib/auditoria';
import type { TrabalhoPlanilha } from '@/lib/filas/nomes';
import { log } from '@/lib/log';

interface Mapeamento {
  telefone?: string;
  nome?: string;
  email?: string;
  documento?: string;
  origem?: string;
  [chave: string]: string | undefined;
}

export async function processarPlanilha(trabalho: TrabalhoPlanilha): Promise<void> {
  const supabase = clienteAdministrador();
  const registro = log.comContexto({
    organizacao_id: trabalho.organizacaoId,
    integracao: trabalho.integracaoSheetsId,
  });

  const { data: config, error } = await supabase
    .from('integracoes_google_sheets')
    .select('*')
    .eq('id', trabalho.integracaoSheetsId)
    .eq('organizacao_id', trabalho.organizacaoId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao ler configuração da planilha: ${error.message}`);
  if (!config || !config.ativo) {
    registro.info('Planilha inativa; sincronização ignorada');
    return;
  }

  let dados;
  try {
    dados = await lerPlanilha(config.integracao_id, config.planilha_id, config.aba, config.intervalo);
  } catch (erro) {
    const descricao = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from('integracoes_google_sheets')
      .update({ ultimo_erro: descricao })
      .eq('id', config.id);
    await supabase
      .from('integracoes')
      .update({ status: 'ERRO', ultimo_erro: descricao })
      .eq('id', config.integracao_id);
    throw erro;
  }

  const mapeamento = (config.mapeamento_colunas ?? {}) as Mapeamento;
  const colunaTelefone = mapeamento.telefone ? indiceDaColuna(mapeamento.telefone) : -1;

  if (colunaTelefone < 0) {
    const aviso = 'Mapeamento sem a coluna de telefone. Configure em Integrações > Google Sheets.';
    await supabase
      .from('integracoes_google_sheets')
      .update({ ultimo_erro: aviso })
      .eq('id', config.id);
    registro.warn(aviso);
    return;
  }

  const { data: campos } = await supabase
    .from('campos_personalizados')
    .select('id, chave')
    .eq('organizacao_id', trabalho.organizacaoId)
    .eq('ativo', true);

  const camposPorChave = new Map((campos ?? []).map((campo) => [campo.chave, campo.id]));

  const colunaIdentificadora = config.coluna_identificadora
    ? indiceDaColuna(config.coluna_identificadora)
    : -1;

  let importados = 0;
  let ignorados = 0;
  let falhas = 0;

  // A primeira linha de dados é 1-based na planilha.
  const primeira = Math.max(1, config.primeira_linha_dados);

  for (let numeroLinha = primeira; numeroLinha <= dados.linhas.length; numeroLinha += 1) {
    const linha = dados.linhas[numeroLinha - 1];
    if (!linha || linha.every((celula) => !celula.trim())) continue;

    const identificadorLinha =
      colunaIdentificadora >= 0 ? (linha[colunaIdentificadora] ?? '').trim() : null;

    const chave = chaveLinhaPlanilha(identificadorLinha, numeroLinha, linha);
    const hash = hashConteudoLinha(linha);

    const { data: jaProcessada } = await supabase
      .from('linhas_planilha_processadas')
      .select('id')
      .eq('integracao_sheets_id', config.id)
      .eq('identificador_linha', chave)
      .maybeSingle();

    if (jaProcessada) {
      ignorados += 1;
      continue;
    }

    const telefoneBruto = linha[colunaTelefone] ?? '';
    const telefone = normalizarTelefone(telefoneBruto);

    if (!telefone) {
      await registrarLinha(config.id, trabalho.organizacaoId, chave, hash, null, 'FALHOU', `Telefone inválido: "${telefoneBruto}"`);
      falhas += 1;
      continue;
    }

    try {
      const contatoId = await importarContato({
        organizacaoId: trabalho.organizacaoId,
        telefone,
        linha,
        mapeamento,
        camposPorChave,
        etiquetaId: config.etiqueta_id,
      });

      await registrarLinha(config.id, trabalho.organizacaoId, chave, hash, contatoId, 'IMPORTADA', null);

      if (config.campanha_id) {
        // Contato já na campanha não entra de novo — `ignoreDuplicates`
        // deixa a chave única (campanha_id, contato_id) resolver isso sem
        // transformar o esperado em erro.
        await supabase.from('contatos_campanha').upsert(
          {
            organizacao_id: trabalho.organizacaoId,
            campanha_id: config.campanha_id,
            contato_id: contatoId,
            status: 'PENDENTE',
          },
          { onConflict: 'campanha_id,contato_id', ignoreDuplicates: true },
        );
      }

      importados += 1;
    } catch (erro) {
      const descricao = erro instanceof Error ? erro.message : String(erro);
      await registrarLinha(config.id, trabalho.organizacaoId, chave, hash, null, 'FALHOU', descricao);
      falhas += 1;
    }
  }

  await supabase
    .from('integracoes_google_sheets')
    .update({
      ultima_sincronizacao_em: new Date().toISOString(),
      ultimo_erro: null,
      nome_planilha: dados.titulo ?? config.nome_planilha,
      total_importados: config.total_importados + importados,
    })
    .eq('id', config.id);

  await supabase
    .from('integracoes')
    .update({ status: 'CONECTADA', ultimo_erro: null })
    .eq('id', config.integracao_id);

  await registrarAuditoria({
    organizacaoId: trabalho.organizacaoId,
    acao: ACOES.PLANILHA_SINCRONIZADA,
    atorTipo: 'SISTEMA',
    entidade: 'integracoes_google_sheets',
    entidadeId: config.id,
    metadados: { importados, ignorados, falhas, linhas: dados.linhas.length },
  });

  registro.info('Planilha sincronizada', { importados, ignorados, falhas });

  // O total da campanha precisa refletir os contatos recém-importados,
  // senão a barra de progresso da tela mente.
  if (config.campanha_id && importados > 0) {
    const { count } = await supabase
      .from('contatos_campanha')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', config.campanha_id);

    await supabase
      .from('campanhas')
      .update({ total: count ?? 0 })
      .eq('id', config.campanha_id)
      .eq('organizacao_id', trabalho.organizacaoId);
  }
}

interface PedidoImportacao {
  organizacaoId: string;
  telefone: string;
  linha: string[];
  mapeamento: Mapeamento;
  camposPorChave: Map<string, string>;
  etiquetaId: string | null;
}

async function importarContato(pedido: PedidoImportacao): Promise<string> {
  const supabase = clienteAdministrador();
  const { organizacaoId, telefone, linha, mapeamento, camposPorChave } = pedido;

  const ler = (coluna: string | undefined): string | null => {
    if (!coluna) return null;
    const indice = indiceDaColuna(coluna);
    if (indice < 0) return null;
    const valor = (linha[indice] ?? '').trim();
    return valor || null;
  };

  const variantes = variantesBrasil(telefone);

  const { data: existente } = await supabase
    .from('contatos')
    .select('id, nome')
    .eq('organizacao_id', organizacaoId)
    .in('telefone', variantes)
    .limit(1)
    .maybeSingle();

  const nome = ler(mapeamento.nome);
  const email = ler(mapeamento.email);
  const documento = ler(mapeamento.documento);
  const origem = ler(mapeamento.origem) ?? 'GOOGLE_SHEETS';

  let contatoId: string;

  if (existente) {
    contatoId = existente.id;
    // Importação não sobrescreve nome já preenchido: quem digitou na tela
    // sabe mais que a planilha.
    await supabase
      .from('contatos')
      .update({
        nome: existente.nome ?? nome,
        email: email ?? undefined,
        documento: documento ?? undefined,
      })
      .eq('id', contatoId)
      .eq('organizacao_id', organizacaoId);
  } else {
    const { data: criado, error } = await supabase
      .from('contatos')
      .insert({
        organizacao_id: organizacaoId,
        telefone: variantes[0] as string,
        nome,
        email,
        documento,
        origem,
      })
      .select('id')
      .single();

    if (error) throw new Error(`Falha ao criar contato: ${error.message}`);
    contatoId = criado.id;
  }

  // Campos personalizados vêm com o prefixo "campo:" no mapeamento.
  const valores: {
    organizacao_id: string;
    contato_id: string;
    campo_id: string;
    valor: string;
    origem: 'INTEGRACAO';
  }[] = [];

  for (const [chaveMapeada, coluna] of Object.entries(mapeamento)) {
    if (!chaveMapeada.startsWith('campo:')) continue;
    const chaveCampo = chaveMapeada.slice('campo:'.length);
    const campoId = camposPorChave.get(chaveCampo);
    if (!campoId) continue;

    const valor = ler(coluna);
    if (!valor) continue;

    valores.push({
      organizacao_id: organizacaoId,
      contato_id: contatoId,
      campo_id: campoId,
      valor,
      origem: 'INTEGRACAO',
    });
  }

  if (valores.length) {
    await supabase
      .from('valores_campos_contato')
      .upsert(valores, { onConflict: 'contato_id,campo_id' });
  }

  if (pedido.etiquetaId) {
    await supabase
      .from('etiquetas_contato')
      .upsert(
        {
          organizacao_id: organizacaoId,
          contato_id: contatoId,
          etiqueta_id: pedido.etiquetaId,
        },
        { onConflict: 'contato_id,etiqueta_id' },
      );
  }

  return contatoId;
}

async function registrarLinha(
  integracaoSheetsId: string,
  organizacaoId: string,
  chave: string,
  hash: string,
  contatoId: string | null,
  status: 'IMPORTADA' | 'IGNORADA' | 'FALHOU',
  erro: string | null,
): Promise<void> {
  await clienteAdministrador()
    .from('linhas_planilha_processadas')
    .upsert(
      {
        organizacao_id: organizacaoId,
        integracao_sheets_id: integracaoSheetsId,
        identificador_linha: chave,
        hash_conteudo: hash,
        contato_id: contatoId,
        status,
        erro,
      },
      { onConflict: 'integracao_sheets_id,identificador_linha' },
    );
}
