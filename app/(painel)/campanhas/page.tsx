import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import {
  Botao,
} from '@/componentes/ui/botao';
import { CabecalhoPagina, Cartao, EstadoVazio, Selo } from '@/componentes/ui/estrutura';
import { formatarDataHora, formatarNumero } from '@/lib/utilitarios';
import type { StatusCampanha } from '@/lib/tipos-banco';

export const metadata: Metadata = { title: 'Campanhas' };
export const dynamic = 'force-dynamic';

const TOM: Record<StatusCampanha, 'neutro' | 'produto' | 'alerta' | 'sucesso' | 'erro'> = {
  RASCUNHO: 'neutro',
  AGENDADA: 'alerta',
  EM_EXECUCAO: 'produto',
  PAUSADA: 'alerta',
  CONCLUIDA: 'sucesso',
  CANCELADA: 'erro',
};

const ROTULO: Record<StatusCampanha, string> = {
  RASCUNHO: 'rascunho',
  AGENDADA: 'agendada',
  EM_EXECUCAO: 'em execução',
  PAUSADA: 'pausada',
  CONCLUIDA: 'concluída',
  CANCELADA: 'cancelada',
};

export default async function PaginaCampanhas() {
  const sessao = await exigirPapel('SUPERVISOR');
  const supabase = await clienteServidor();

  const { data: campanhas } = await supabase
    .from('campanhas')
    .select('*')
    .eq('organizacao_id', sessao.organizacao.id)
    .order('criado_em', { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <CabecalhoPagina
        titulo="Campanhas"
        descricao="Envio em lote com intervalo, janela de horário e respeito ao opt-out. Quem responder cai na central como uma conversa normal — e a IA retoma dali."
        acoes={
          <Botao comoFilho>
            <Link href="/campanhas/nova">
              <Plus className="h-4 w-4" aria-hidden />
              Nova campanha
            </Link>
          </Botao>
        }
      />

      {!campanhas?.length ? (
        <Cartao>
          <EstadoVazio
            icone={<Megaphone className="h-5 w-5" />}
            titulo="Nenhuma campanha criada"
            descricao="Use campanhas para recuperar leads antigos: a mensagem sai espaçada, dentro do horário que você definir, e quem responder entra na central com o histórico junto."
            acao={
              <Botao comoFilho>
                <Link href="/campanhas/nova">Criar a primeira</Link>
              </Botao>
            }
          />
        </Cartao>
      ) : (
        <div className="space-y-3">
          {campanhas.map((campanha) => {
            const progresso =
              campanha.total > 0 ? Math.round((campanha.processados / campanha.total) * 100) : 0;

            return (
              <Cartao key={campanha.id}>
                <Link
                  href={`/campanhas/${campanha.id}`}
                  className="block px-5 py-4 transition-colors hover:bg-bruma-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-semibold text-tinta-900">{campanha.nome}</h2>
                        <Selo tom={TOM[campanha.status]}>{ROTULO[campanha.status]}</Selo>
                      </div>
                      {campanha.descricao ? (
                        <p className="mt-0.5 line-clamp-1 text-[13px] text-bruma-600">
                          {campanha.descricao}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[12px] text-bruma-500">
                        Criada em {formatarDataHora(campanha.criado_em)}
                        {campanha.iniciada_em
                          ? ` · iniciada em ${formatarDataHora(campanha.iniciada_em)}`
                          : ''}
                      </p>
                    </div>

                    <dl className="flex gap-4 text-right">
                      <div>
                        <dt className="text-[11px] text-bruma-500">Enviadas</dt>
                        <dd className="text-[15px] font-semibold tabular-nums text-tinta-900">
                          {formatarNumero(campanha.enviados)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-bruma-500">Respostas</dt>
                        <dd className="text-[15px] font-semibold tabular-nums text-produto-700">
                          {formatarNumero(campanha.respondidos)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-bruma-500">Total</dt>
                        <dd className="text-[15px] font-semibold tabular-nums text-bruma-600">
                          {formatarNumero(campanha.total)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {campanha.total > 0 ? (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bruma-100">
                        <div
                          className="h-full rounded-full bg-produto-700 transition-all"
                          style={{ width: `${progresso}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11.5px] text-bruma-500">
                        {formatarNumero(campanha.processados)} de {formatarNumero(campanha.total)}{' '}
                        processados
                        {campanha.falhas > 0 ? ` · ${formatarNumero(campanha.falhas)} falha(s)` : ''}
                        {campanha.ignorados > 0
                          ? ` · ${formatarNumero(campanha.ignorados)} ignorado(s)`
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-[12.5px] text-alerta-700">
                      Nenhum destinatário adicionado ainda.
                    </p>
                  )}
                </Link>
              </Cartao>
            );
          })}
        </div>
      )}
    </div>
  );
}
