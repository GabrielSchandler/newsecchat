import type { Metadata } from 'next';
import { ScrollText } from 'lucide-react';
import { exigirPapel } from '@/lib/sessao';
import { clienteServidor } from '@/lib/supabase/servidor';
import { Cartao, EstadoVazio, Selo } from '@/componentes/ui/estrutura';
import { descricaoAcao } from '@/lib/auditoria';
import { formatarDataHora } from '@/lib/utilitarios';

export const metadata: Metadata = { title: 'Auditoria' };
export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirPapel('ADMIN');
  const parametros = await searchParams;

  const bruto = Array.isArray(parametros.pagina) ? parametros.pagina[0] : parametros.pagina;
  const pagina = Math.max(1, Number(bruto ?? 1) || 1);

  const supabase = await clienteServidor();
  const { data, count } = await supabase
    .from('registros_auditoria')
    .select('*', { count: 'exact' })
    .eq('organizacao_id', sessao.organizacao.id)
    .order('criado_em', { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  const registros = data ?? [];
  const total = count ?? 0;
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-semibold text-tinta-900">Auditoria</h2>
        <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-bruma-600">
          Quem fez o quê, e quando. Registro só de leitura: nem administrador apaga linha daqui — é
          exatamente isso que o torna útil quando alguém pergunta o que aconteceu.
        </p>
      </div>

      {registros.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<ScrollText className="h-5 w-5" />}
            titulo="Nenhum registro ainda"
            descricao="As ações relevantes aparecem aqui conforme a operação acontece."
          />
        </Cartao>
      ) : (
        <>
          <Cartao className="overflow-hidden">
            <div className="overflow-x-auto rolagem-fina">
              <table className="w-full text-[13px]">
                <thead className="border-b border-bruma-200 bg-bruma-50 text-left text-[12px] text-bruma-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Quando</th>
                    <th className="px-4 py-2 font-medium">Quem</th>
                    <th className="px-4 py-2 font-medium">Ação</th>
                    <th className="px-4 py-2 font-medium">Onde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bruma-100">
                  {registros.map((registro) => (
                    <tr key={registro.id}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-bruma-600">
                        {formatarDataHora(registro.criado_em, sessao.organizacao.fuso_horario)}
                      </td>
                      <td className="px-4 py-2 text-tinta-800">
                        {registro.ator_email ?? (
                          <Selo tom="neutro">
                            {registro.ator_tipo === 'SISTEMA' ? 'sistema' : 'não identificado'}
                          </Selo>
                        )}
                      </td>
                      <td className="px-4 py-2 text-tinta-900">
                        {descricaoAcao[registro.acao] ?? registro.acao}
                      </td>
                      <td className="px-4 py-2 text-bruma-600">
                        {registro.entidade ?? '—'}
                        {registro.entidade_id ? (
                          <span className="ml-1 text-[11px] text-bruma-500">
                            {registro.entidade_id.slice(0, 8)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>

          <div className="flex items-center justify-between text-[13px] text-bruma-600">
            <span>
              {total} registro(s) · página {pagina} de {ultimaPagina}
            </span>
            <div className="flex gap-2">
              {pagina > 1 ? (
                <a
                  href={`/configuracoes/auditoria?pagina=${pagina - 1}`}
                  className="rounded-lg border border-bruma-300 bg-white px-3 py-1.5 font-medium text-tinta-800 hover:bg-bruma-50"
                >
                  Anterior
                </a>
              ) : null}
              {pagina < ultimaPagina ? (
                <a
                  href={`/configuracoes/auditoria?pagina=${pagina + 1}`}
                  className="rounded-lg border border-bruma-300 bg-white px-3 py-1.5 font-medium text-tinta-800 hover:bg-bruma-50"
                >
                  Próxima
                </a>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
