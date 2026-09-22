import { describe, expect, it } from 'vitest';
import {
  contagemDoFiltro,
  escoposDoPapel,
  filtrosDoEscopo,
  lerContagens,
  resolverEscopo,
  resolverFiltro,
  type ContagensAtendimento,
} from '@/lib/operacao/atendimento';

const contagens: ContagensAtendimento = {
  meu: { novos: 1, nao_respondidos: 2, todos: 7 },
  equipe: { novos: 3, nao_respondidos: 4, todos: 20 },
  ia: { todos: 9, falhas: 2 },
};

describe('escopo do atendimento por papel', () => {
  it('atendente vê Meu atendimento e Equipe, mas não a aba da IA', () => {
    expect(escoposDoPapel('ATENDENTE').map((e) => e.id)).toEqual(['meu', 'equipe']);
  });

  it('supervisor, administrador e proprietário veem também a IA, separada', () => {
    for (const papel of ['SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'] as const) {
      expect(escoposDoPapel(papel).map((e) => e.id)).toEqual(['meu', 'equipe', 'ia']);
    }
  });

  it('sem escopo na URL, o padrão é Meu atendimento (como sempre foi)', () => {
    expect(resolverEscopo(undefined, undefined, 'ADMIN')).toBe('meu');
    expect(resolverEscopo('qualquer-coisa', undefined, 'ADMIN')).toBe('meu');
  });

  it('atendente que força escopo=ia na URL volta para Meu atendimento', () => {
    expect(resolverEscopo('ia', undefined, 'ATENDENTE')).toBe('meu');
    expect(resolverEscopo(undefined, 'ia', 'ATENDENTE')).toBe('meu');
  });

  it('link antigo da Supervisão (caixa=ia) abre o escopo IA para quem supervisiona', () => {
    expect(resolverEscopo('equipe', 'ia', 'SUPERVISOR')).toBe('ia');
    expect(resolverEscopo('equipe', 'falhas-ia', 'ADMIN')).toBe('ia');
  });

  it('escopo equipe continua valendo para todos', () => {
    expect(resolverEscopo('equipe', undefined, 'ATENDENTE')).toBe('equipe');
  });
});

describe('filtro do atendimento', () => {
  it('sem filtro na URL, o padrão é Todos', () => {
    expect(resolverFiltro(undefined, 'meu')).toBe('todos');
  });

  it('nos escopos humanos os filtros são Novos, Não respondidos e Todos, nessa ordem', () => {
    expect(filtrosDoEscopo('meu').map((f) => f.id)).toEqual(['novos', 'nao-respondidos', 'todos']);
    expect(filtrosDoEscopo('equipe').map((f) => f.id)).toEqual(['novos', 'nao-respondidos', 'todos']);
  });

  it('na IA não existe "Novos": ninguém abre a conversa, então cai em Todos', () => {
    expect(filtrosDoEscopo('ia').map((f) => f.id)).toEqual(['todos', 'falhas-ia']);
    expect(resolverFiltro('novos', 'ia')).toBe('todos');
    expect(resolverFiltro('nao-respondidos', 'ia')).toBe('todos');
    expect(resolverFiltro('falhas-ia', 'ia')).toBe('falhas-ia');
  });

  it('valor desconhecido cai em Todos em vez de quebrar a tela', () => {
    expect(resolverFiltro('inventado', 'meu')).toBe('todos');
  });

  it('links antigos da Supervisão seguem funcionando como filtro extra', () => {
    for (const antigo of ['responder', 'sem-responsavel', 'vencidos', 'apoio', 'encerradas'] as const) {
      expect(resolverFiltro(antigo, 'equipe')).toBe(antigo);
    }
  });
});

describe('contagem de cada filtro', () => {
  it('cada filtro lê o número do seu escopo', () => {
    expect(contagemDoFiltro(contagens, 'meu', 'novos')).toBe(1);
    expect(contagemDoFiltro(contagens, 'meu', 'nao-respondidos')).toBe(2);
    expect(contagemDoFiltro(contagens, 'meu', 'todos')).toBe(7);
    expect(contagemDoFiltro(contagens, 'equipe', 'todos')).toBe(20);
    expect(contagemDoFiltro(contagens, 'ia', 'todos')).toBe(9);
    expect(contagemDoFiltro(contagens, 'ia', 'falhas-ia')).toBe(2);
  });

  it('filtro sem contagem própria devolve null, e a lista usa o total da consulta', () => {
    expect(contagemDoFiltro(contagens, 'equipe', 'sem-responsavel')).toBeNull();
    expect(contagemDoFiltro(contagens, 'meu', 'encerradas')).toBeNull();
  });

  it('sem contagens (função ausente no banco), tudo devolve null e a tela segue sem números', () => {
    expect(contagemDoFiltro(null, 'meu', 'todos')).toBeNull();
  });
});

describe('leitura das contagens vindas do banco', () => {
  it('lê o formato de atendimento_contagens', () => {
    const lido = lerContagens({
      meu: { novos: 1, nao_respondidos: 2, todos: 7 },
      equipe: { novos: 3, nao_respondidos: 4, todos: 20 },
      ia: { todos: 9, falhas: 2 },
    });

    expect(lido).toEqual(contagens);
  });

  it('formato inesperado não derruba a tela', () => {
    expect(lerContagens(null)).toBeNull();
    expect(lerContagens([1, 2])).toBeNull();
    expect(lerContagens('texto')).toBeNull();
    expect(lerContagens({})?.meu.todos).toBe(0);
  });
});
