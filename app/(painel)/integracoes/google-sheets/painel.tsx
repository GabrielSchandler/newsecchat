'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Link2, Plus, RefreshCw, Table2 } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import {
  Cartao,
  CabecalhoCartao,
  CorpoCartao,
  DescricaoCartao,
  EstadoVazio,
  Selo,
  TituloCartao,
} from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import { formatarDataHora, formatarNumero } from '@/lib/utilitarios';
import type { IntegracaoGoogleSheets, StatusIntegracao } from '@/lib/tipos-banco';
import {
  desativarPlanilha,
  desconectarGoogle,
  iniciarConexaoGoogle,
  salvarPlanilha,
  sincronizarAgora,
} from '../acoes';

interface IntegracaoResumo {
  id: string;
  nome: string;
  status: StatusIntegracao;
  conta_externa: string | null;
  ultimo_erro: string | null;
}

export function PainelSheets({
  integracao,
  planilhas,
  etiquetas,
  campanhas,
  campos,
  googleConfigurado,
}: {
  integracao: IntegracaoResumo | null;
  planilhas: IntegracaoGoogleSheets[];
  etiquetas: { id: string; nome: string }[];
  campanhas: { id: string; nome: string }[];
  campos: { chave: string; rotulo: string }[];
  googleConfigurado: boolean;
}) {
  const roteador = useRouter();
  const [conectando, definirConectando] = React.useState(false);
  const [cadastrando, definirCadastrando] = React.useState(false);
  const [editando, definirEditando] = React.useState<IntegracaoGoogleSheets | null>(null);

  const conectada = integracao?.status === 'CONECTADA';

  return (
    <div className="space-y-4">
      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Conta Google</TituloCartao>
          <DescricaoCartao>
            A aplicação pede permissão apenas de LEITURA de planilhas. Ela nunca escreve na sua conta
            Google.
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Selo tom={conectada ? 'sucesso' : 'neutro'}>
                {conectada ? 'conectada' : 'não conectada'}
              </Selo>
              {integracao?.conta_externa ? (
                <span className="text-[13px] text-tinta-800">{integracao.conta_externa}</span>
              ) : null}
            </div>
            {integracao?.ultimo_erro ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-marca-600">
                {integracao.ultimo_erro}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Botao
              carregando={conectando}
              disabled={!googleConfigurado}
              onClick={async () => {
                definirConectando(true);
                try {
                  const resultado = await iniciarConexaoGoogle();
                  if (!resultado.ok || !resultado.url) {
                    toast.error(resultado.erro ?? 'Não foi possível iniciar.');
                    return;
                  }
                  window.location.href = resultado.url;
                } finally {
                  definirConectando(false);
                }
              }}
            >
              <Link2 className="h-4 w-4" aria-hidden />
              {conectada ? 'Reconectar' : 'Conectar conta Google'}
            </Botao>

            {conectada && integracao ? (
              <Botao
                variante="fantasma"
                onClick={async () => {
                  const resultado = await desconectarGoogle(integracao.id);
                  if (!resultado.ok) {
                    toast.error(resultado.erro ?? 'Não foi possível desconectar.');
                    return;
                  }
                  toast.success(resultado.aviso ?? 'Conta desconectada.');
                  roteador.refresh();
                }}
              >
                Desconectar
              </Botao>
            ) : null}
          </div>
        </CorpoCartao>
      </Cartao>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-tinta-900">Planilhas</h2>
        {conectada ? (
          <Botao onClick={() => definirCadastrando(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nova planilha
          </Botao>
        ) : null}
      </div>

      {planilhas.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Table2 className="h-5 w-5" />}
            titulo="Nenhuma planilha configurada"
            descricao={
              conectada
                ? 'Cadastre a planilha, diga em qual coluna está o telefone e a importação passa a rodar sozinha.'
                : 'Conecte a conta Google acima para começar.'
            }
          />
        </Cartao>
      ) : (
        <div className="space-y-3">
          {planilhas.map((planilha) => (
            <LinhaPlanilha
              key={planilha.id}
              planilha={planilha}
              aoEditar={() => definirEditando(planilha)}
            />
          ))}
        </div>
      )}

      <DialogoPlanilha
        aberto={cadastrando}
        definirAberto={definirCadastrando}
        integracaoId={integracao?.id ?? null}
        planilha={null}
        etiquetas={etiquetas}
        campanhas={campanhas}
        campos={campos}
      />

      <DialogoPlanilha
        aberto={editando !== null}
        definirAberto={(valor) => {
          if (!valor) definirEditando(null);
        }}
        integracaoId={integracao?.id ?? null}
        planilha={editando}
        etiquetas={etiquetas}
        campanhas={campanhas}
        campos={campos}
      />
    </div>
  );
}

function LinhaPlanilha({
  planilha,
  aoEditar,
}: {
  planilha: IntegracaoGoogleSheets;
  aoEditar: () => void;
}) {
  const roteador = useRouter();
  const [ocupado, definirOcupado] = React.useState(false);

  return (
    <Cartao>
      <CorpoCartao className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14.5px] font-semibold text-tinta-900">
              {planilha.nome_planilha ?? 'Planilha'}
            </h3>
            <Selo tom={planilha.ativo ? 'sucesso' : 'neutro'}>
              {planilha.ativo ? 'ativa' : 'pausada'}
            </Selo>
          </div>

          <p className="mt-1 text-[12.5px] text-bruma-600">
            Aba “{planilha.aba}” · a cada {planilha.intervalo_minutos} min ·{' '}
            {formatarNumero(planilha.total_importados)} contato(s) importado(s)
          </p>

          <p className="mt-0.5 text-[12px] text-bruma-500">
            {planilha.ultima_sincronizacao_em
              ? `Última sincronização em ${formatarDataHora(planilha.ultima_sincronizacao_em)}`
              : 'Nunca sincronizada'}
          </p>

          {planilha.ultimo_erro ? (
            <p className="mt-1.5 rounded-lg bg-marca-50 px-2 py-1 text-[12px] leading-relaxed text-marca-600">
              {planilha.ultimo_erro}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Botao
            variante="secundario"
            tamanho="pequeno"
            disabled={ocupado}
            onClick={async () => {
              definirOcupado(true);
              try {
                const resultado = await sincronizarAgora(planilha.id);
                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível sincronizar.');
                  return;
                }
                toast.success(resultado.aviso ?? 'Sincronização enfileirada.');
                roteador.refresh();
              } finally {
                definirOcupado(false);
              }
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Sincronizar agora
          </Botao>

          <Botao variante="fantasma" tamanho="pequeno" onClick={aoEditar}>
            Editar
          </Botao>

          <Botao
            variante="fantasma"
            tamanho="pequeno"
            disabled={ocupado}
            onClick={async () => {
              const resultado = await desativarPlanilha(planilha.id, !planilha.ativo);
              if (!resultado.ok) {
                toast.error(resultado.erro ?? 'Não foi possível alterar.');
                return;
              }
              roteador.refresh();
            }}
          >
            {planilha.ativo ? 'Pausar' : 'Reativar'}
          </Botao>
        </div>
      </CorpoCartao>
    </Cartao>
  );
}

function DialogoPlanilha({
  aberto,
  definirAberto,
  integracaoId,
  planilha,
  etiquetas,
  campanhas,
  campos,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  integracaoId: string | null;
  planilha: IntegracaoGoogleSheets | null;
  etiquetas: { id: string; nome: string }[];
  campanhas: { id: string; nome: string }[];
  campos: { chave: string; rotulo: string }[];
}) {
  const roteador = useRouter();
  const [planilhaId, definirPlanilhaId] = React.useState('');
  const [aba, definirAba] = React.useState('Página1');
  const [colunaTelefone, definirColunaTelefone] = React.useState('B');
  const [colunaNome, definirColunaNome] = React.useState('A');
  const [colunaIdentificadora, definirColunaIdentificadora] = React.useState('');
  const [primeiraLinha, definirPrimeiraLinha] = React.useState(2);
  const [intervalo, definirIntervalo] = React.useState(15);
  const [etiquetaId, definirEtiqueta] = React.useState('');
  const [campanhaId, definirCampanha] = React.useState('');
  const [mapeamento, definirMapeamento] = React.useState<Record<string, string>>({});
  const [salvando, definirSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto) return;

    definirPlanilhaId(planilha?.planilha_id ?? '');
    definirAba(planilha?.aba ?? 'Página1');
    definirPrimeiraLinha(planilha?.primeira_linha_dados ?? 2);
    definirIntervalo(planilha?.intervalo_minutos ?? 15);
    definirEtiqueta(planilha?.etiqueta_id ?? '');
    definirCampanha(planilha?.campanha_id ?? '');
    definirColunaIdentificadora(planilha?.coluna_identificadora ?? '');

    const atual =
      planilha?.mapeamento_colunas &&
      typeof planilha.mapeamento_colunas === 'object' &&
      !Array.isArray(planilha.mapeamento_colunas)
        ? (planilha.mapeamento_colunas as Record<string, string>)
        : {};

    definirColunaTelefone(atual.telefone ?? 'B');
    definirColunaNome(atual.nome ?? 'A');

    const doCampo: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(atual)) {
      if (chave.startsWith('campo:')) doCampo[chave.slice('campo:'.length)] = String(valor);
    }
    definirMapeamento(doCampo);
  }, [aberto, planilha]);

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo
        titulo={planilha ? 'Editar planilha' : 'Nova planilha'}
        descricao="Diga onde estão os dados. Cada linha vira um contato, e uma linha já importada nunca é importada de novo."
      >
        <CorpoDialogo>
          <Campo
            rotulo="ID ou link da planilha"
            htmlFor="sheet-id"
            obrigatorio
            ajuda="Pode colar o link inteiro do navegador — a aplicação extrai o ID sozinha."
          >
            <Entrada
              id="sheet-id"
              value={planilhaId}
              onChange={(evento) => definirPlanilhaId(evento.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Aba" htmlFor="sheet-aba" obrigatorio>
              <Entrada
                id="sheet-aba"
                value={aba}
                onChange={(evento) => definirAba(evento.target.value)}
                maxLength={80}
              />
            </Campo>

            <Campo
              rotulo="Primeira linha de dados"
              htmlFor="sheet-linha"
              ajuda="2 quando a linha 1 é o cabeçalho."
            >
              <Entrada
                id="sheet-linha"
                type="number"
                min={1}
                max={1000}
                value={primeiraLinha}
                onChange={(evento) => definirPrimeiraLinha(Number(evento.target.value))}
              />
            </Campo>

            <Campo rotulo="Coluna do telefone" htmlFor="sheet-telefone" obrigatorio>
              <Entrada
                id="sheet-telefone"
                value={colunaTelefone}
                onChange={(evento) => definirColunaTelefone(evento.target.value.toUpperCase())}
                maxLength={3}
                placeholder="B"
              />
            </Campo>

            <Campo rotulo="Coluna do nome" htmlFor="sheet-nome">
              <Entrada
                id="sheet-nome"
                value={colunaNome}
                onChange={(evento) => definirColunaNome(evento.target.value.toUpperCase())}
                maxLength={3}
                placeholder="A"
              />
            </Campo>

            <Campo
              rotulo="Coluna de identificador"
              htmlFor="sheet-identificador"
              ajuda="Opcional, mas recomendado: uma coluna com um id estável por linha. Sem ela, inserir linhas no meio da planilha pode fazer o sistema tratar linhas antigas como novas."
            >
              <Entrada
                id="sheet-identificador"
                value={colunaIdentificadora}
                onChange={(evento) => definirColunaIdentificadora(evento.target.value.toUpperCase())}
                maxLength={3}
                placeholder="Ex.: A"
              />
            </Campo>

            <Campo rotulo="Verificar a cada (minutos)" htmlFor="sheet-intervalo">
              <Entrada
                id="sheet-intervalo"
                type="number"
                min={5}
                max={1440}
                value={intervalo}
                onChange={(evento) => definirIntervalo(Number(evento.target.value))}
              />
            </Campo>
          </div>

          {campos.length ? (
            <Campo
              rotulo="Campos do negócio"
              ajuda="Diga em qual coluna está cada campo. Deixe em branco o que não existir na planilha."
            >
              <div className="space-y-2">
                {campos.map((campo) => (
                  <div key={campo.chave} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-800">
                      {campo.rotulo}
                    </span>
                    <Entrada
                      value={mapeamento[campo.chave] ?? ''}
                      onChange={(evento) =>
                        definirMapeamento((atuais) => ({
                          ...atuais,
                          [campo.chave]: evento.target.value.toUpperCase(),
                        }))
                      }
                      maxLength={3}
                      placeholder="—"
                      className="w-[80px]"
                      aria-label={`Coluna de ${campo.rotulo}`}
                    />
                  </div>
                ))}
              </div>
            </Campo>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Etiquetar os importados"
              htmlFor="sheet-etiqueta"
              ajuda="Ajuda a montar campanha depois."
            >
              <Selecao
                id="sheet-etiqueta"
                value={etiquetaId}
                onChange={(evento) => definirEtiqueta(evento.target.value)}
              >
                <option value="">Nenhuma</option>
                {etiquetas.map((etiqueta) => (
                  <option key={etiqueta.id} value={etiqueta.id}>
                    {etiqueta.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo
              rotulo="Adicionar à campanha"
              htmlFor="sheet-campanha"
              ajuda="Os contatos entram como pendentes. Nada é enviado até você iniciar a campanha."
            >
              <Selecao
                id="sheet-campanha"
                value={campanhaId}
                onChange={(evento) => definirCampanha(evento.target.value)}
              >
                <option value="">Nenhuma</option>
                {campanhas.map((campanha) => (
                  <option key={campanha.id} value={campanha.id}>
                    {campanha.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            carregando={salvando}
            disabled={!integracaoId || planilhaId.trim().length < 10}
            onClick={async () => {
              if (!integracaoId) return;
              definirSalvando(true);
              try {
                const resultado = await salvarPlanilha({
                  integracaoId,
                  planilhaExistenteId: planilha?.id ?? null,
                  planilhaId,
                  aba,
                  colunaTelefone,
                  colunaNome,
                  colunaIdentificadora,
                  primeiraLinha,
                  intervaloMinutos: intervalo,
                  etiquetaId: etiquetaId || null,
                  campanhaId: campanhaId || null,
                  mapeamentoCampos: Object.entries(mapeamento).map(([chave, coluna]) => ({
                    chave,
                    coluna,
                  })),
                });

                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível salvar.');
                  return;
                }

                toast.success('Planilha salva. A primeira sincronização acontece em instantes.');
                definirAberto(false);
                roteador.refresh();
              } finally {
                definirSalvando(false);
              }
            }}
          >
            Salvar
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}
