/**
 * Limitador de taxa simples, em memória.
 *
 * Honestidade sobre o alcance: a contagem vive no processo. Com várias
 * instâncias (ou em serverless), cada uma tem a sua janela, então o
 * limite efetivo é o configurado vezes o número de instâncias. Serve para
 * conter repetição acidental e rajada de um cliente mal configurado — não
 * é defesa contra ataque distribuído, que é trabalho de camada de rede.
 *
 * Um limitador compartilhado no Redis é o próximo passo natural, e está
 * anotado como dívida técnica em IMPLEMENTATION_STATUS.md.
 */

interface Janela {
  contagem: number;
  reiniciaEm: number;
}

const janelas = new Map<string, Janela>();

/** Remove janelas vencidas para o mapa não crescer sem limite. */
function limpar(agora: number): void {
  if (janelas.size < 5000) return;
  for (const [chave, janela] of janelas) {
    if (janela.reiniciaEm <= agora) janelas.delete(chave);
  }
}

export interface ResultadoLimite {
  permitido: boolean;
  restante: number;
  reiniciaEmMs: number;
}

export function conferirLimite(
  chave: string,
  limite: number,
  janelaMs: number,
  agora: number = Date.now(),
): ResultadoLimite {
  limpar(agora);

  const atual = janelas.get(chave);

  if (!atual || atual.reiniciaEm <= agora) {
    janelas.set(chave, { contagem: 1, reiniciaEm: agora + janelaMs });
    return { permitido: true, restante: limite - 1, reiniciaEmMs: janelaMs };
  }

  if (atual.contagem >= limite) {
    return { permitido: false, restante: 0, reiniciaEmMs: atual.reiniciaEm - agora };
  }

  atual.contagem += 1;
  return {
    permitido: true,
    restante: limite - atual.contagem,
    reiniciaEmMs: atual.reiniciaEm - agora,
  };
}

export function _limparLimitador(): void {
  janelas.clear();
}
