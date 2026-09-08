import type { Metadata } from 'next';
import { MessageSquareText } from 'lucide-react';
import { exigirSessao } from '@/lib/sessao';
import { EstadoVazio } from '@/componentes/ui/estrutura';
import {
  caixaValida,
  carregarApoio,
  carregarContagens,
  carregarDetalheConversa,
  carregarListaConversas,
} from './dados';
import { ListaConversas } from './lista';
import { PainelConversa } from './conversa';
import { FichaContato } from './ficha';
import { SincronizadorLista } from './sincronizador';

export const metadata: Metadata = { title: 'Atendimento' };

// A central é sempre dinâmica: mostrar uma lista de conversas em cache
// seria mostrar a fila de ontem.
export const dynamic = 'force-dynamic';

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function texto(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor;
}

export default async function PaginaAtendimento({ searchParams }: Parametros) {
  const sessao = await exigirSessao();
  const parametros = await searchParams;

  const caixa = caixaValida(texto(parametros.caixa));
  const departamentoId = texto(parametros.departamento) ?? null;
  const busca = texto(parametros.busca) ?? '';
  const conversaId = texto(parametros.conversa) ?? null;

  const [lista, contagens, apoio, detalhe] = await Promise.all([
    carregarListaConversas(sessao.organizacao.id, sessao.membro.id, {
      caixa,
      departamentoId: departamentoId ?? undefined,
      busca,
    }),
    carregarContagens(sessao.organizacao.id),
    carregarApoio(sessao.organizacao.id),
    conversaId ? carregarDetalheConversa(sessao.organizacao.id, conversaId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="w-[300px] shrink-0">
        <ListaConversas
          lista={lista}
          contagens={contagens}
          departamentos={apoio.departamentos}
          caixaAtual={caixa}
          departamentoAtual={departamentoId}
          buscaAtual={busca}
          conversaSelecionada={conversaId}
        />
      </div>

      {detalhe ? (
        <>
          <div className="min-w-0 flex-1">
            <PainelConversa
              detalhe={detalhe}
              apoio={apoio}
              meuMembroId={sessao.membro.id}
              organizacaoId={sessao.organizacao.id}
            />
          </div>
          <FichaContato detalhe={detalhe} apoio={apoio} />
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-tela">
          {/* Sem conversa aberta, ninguém mantém o tempo real vivo: este
              componente assume esse papel para a lista continuar viva. */}
          <SincronizadorLista organizacaoId={sessao.organizacao.id} />
          <EstadoVazio
            icone={<MessageSquareText className="h-5 w-5" />}
            titulo={
              contagens.todas > 0
                ? 'Escolha uma conversa à esquerda'
                : 'Nenhuma conversa por aqui ainda'
            }
            descricao={
              contagens.todas > 0
                ? 'A lista atualiza sozinha conforme as mensagens chegam.'
                : 'Assim que um cliente enviar mensagem para um número conectado, a conversa aparece aqui. Se ainda não conectou nenhum número, comece por Configurações > Canais de WhatsApp.'
            }
          />
        </div>
      )}
    </div>
  );
}
