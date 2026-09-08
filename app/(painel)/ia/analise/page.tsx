import type { Metadata } from 'next';
import { exigirPapel, papelAtende } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { integracaoConfigurada, orientacaoIntegracao } from '@/lib/ambiente';
import { AvisoConfiguracao } from '@/componentes/ui/estrutura';
import { PainelAnalise } from './painel';

export const metadata: Metadata = { title: 'Análise de atendimentos' };
export const dynamic = 'force-dynamic';

export default async function PaginaAnalise() {
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const [execucoesResposta, sugestoesResposta] = await Promise.all([
    supabase
      .from('execucoes_analise_ia')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .order('iniciado_em', { ascending: false })
      .limit(10),
    supabase
      .from('sugestoes_ia')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .order('criado_em', { ascending: false })
      .limit(60),
  ]);

  return (
    <div className="space-y-4">
      {!integracaoConfigurada('IA') ? (
        <AvisoConfiguracao titulo="Provedor de IA não configurado" orientacao={orientacaoIntegracao.IA} />
      ) : null}

      <PainelAnalise
        execucoes={execucoesResposta.data ?? []}
        sugestoes={sugestoesResposta.data ?? []}
        podeRevisar={papelAtende(sessao.papel, 'ADMIN')}
        iaConfigurada={integracaoConfigurada('IA')}
      />
    </div>
  );
}
