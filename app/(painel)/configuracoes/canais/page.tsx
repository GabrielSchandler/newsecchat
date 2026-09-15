import type { Metadata } from 'next';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { integracaoConfigurada, orientacaoIntegracao, ambientePublico } from '@/lib/ambiente';
import { AvisoConfiguracao } from '@/componentes/ui/estrutura';
import { PainelCanais } from './painel';

export const metadata: Metadata = { title: 'Canais de WhatsApp' };
export const dynamic = 'force-dynamic';

export default async function PaginaCanais() {
  const sessao = await exigirPapel('ADMIN');
  const supabase = await clienteServidor();

  const [canaisResposta, departamentosResposta] = await Promise.all([
    supabase
      .from('canais')
      .select(
        'id, organizacao_id, nome, tipo, provedor, departamento_id, telefone, identificador_externo, configuracao, status, ia_ativa, ultima_conexao_em, ultimo_erro, ativo, criado_em, atualizado_em',
      )
      .eq('organizacao_id', sessao.organizacao.id)
      .order('criado_em', { ascending: true }),
    supabase
      .from('departamentos')
      .select('*')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
  ]);

  const evolutionPronta = integracaoConfigurada('EVOLUTION');

  return (
    <div className="space-y-4">
      {!evolutionPronta ? (
        <AvisoConfiguracao
          titulo="Evolution API ainda não configurada"
          orientacao={orientacaoIntegracao.EVOLUTION}
        />
      ) : null}

      {ambientePublico.urlAplicacao.includes('localhost') ? (
        <AvisoConfiguracao
          titulo="O endereço da aplicação ainda é localhost"
          orientacao="A Evolution API precisa alcançar o webhook pela internet. Enquanto NEXT_PUBLIC_URL_APLICACAO apontar para localhost, nenhuma mensagem vai chegar. Em produção, use o endereço público (ex.: https://chat.newsec.com.br)."
        />
      ) : null}

      <PainelCanais
        canais={canaisResposta.data ?? []}
        departamentos={departamentosResposta.data ?? []}
        evolutionPronta={evolutionPronta}
      />
    </div>
  );
}
