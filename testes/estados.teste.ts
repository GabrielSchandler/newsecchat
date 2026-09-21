/**
 * A regra mais importante do produto: IA e humano nunca respondem juntos.
 *
 * Estes testes cobrem a versão em TypeScript da máquina de estados. A
 * garantia sob concorrência é do banco (`testes/banco.teste.ts`), mas é
 * aqui que se verifica que a interface nunca vai OFERECER a ação errada.
 */
import { describe, expect, it } from 'vitest';
import {
  acoesDisponiveis,
  ESTADOS,
  estaAberta,
  estaComHumano,
  estadoAoReceberMensagem,
  iaPodeResponder,
  proximoEstado,
  transicaoPermitida,
  type EstadoConversa,
} from '@/lib/nucleo/estados';

describe('máquina de estados da conversa', () => {
  it('a IA responde apenas quando está ativa', () => {
    expect(iaPodeResponder('IA')).toBe(true);
    expect(iaPodeResponder('AGUARDANDO_HUMANO')).toBe(false);

    for (const estado of ['HUMANO', 'AGUARDANDO_CLIENTE', 'ENCERRADA'] as const) {
      expect(iaPodeResponder(estado)).toBe(false);
    }
  });

  it('humano assumindo tira a conversa da IA', () => {
    expect(proximoEstado('IA', 'HUMANO_ASSUMIU')).toBe('HUMANO');
    expect(proximoEstado('AGUARDANDO_CLIENTE', 'HUMANO_ASSUMIU')).toBe('HUMANO');
    expect(proximoEstado('AGUARDANDO_HUMANO', 'HUMANO_ASSUMIU')).toBe('HUMANO');
  });

  it('cliente respondendo NÃO devolve a conversa para a IA quando um humano assumiu', () => {
    // O caso que o produto promete resolver: depois do humano assumir, a
    // mensagem do cliente mantém a conversa com ele.
    expect(estadoAoReceberMensagem('HUMANO')).toBe('HUMANO');
    expect(iaPodeResponder(estadoAoReceberMensagem('HUMANO'))).toBe(false);
  });

  it('cliente respondendo devolve para a IA só quando ela ainda estava no comando', () => {
    expect(estadoAoReceberMensagem('AGUARDANDO_CLIENTE')).toBe('IA');
    expect(estadoAoReceberMensagem('IA')).toBe('IA');
  });

  it('conversa na fila humana continua na fila quando o cliente insiste, e a IA permanece pausada', () => {
    expect(estadoAoReceberMensagem('AGUARDANDO_HUMANO')).toBe('AGUARDANDO_HUMANO');
    expect(iaPodeResponder('AGUARDANDO_HUMANO')).toBe(false);
  });

  it('a IA só volta por ação explícita de devolução', () => {
    expect(proximoEstado('HUMANO', 'DEVOLVER_PARA_IA')).toBe('IA');
    expect(proximoEstado('AGUARDANDO_HUMANO', 'DEVOLVER_PARA_IA')).toBe('IA');

    // Não existe caminho automático de volta.
    expect(proximoEstado('HUMANO', 'MENSAGEM_DO_CLIENTE')).toBe('HUMANO');
    expect(proximoEstado('HUMANO', 'IA_RESPONDEU')).toBeNull();
  });

  it('a IA não pode responder depois que um humano assumiu de verdade', () => {
    expect(transicaoPermitida('HUMANO', 'IA_RESPONDEU')).toBe(false);
    expect(transicaoPermitida('ENCERRADA', 'IA_RESPONDEU')).toBe(false);
  });

  it('a fila humana recusa respostas da IA', () => {
    expect(transicaoPermitida('AGUARDANDO_HUMANO', 'IA_RESPONDEU')).toBe(false);
    // Fica em AGUARDANDO_HUMANO, não em AGUARDANDO_CLIENTE — senão a
    // conversa sumiria da fila de espera sem ninguém ter assumido.
    expect(proximoEstado('AGUARDANDO_HUMANO', 'IA_RESPONDEU')).toBeNull();
  });

  it('transferir departamento sempre deixa a conversa em fila humana', () => {
    for (const estado of ['IA', 'AGUARDANDO_CLIENTE', 'HUMANO', 'AGUARDANDO_HUMANO'] as const) {
      expect(proximoEstado(estado, 'TRANSFERIR_DEPARTAMENTO')).toBe('AGUARDANDO_HUMANO');
    }
  });

  it('conversa encerrada não aceita mensagem nem resposta', () => {
    expect(proximoEstado('ENCERRADA', 'MENSAGEM_DO_CLIENTE')).toBeNull();
    expect(proximoEstado('ENCERRADA', 'IA_RESPONDEU')).toBeNull();
    expect(proximoEstado('ENCERRADA', 'HUMANO_ASSUMIU')).toBeNull();
    expect(estaAberta('ENCERRADA')).toBe(false);
  });

  it('reabrir é possível para humano ou para IA', () => {
    expect(proximoEstado('ENCERRADA', 'REABRIR_PARA_HUMANO')).toBe('HUMANO');
    expect(proximoEstado('ENCERRADA', 'REABRIR_PARA_IA')).toBe('IA');
  });

  it('a IA respondendo passa a conversa para "aguardando cliente"', () => {
    expect(proximoEstado('IA', 'IA_RESPONDEU')).toBe('AGUARDANDO_CLIENTE');
  });

  it('encerrar funciona de qualquer estado aberto', () => {
    for (const estado of ESTADOS.filter((item) => item !== 'ENCERRADA')) {
      expect(proximoEstado(estado, 'ENCERRAR')).toBe('ENCERRADA');
    }
  });

  it('estaComHumano cobre a conversa assumida e a que está na fila', () => {
    expect(estaComHumano('HUMANO')).toBe(true);
    expect(estaComHumano('AGUARDANDO_HUMANO')).toBe(true);
    expect(estaComHumano('IA')).toBe(false);
    expect(estaComHumano('AGUARDANDO_CLIENTE')).toBe(false);
  });

  it('nenhum estado oferece ao mesmo tempo resposta da IA e resposta humana', () => {
    // Uma conversa em que as duas ações estão disponíveis seria
    // exatamente a porta para os dois falarem juntos.
    for (const estado of ESTADOS) {
      const acoes = acoesDisponiveis(estado);
      const temIa = acoes.includes('IA_RESPONDEU');
      const temHumano = acoes.includes('HUMANO_RESPONDEU');
      expect(temIa && temHumano).toBe(false);
    }
  });

  it('toda transição declarada leva a um estado conhecido', () => {
    for (const estado of ESTADOS) {
      for (const acao of acoesDisponiveis(estado)) {
        const destino = proximoEstado(estado, acao) as EstadoConversa;
        expect(ESTADOS).toContain(destino);
      }
    }
  });
});
