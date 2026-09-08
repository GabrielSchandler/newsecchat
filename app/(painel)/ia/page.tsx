import type { Metadata } from 'next';
import { Bot } from 'lucide-react';
import { exigirPapel, papelAtende } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { integracaoConfigurada, orientacaoIntegracao } from '@/lib/ambiente';
import { AvisoConfiguracao, Cartao, EstadoVazio } from '@/componentes/ui/estrutura';
import { EditorAgente } from './editor';

export const metadata: Metadata = { title: 'Configuração da IA' };
export const dynamic = 'force-dynamic';

export default async function PaginaIa() {
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: agente } = await supabase
    .from('agentes_ia')
    .select('*')
    .eq('organizacao_id', sessao.organizacao.id)
    .eq('padrao', true)
    .maybeSingle();

  if (!agente) {
    return (
      <Cartao>
        <EstadoVazio
          icone={<Bot className="h-5 w-5" />}
          titulo="Nenhum agente configurado"
          descricao="O agente padrão é criado junto com a organização. Se ele não existe, algo deu errado no provisionamento — rode as migrações e crie a organização novamente."
        />
      </Cartao>
    );
  }

  const [publicadaResposta, rascunhoResposta, camposResposta] = await Promise.all([
    agente.versao_publicada_id
      ? supabase
          .from('versoes_agente_ia')
          .select('*')
          .eq('id', agente.versao_publicada_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('versoes_agente_ia')
      .select('*')
      .eq('agente_id', agente.id)
      .eq('status', 'RASCUNHO')
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('campos_personalizados')
      .select('chave, rotulo, obrigatorio_para_qualificacao')
      .eq('organizacao_id', sessao.organizacao.id)
      .eq('ativo', true)
      .order('ordem'),
  ]);

  return (
    <div className="space-y-4">
      {!integracaoConfigurada('IA') ? (
        <AvisoConfiguracao
          titulo="Provedor de IA não configurado"
          orientacao={`${orientacaoIntegracao.IA} Enquanto isso, toda conversa que chegar vai direto para atendimento humano — nada fica sem resposta por causa disso.`}
        />
      ) : null}

      <EditorAgente
        agente={agente}
        publicada={publicadaResposta.data ?? null}
        rascunho={rascunhoResposta.data ?? null}
        campos={camposResposta.data ?? []}
        podeEditar={papelAtende(sessao.papel, 'ADMIN')}
      />
    </div>
  );
}
