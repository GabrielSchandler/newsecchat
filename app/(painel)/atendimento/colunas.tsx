'use client';

import * as React from 'react';

const CHAVE_LARGURA = 'newsec:atendimento:largura-lista';
const LARGURA_PADRAO = 320;
const LARGURA_MINIMA = 260;
const LARGURA_MAXIMA = 560;

/**
 * Divisor arrastável entre a lista de conversas e a conversa aberta.
 *
 * A largura fica só neste navegador (localStorage) — não é preferência do
 * produto, é ajuste de quem está com a tela pequena. Os limites evitam dois
 * jeitos de quebrar o layout: estreito demais espreme os botões dos
 * filtros (3 por linha) até sobrepor; largo demais deixa pouco espaço para
 * a conversa, que é o que a pessoa está ali para ler.
 */
export function ColunasAtendimento({ lista, conversa }: { lista: React.ReactNode; conversa: React.ReactNode }) {
  const [largura, definirLargura] = React.useState(LARGURA_PADRAO);
  const arrastando = React.useRef(false);
  const referenciaLista = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      const salva = Number(localStorage.getItem(CHAVE_LARGURA));
      if (salva >= LARGURA_MINIMA && salva <= LARGURA_MAXIMA) definirLargura(salva);
    } catch { /* sem storage, fica na largura padrão */ }
  }, []);

  const mover = React.useCallback((evento: PointerEvent) => {
    if (!arrastando.current || !referenciaLista.current) return;
    const inicioLista = referenciaLista.current.getBoundingClientRect().left;
    const proxima = Math.min(LARGURA_MAXIMA, Math.max(LARGURA_MINIMA, evento.clientX - inicioLista));
    definirLargura(proxima);
  }, []);

  const soltar = React.useCallback(() => {
    if (!arrastando.current) return;
    arrastando.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    definirLargura((atual) => {
      try { localStorage.setItem(CHAVE_LARGURA, String(atual)); } catch { /* largura não persiste, sem problema */ }
      return atual;
    });
  }, []);

  React.useEffect(() => {
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
  }, [mover, soltar]);

  function comecarArraste(evento: React.PointerEvent) {
    evento.preventDefault();
    arrastando.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function pelaTeclado(evento: React.KeyboardEvent) {
    const passo = evento.shiftKey ? 40 : 12;
    if (evento.key === 'ArrowLeft') definirLargura((atual) => Math.max(LARGURA_MINIMA, atual - passo));
    else if (evento.key === 'ArrowRight') definirLargura((atual) => Math.min(LARGURA_MAXIMA, atual + passo));
    else return;
    evento.preventDefault();
  }

  return (
    <>
      {/*
        A largura vai como variável CSS (--largura-lista), não como
        `style.width` direto: assim a media query de celular em
        globals.css consegue vencer no cascata e forçar 100% sem precisar
        de !important nem de JS checando o tamanho da tela.
      */}
      <div
        ref={referenciaLista}
        className="lista-atendimento"
        style={{ '--largura-lista': `${largura}px` } as React.CSSProperties}
      >
        {/*
          `key` num Fragment sem lista pode parecer redundante, mas sem ele o
          React avisa "Each child in a list should have a unique key prop"
          durante a hidratação — `lista` e `conversa` chegam aqui como duas
          árvores renderizadas no servidor, passadas como props (não como
          `children`), e é assim que o React as reconcilia nesse formato.
        */}
        <React.Fragment key="lista">{lista}</React.Fragment>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar a lista de conversas"
        aria-valuenow={Math.round(largura)}
        aria-valuemin={LARGURA_MINIMA}
        aria-valuemax={LARGURA_MAXIMA}
        tabIndex={0}
        onPointerDown={comecarArraste}
        onKeyDown={pelaTeclado}
        className="divisor-atendimento"
      />
      <React.Fragment key="conversa">{conversa}</React.Fragment>
    </>
  );
}
