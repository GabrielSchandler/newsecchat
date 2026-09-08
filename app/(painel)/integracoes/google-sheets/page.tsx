import type { Metadata } from 'next';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { integracaoConfigurada, orientacaoIntegracao } from '@/lib/ambiente';
import { AvisoConfiguracao, CabecalhoPagina } from '@/componentes/ui/estrutura';
import { PainelSheets } from './painel';

export const metadata: Metadata = { title: 'Google Sheets' };
export const dynamic = 'force-dynamic';

export default async function PaginaSheets({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirPapel('ADMIN');
  const parametros = await searchParams;
  const supabase = await clienteServidor();

  const ler = (chave: string) => {
    const valor = parametros[chave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const [integracaoResposta, planilhasResposta, etiquetasResposta, campanhasResposta, camposResposta] =
    await Promise.all([
      supabase
        .from('integracoes')
        .select('id, nome, status, conta_externa, ultimo_erro')
        .eq('organizacao_id', sessao.organizacao.id)
        .eq('tipo', 'GOOGLE_SHEETS')
        .maybeSingle(),
      supabase
        .from('integracoes_google_sheets')
        .select('*')
        .eq('organizacao_id', sessao.organizacao.id)
        .order('criado_em'),
      supabase.from('etiquetas').select('id, nome').eq('organizacao_id', sessao.organizacao.id).order('nome'),
      supabase
        .from('campanhas')
        .select('id, nome')
        .eq('organizacao_id', sessao.organizacao.id)
        .in('status', ['RASCUNHO', 'PAUSADA', 'EM_EXECUCAO'])
        .order('criado_em', { ascending: false }),
      supabase
        .from('campos_personalizados')
        .select('chave, rotulo')
        .eq('organizacao_id', sessao.organizacao.id)
        .eq('ativo', true)
        .order('ordem'),
    ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-10">
      <CabecalhoPagina
        titulo="Google Sheets"
        descricao="Importa leads de uma planilha para a base de contatos. Cada linha entra uma vez só — rodar a sincronização de novo não duplica nada nem reenvia mensagem."
      />

      {!integracaoConfigurada('GOOGLE_SHEETS') ? (
        <AvisoConfiguracao
          className="mb-4"
          titulo="Google ainda não configurado"
          orientacao={orientacaoIntegracao.GOOGLE_SHEETS}
        />
      ) : null}

      {ler('erro') ? (
        <div className="mb-4 rounded-lg border border-marca-50 bg-marca-50 px-4 py-3">
          <p className="text-[13px] leading-relaxed text-marca-600">{ler('erro')}</p>
        </div>
      ) : null}

      {ler('conectado') ? (
        <div className="mb-4 rounded-lg border border-sucesso-100 bg-sucesso-100/50 px-4 py-3">
          <p className="text-[13px] text-sucesso-700">
            Conta Google conectada. Agora cadastre a planilha abaixo.
          </p>
        </div>
      ) : null}

      <PainelSheets
        integracao={integracaoResposta.data ?? null}
        planilhas={planilhasResposta.data ?? []}
        etiquetas={etiquetasResposta.data ?? []}
        campanhas={campanhasResposta.data ?? []}
        campos={camposResposta.data ?? []}
        googleConfigurado={integracaoConfigurada('GOOGLE_SHEETS')}
      />
    </div>
  );
}
