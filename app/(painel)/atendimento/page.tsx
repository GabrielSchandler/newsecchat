import type { Metadata } from 'next';
import { MessageSquare } from 'lucide-react';
import { exigirSessao } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { carregarApoio, carregarDetalheConversa } from './dados';
import { carregarAtendimento, carregarRespostas } from '@/lib/operacao/dados';
import { resolverEscopo, resolverFiltro } from '@/lib/operacao/atendimento';
import { ListaOperacional } from './lista-operacional';
import { PainelConversa } from './conversa';
import { ContextoContato } from './contexto';
import { SincronizadorLista } from './sincronizador';
import { IndicadorAbrindo } from './abrindo';
import { ColunasAtendimento } from './colunas';

export const metadata: Metadata = { title: 'Atendimento' };
export const dynamic = 'force-dynamic';

export default async function Atendimento({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const s = await exigirSessao();
  const p = await searchParams;
  const ler = (nome: string) => {
    const valor = p[nome];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const id = ler('conversa');
  const escopo = resolverEscopo(ler('escopo'), ler('caixa'), s.papel);
  const caixa = resolverFiltro(ler('caixa'), escopo);
  const db = await clienteServidor();

  // Respostas rápidas e a linha operacional só servem com uma conversa
  // aberta; sem ela, não vale gastar uma ida ao banco por renderização.
  const [fila, apoio, detalhe, respostas, operacional] = await Promise.all([
    carregarAtendimento({
      escopo,
      caixa,
      busca: ler('busca'),
      equipe: ler('equipe'),
      canal: ler('canal'),
      pagina: Number(ler('pagina')) || 1,
      ordem: ler('ordem'),
    }),
    carregarApoio(s.organizacao.id),
    id ? carregarDetalheConversa(s.organizacao.id, id) : null,
    id ? carregarRespostas() : [],
    id ? db.from('fila_operacional').select('*').eq('id', id).eq('organizacao_id', s.organizacao.id).maybeSingle() : null,
  ]);

  if (operacional?.error) throw new Error('Não foi possível carregar o contexto do atendimento.');

  return (
    <div className="central-atendimento" data-aberta={!!detalhe}>
      <ColunasAtendimento
        lista={
          <ListaOperacional
            itens={fila.itens}
            contagens={fila.contagens}
            total={fila.total}
            pagina={fila.pagina}
            tamanho={fila.tamanho}
            apoio={apoio}
            escopo={escopo}
            caixa={caixa}
            papel={s.papel}
          />
        }
        conversa={
          <div className="conversa-atendimento">
            <IndicadorAbrindo conversaAtual={detalhe?.conversa.id ?? null} />
            {detalhe ? (
              <PainelConversa
                key={detalhe.conversa.id}
                detalhe={detalhe}
                apoio={apoio}
                meuMembroId={s.membro.id}
                organizacaoId={s.organizacao.id}
                operacional={operacional?.data || null}
                respostas={respostas}
                fuso={s.organizacao.fuso_horario}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <MessageSquare className="text-produto-700" size={32} />
                <h2 className="text-lg font-semibold">Seu próximo atendimento começa aqui</h2>
                <p className="max-w-sm text-sm text-bruma-600">Selecione uma conversa para responder e organizar a próxima ação.</p>
                <SincronizadorLista organizacaoId={s.organizacao.id} />
              </div>
            )}
          </div>
        }
      />
      {detalhe && (
        <aside className="contexto-atendimento">
          <ContextoContato
            detalhe={detalhe}
            apoio={apoio}
            operacional={operacional?.data || null}
            membroId={s.membro.id}
            fuso={s.organizacao.fuso_horario}
          />
        </aside>
      )}
    </div>
  );
}
