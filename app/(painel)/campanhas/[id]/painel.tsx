'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Pause, Play, UserPlus } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { AreaTexto, Campo, Selecao } from '@/componentes/ui/campo';
import {
  Cartao,
  CabecalhoCartao,
  CorpoCartao,
  DescricaoCartao,
  Indicador,
  Selo,
  TituloCartao,
} from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import { formatarDataHora, formatarNumero } from '@/lib/utilitarios';
import { formatarTelefone } from '@/lib/nucleo/telefone';
import type { Campanha, Etiqueta, StatusCampanha, StatusCanal, StatusContatoCampanha } from '@/lib/tipos-banco';
import { adicionarDestinatarios, mudarSituacaoCampanha } from '../acoes';

const TOM: Record<StatusCampanha, 'neutro' | 'produto' | 'alerta' | 'sucesso' | 'erro'> = {
  RASCUNHO: 'neutro',
  AGENDADA: 'alerta',
  EM_EXECUCAO: 'produto',
  PAUSADA: 'alerta',
  CONCLUIDA: 'sucesso',
  CANCELADA: 'erro',
};

const ROTULO_DESTINATARIO: Record<StatusContatoCampanha, string> = {
  PENDENTE: 'na fila',
  RESERVADO: 'enviando',
  ENVIADO: 'enviado',
  FALHOU: 'falhou',
  IGNORADO: 'ignorado',
  RESPONDIDO: 'respondeu',
};

const TOM_DESTINATARIO: Record<StatusContatoCampanha, 'neutro' | 'produto' | 'sucesso' | 'erro' | 'alerta'> = {
  PENDENTE: 'neutro',
  RESERVADO: 'alerta',
  ENVIADO: 'produto',
  FALHOU: 'erro',
  IGNORADO: 'neutro',
  RESPONDIDO: 'sucesso',
};

interface Destinatario {
  id: string;
  contato_id: string;
  status: StatusContatoCampanha;
  erro: string | null;
  motivo_ignorado: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
  conversa_id: string | null;
  nome: string | null;
  telefone: string;
}

export function PainelCampanha({
  campanha,
  canal,
  etiquetas,
  destinatarios,
  fusoHorario,
}: {
  campanha: Campanha;
  canal: { id: string; nome: string; status: StatusCanal; ativo: boolean } | null;
  etiquetas: Etiqueta[];
  destinatarios: Destinatario[];
  fusoHorario: string;
}) {
  const roteador = useRouter();
  const [ocupado, definirOcupado] = React.useState(false);
  const [adicionando, definirAdicionando] = React.useState(false);

  const emExecucao = campanha.status === 'EM_EXECUCAO';

  // Enquanto roda, a página se atualiza para o progresso andar sozinho.
  React.useEffect(() => {
    if (!emExecucao) return;
    const relogio = setInterval(() => roteador.refresh(), 10000);
    return () => clearInterval(relogio);
  }, [emExecucao, roteador]);

  async function mudar(acao: 'INICIAR' | 'PAUSAR' | 'RETOMAR' | 'CANCELAR') {
    definirOcupado(true);
    try {
      const resultado = await mudarSituacaoCampanha(campanha.id, acao);
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível alterar.');
        return;
      }
      if (resultado.aviso) toast.warning(resultado.aviso);
      else toast.success('Campanha atualizada.');
      roteador.refresh();
    } finally {
      definirOcupado(false);
    }
  }

  const taxaResposta =
    campanha.enviados > 0 ? Math.round((campanha.respondidos / campanha.enviados) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-tinta-950">{campanha.nome}</h1>
            <Selo tom={TOM[campanha.status]}>{campanha.status.toLowerCase().replace('_', ' ')}</Selo>
          </div>
          {campanha.descricao ? (
            <p className="mt-1 text-[13.5px] text-bruma-600">{campanha.descricao}</p>
          ) : null}
          <p className="mt-1 text-[12.5px] text-bruma-500">
            Canal: {canal?.nome ?? 'removido'}
            {canal && canal.status !== 'CONECTADO' ? ' (desconectado)' : ''} · envio entre{' '}
            {campanha.janela_inicio.slice(0, 5)} e {campanha.janela_fim.slice(0, 5)} · a cada{' '}
            {campanha.intervalo_minimo_segundos}–{campanha.intervalo_maximo_segundos} s
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(campanha.status === 'RASCUNHO' || campanha.status === 'PAUSADA') ? (
            <Botao
              disabled={ocupado}
              onClick={() => void mudar(campanha.status === 'RASCUNHO' ? 'INICIAR' : 'RETOMAR')}
            >
              <Play className="h-4 w-4" aria-hidden />
              {campanha.status === 'RASCUNHO' ? 'Iniciar' : 'Retomar'}
            </Botao>
          ) : null}

          {emExecucao ? (
            <Botao variante="secundario" disabled={ocupado} onClick={() => void mudar('PAUSAR')}>
              <Pause className="h-4 w-4" aria-hidden />
              Pausar
            </Botao>
          ) : null}

          {campanha.status !== 'CONCLUIDA' && campanha.status !== 'CANCELADA' ? (
            <Botao variante="fantasma" disabled={ocupado} onClick={() => void mudar('CANCELAR')}>
              <Ban className="h-4 w-4" aria-hidden />
              Cancelar
            </Botao>
          ) : null}

          {campanha.status === 'RASCUNHO' || campanha.status === 'PAUSADA' ? (
            <Botao variante="suave" onClick={() => definirAdicionando(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Destinatários
            </Botao>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Total na lista" valor={formatarNumero(campanha.total)} />
        <Indicador
          rotulo="Enviadas"
          valor={formatarNumero(campanha.enviados)}
          detalhe={`${formatarNumero(campanha.processados)} processados`}
        />
        <Indicador
          rotulo="Respostas"
          valor={formatarNumero(campanha.respondidos)}
          detalhe={campanha.enviados > 0 ? `${taxaResposta}% de quem recebeu` : undefined}
          tom="produto"
        />
        <Indicador
          rotulo="Falhas e ignorados"
          valor={formatarNumero(campanha.falhas + campanha.ignorados)}
          detalhe={
            campanha.ignorados > 0 ? `${formatarNumero(campanha.ignorados)} ignorados` : undefined
          }
          tom={campanha.falhas > 0 ? 'alerta' : 'neutro'}
        />
      </div>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Mensagem</TituloCartao>
        </CabecalhoCartao>
        <CorpoCartao>
          <p className="whitespace-pre-wrap rounded-lg bg-bruma-50 px-3 py-2.5 text-[13px] leading-relaxed text-tinta-800">
            {campanha.mensagem}
          </p>

          {Array.isArray(campanha.variacoes) && (campanha.variacoes as unknown[]).length ? (
            <div className="mt-3 space-y-2">
              <p className="text-[12px] font-medium text-bruma-600">
                {(campanha.variacoes as unknown[]).length} variação(ões) para teste A/B
              </p>
              {(campanha.variacoes as unknown[]).map((texto, indice) => (
                <p
                  key={indice}
                  className="whitespace-pre-wrap rounded-lg bg-bruma-50 px-3 py-2 text-[12.5px] leading-relaxed text-tinta-700"
                >
                  {String(texto)}
                </p>
              ))}
            </div>
          ) : null}
        </CorpoCartao>
      </Cartao>

      <Cartao>
        <CabecalhoCartao>
          <TituloCartao>Destinatários</TituloCartao>
          <DescricaoCartao>
            {destinatarios.length >= 200
              ? 'Mostrando os 200 primeiros.'
              : `${destinatarios.length} na lista.`}
          </DescricaoCartao>
        </CabecalhoCartao>

        <CorpoCartao>
          {destinatarios.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-bruma-600">
              Nenhum destinatário ainda. Clique em “Destinatários” para adicionar.
            </p>
          ) : (
            <div className="overflow-x-auto rolagem-fina">
              <table className="w-full text-[13px]">
                <thead className="border-b border-bruma-200 text-left text-[12px] text-bruma-600">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Contato</th>
                    <th className="py-2 pr-3 font-medium">Situação</th>
                    <th className="py-2 pr-3 font-medium">Enviado</th>
                    <th className="py-2 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bruma-100">
                  {destinatarios.map((destinatario) => (
                    <tr key={destinatario.id}>
                      <td className="py-2 pr-3">
                        {destinatario.conversa_id ? (
                          <Link
                            href={`/atendimento?conversa=${destinatario.conversa_id}`}
                            className="font-medium text-produto-700 underline-offset-2 hover:underline"
                          >
                            {destinatario.nome || formatarTelefone(destinatario.telefone)}
                          </Link>
                        ) : (
                          <span className="text-tinta-800">
                            {destinatario.nome || formatarTelefone(destinatario.telefone)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Selo tom={TOM_DESTINATARIO[destinatario.status]}>
                          {ROTULO_DESTINATARIO[destinatario.status]}
                        </Selo>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-bruma-600">
                        {destinatario.enviado_em
                          ? formatarDataHora(destinatario.enviado_em, fusoHorario)
                          : '—'}
                      </td>
                      <td className="py-2 text-bruma-600">
                        {destinatario.erro ?? destinatario.motivo_ignorado ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CorpoCartao>
      </Cartao>

      <DialogoDestinatarios
        aberto={adicionando}
        definirAberto={definirAdicionando}
        campanhaId={campanha.id}
        etiquetas={etiquetas}
      />
    </div>
  );
}

function DialogoDestinatarios({
  aberto,
  definirAberto,
  campanhaId,
  etiquetas,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  campanhaId: string;
  etiquetas: Etiqueta[];
}) {
  const roteador = useRouter();
  const [origem, definirOrigem] = React.useState<'ETIQUETA' | 'TELEFONES' | 'TODOS'>('ETIQUETA');
  const [etiquetaId, definirEtiqueta] = React.useState(etiquetas[0]?.id ?? '');
  const [telefones, definirTelefones] = React.useState('');
  const [salvando, definirSalvando] = React.useState(false);

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo
        titulo="Adicionar destinatários"
        descricao="Contatos bloqueados ou que pediram para não receber campanhas são descartados automaticamente."
      >
        <CorpoDialogo>
          <Campo rotulo="De onde vêm os contatos" htmlFor="dest-origem">
            <Selecao
              id="dest-origem"
              value={origem}
              onChange={(evento) =>
                definirOrigem(evento.target.value as 'ETIQUETA' | 'TELEFONES' | 'TODOS')
              }
            >
              <option value="ETIQUETA">De uma etiqueta</option>
              <option value="TELEFONES">Colar uma lista de telefones</option>
              <option value="TODOS">Todos os contatos que aceitam campanha</option>
            </Selecao>
          </Campo>

          {origem === 'ETIQUETA' ? (
            <Campo rotulo="Etiqueta" htmlFor="dest-etiqueta">
              {etiquetas.length ? (
                <Selecao
                  id="dest-etiqueta"
                  value={etiquetaId}
                  onChange={(evento) => definirEtiqueta(evento.target.value)}
                >
                  {etiquetas.map((etiqueta) => (
                    <option key={etiqueta.id} value={etiqueta.id}>
                      {etiqueta.nome}
                    </option>
                  ))}
                </Selecao>
              ) : (
                <p className="text-[13px] text-bruma-600">
                  Nenhuma etiqueta cadastrada. Crie etiquetas na ficha de um contato.
                </p>
              )}
            </Campo>
          ) : null}

          {origem === 'TELEFONES' ? (
            <Campo
              rotulo="Telefones"
              htmlFor="dest-telefones"
              ajuda="Um por linha (ou separados por vírgula). Quem ainda não é contato vira contato agora. Máximo de 2000 por vez."
            >
              <AreaTexto
                id="dest-telefones"
                value={telefones}
                onChange={(evento) => definirTelefones(evento.target.value)}
                rows={8}
                placeholder={'(11) 99999-9999\n11988887777\n+55 21 97777-6666'}
              />
            </Campo>
          ) : null}

          {origem === 'TODOS' ? (
            <p className="rounded-lg bg-alerta-100/50 px-3 py-2 text-[12.5px] leading-relaxed text-alerta-700">
              Isto inclui toda a base que aceita campanha (até 5000 contatos). Confira o tamanho antes de
              iniciar — o limite diário da campanha continua valendo.
            </p>
          ) : null}
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            carregando={salvando}
            disabled={origem === 'ETIQUETA' && !etiquetaId}
            onClick={async () => {
              definirSalvando(true);
              try {
                const resultado = await adicionarDestinatarios({
                  campanhaId,
                  origem,
                  etiquetaId: origem === 'ETIQUETA' ? etiquetaId : null,
                  telefones: origem === 'TELEFONES' ? telefones : undefined,
                });

                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível adicionar.');
                  return;
                }

                toast.success(
                  `${resultado.adicionados ?? 0} destinatário(s) adicionado(s).${
                    resultado.aviso ? ` ${resultado.aviso}` : ''
                  }`,
                );

                definirAberto(false);
                definirTelefones('');
                roteador.refresh();
              } finally {
                definirSalvando(false);
              }
            }}
          >
            Adicionar
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}
