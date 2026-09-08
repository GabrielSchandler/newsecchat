/**
 * Chaves de idempotência.
 *
 * Toda operação que "sai" do sistema (mandar mensagem, importar linha de
 * planilha, processar webhook) recebe uma chave determinística: a mesma
 * entrada gera sempre a mesma chave. Como as colunas correspondentes têm
 * índice único no banco, a segunda tentativa esbarra na constraint em vez
 * de duplicar o efeito.
 *
 * Determinístico é a palavra importante. Uma chave aleatória por tentativa
 * não protegeria de nada: o retry geraria outra chave e mandaria de novo.
 */
import { createHash } from 'node:crypto';

function resumo(...partes: (string | number | null | undefined)[]): string {
  return createHash('sha256').update(partes.map((p) => String(p ?? '')).join('|')).digest('hex');
}

/** Evento de webhook: provedor + id da mensagem no provedor. */
export function chaveEventoWebhook(
  provedor: string,
  instancia: string,
  identificadorEvento: string,
): string {
  return `${provedor}:${instancia}:${identificadorEvento}`;
}

/** Resposta da IA: uma resposta por conversa por mensagem que a disparou. */
export function chaveRespostaIa(conversaId: string, mensagemGatilhoId: string): string {
  return `ia:${conversaId}:${mensagemGatilhoId}`;
}

/** Envio de campanha: um envio por destinatário por campanha. */
export function chaveEnvioCampanha(campanhaId: string, contatoId: string): string {
  return `campanha:${campanhaId}:${contatoId}`;
}

/**
 * Envio manual do atendente. Leva o conteúdo no resumo: mandar a mesma
 * frase de propósito duas vezes é legítimo, então entra também o instante
 * arredondado — repetição em até 5 segundos é clique duplo, não intenção.
 */
export function chaveEnvioManual(
  conversaId: string,
  membroId: string,
  conteudo: string,
  agoraMs: number = Date.now(),
): string {
  const janela = Math.floor(agoraMs / 5000);
  return `manual:${conversaId}:${resumo(membroId, conteudo, janela)}`;
}

/**
 * Linha de planilha. Usa o identificador estável da linha quando existe
 * (uma coluna de id) e cai para número da linha + hash do conteúdo quando
 * não existe — assim, inserir uma linha no meio da planilha não faz o
 * sistema reimportar tudo que ficou abaixo.
 */
export function chaveLinhaPlanilha(
  identificadorLinha: string | null,
  numeroLinha: number,
  conteudoLinha: string[],
): string {
  if (identificadorLinha && identificadorLinha.trim()) {
    return `id:${identificadorLinha.trim()}`;
  }
  return `linha:${numeroLinha}:${resumo(...conteudoLinha).slice(0, 16)}`;
}

/** Hash do conteúdo da linha, para detectar alteração de uma linha já importada. */
export function hashConteudoLinha(conteudoLinha: string[]): string {
  return resumo(...conteudoLinha).slice(0, 32);
}
