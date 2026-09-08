/**
 * Segurança que dá para verificar sem banco: filtro de segredos no log,
 * limitador de taxa, decisão da IA conferida e nome de arquivo saneado.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { _limparParaTeste } from '@/lib/log';
import { conferirLimite, _limparLimitador } from '@/lib/nucleo/limitador';
import { esquemaDecisaoIa } from '@/lib/ia/esquemas';
import { limparNomeArquivo } from '@/lib/provedores/armazenamento/indice';

describe('log não vaza segredo', () => {
  it('mascara campos sensíveis em qualquer profundidade', () => {
    const limpo = _limparParaTeste({
      organizacao_id: 'org-1',
      apikey: 'sk-superprivado-1234567890',
      dados: {
        authorization: 'Bearer abcdefghijklmno',
        credenciais: { refresh_token: '1//0abcdefghijk' },
      },
    }) as Record<string, unknown>;

    const texto = JSON.stringify(limpo);

    expect(texto).not.toContain('sk-superprivado-1234567890');
    expect(texto).not.toContain('abcdefghijklmno');
    expect(texto).not.toContain('1//0abcdefghijk');

    // O que não é segredo continua legível — senão o log perde a serventia.
    expect(limpo.organizacao_id).toBe('org-1');
  });

  it('mascara variações de nome do mesmo segredo', () => {
    const limpo = _limparParaTeste({
      api_key: 'valor-secreto-aqui',
      SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-secreta',
      segredo_webhook: 'abc123def456',
      senha: 'minhasenha123',
      cookie: 'sb-access-token=xyz',
    }) as Record<string, unknown>;

    const texto = JSON.stringify(limpo);

    expect(texto).not.toContain('valor-secreto-aqui');
    expect(texto).not.toContain('chave-de-servico-secreta');
    expect(texto).not.toContain('abc123def456');
    expect(texto).not.toContain('minhasenha123');
    expect(texto).not.toContain('sb-access-token=xyz');
  });

  it('corta texto longo demais para não estourar a linha de log', () => {
    const limpo = _limparParaTeste({ conteudo: 'a'.repeat(5000) }) as Record<string, string>;
    const conteudo = limpo.conteudo ?? '';

    expect(conteudo.length).toBeLessThan(2100);
    expect(conteudo).toContain('[cortado]');
  });

  it('preserva erro com pilha, que é o que se investiga', () => {
    const limpo = _limparParaTeste(new Error('falhou feio')) as Record<string, unknown>;

    expect(limpo.mensagem).toBe('falhou feio');
    expect(limpo.pilha).toBeTruthy();
  });
});

describe('limitador de taxa', () => {
  beforeEach(() => _limparLimitador());

  it('permite até o limite e bloqueia depois', () => {
    const agora = 1_000_000;

    for (let i = 0; i < 5; i += 1) {
      expect(conferirLimite('chave', 5, 60_000, agora).permitido).toBe(true);
    }

    expect(conferirLimite('chave', 5, 60_000, agora).permitido).toBe(false);
  });

  it('libera quando a janela vira', () => {
    const agora = 1_000_000;

    for (let i = 0; i < 5; i += 1) conferirLimite('chave', 5, 60_000, agora);
    expect(conferirLimite('chave', 5, 60_000, agora).permitido).toBe(false);

    expect(conferirLimite('chave', 5, 60_000, agora + 61_000).permitido).toBe(true);
  });

  it('conta cada chave separadamente', () => {
    const agora = 1_000_000;

    for (let i = 0; i < 5; i += 1) conferirLimite('canal-1', 5, 60_000, agora);

    expect(conferirLimite('canal-1', 5, 60_000, agora).permitido).toBe(false);
    expect(conferirLimite('canal-2', 5, 60_000, agora).permitido).toBe(true);
  });
});

describe('decisão da IA é conferida antes de virar ação', () => {
  const valida = {
    resposta: 'Claro, posso ajudar.',
    precisa_humano: false,
    motivo_humano: null,
    departamento_sugerido: null,
    dados_coletados: [{ campo: 'instituicao', valor: 'Banco X' }],
    memorias: [{ chave: 'prazo', tipo: 'FATO', conteudo: 'Quer resolver este mês' }],
    resumo_atualizado: 'Lead novo interessado.',
    confianca: 0.9,
  };

  it('aceita a decisão no formato combinado', () => {
    const resultado = esquemaDecisaoIa.safeParse(valida);

    expect(resultado.success).toBe(true);
  });

  it('recusa confiança fora do intervalo', () => {
    expect(esquemaDecisaoIa.safeParse({ ...valida, confianca: 1.5 }).success).toBe(false);
    expect(esquemaDecisaoIa.safeParse({ ...valida, confianca: -1 }).success).toBe(false);
  });

  it('recusa tipo de memória inventado', () => {
    const resultado = esquemaDecisaoIa.safeParse({
      ...valida,
      memorias: [{ chave: 'x', tipo: 'INVENTADO', conteudo: 'y' }],
    });

    expect(resultado.success).toBe(false);
  });

  it('recusa campo obrigatório ausente', () => {
    const semConfianca = { ...valida } as Record<string, unknown>;
    delete semConfianca.confianca;

    expect(esquemaDecisaoIa.safeParse(semConfianca).success).toBe(false);
  });

  it('aceita resposta nula quando a IA só transfere', () => {
    const resultado = esquemaDecisaoIa.safeParse({
      ...valida,
      resposta: null,
      precisa_humano: true,
      motivo_humano: 'Assunto jurídico',
      departamento_sugerido: 'juridico',
    });

    expect(resultado.success).toBe(true);
  });
});

describe('nome de arquivo saneado', () => {
  it('remove tentativa de subir de diretório', () => {
    expect(limparNomeArquivo('../../etc/passwd')).toBe('passwd');
    expect(limparNomeArquivo('..\\..\\windows\\system32\\config')).toBe('config');
  });

  it('tira acento sem transformar a palavra em sopa de sublinhados', () => {
    expect(limparNomeArquivo('Relatório Ação.pdf')).toBe('Relatorio_Acao.pdf');
  });

  it('nunca devolve nome vazio', () => {
    expect(limparNomeArquivo('')).toBe('arquivo');
    expect(limparNomeArquivo('///')).toBe('arquivo');
  });

  it('limita o tamanho', () => {
    expect(limparNomeArquivo(`${'a'.repeat(400)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});
