/**
 * Campanhas: mensagem personalizada, janela de envio e escolha de variação.
 *
 * O risco que estes testes cobrem é o que queima número e denuncia
 * disparo automático: mandar "Olá , tudo bem?" e mandar fora de hora.
 */
import { describe, expect, it } from 'vitest';
import { aplicarModelo, escolherVariacao, primeiroNome, variaveisDoModelo } from '@/lib/nucleo/modelos';
import {
  conferirHorarioAtendimento,
  dentroDaJanela,
  intervaloEntreEnvios,
  milissegundosAteAbrir,
  partesNoFuso,
} from '@/lib/nucleo/janela-envio';

describe('mensagem da campanha', () => {
  it('substitui as variáveis', () => {
    const resultado = aplicarModelo('Olá {{primeiro_nome}}, tudo bem?', {
      nome: 'maria da silva',
      telefone: '5511999998888',
    });

    expect(resultado.texto).toBe('Olá Maria, tudo bem?');
    expect(resultado.faltando).toEqual([]);
  });

  it('acusa variável sem valor em vez de deixar buraco na frase', () => {
    // "Olá , tudo bem?" é o que denuncia disparo em massa.
    const resultado = aplicarModelo('Olá {{primeiro_nome}}, tudo bem?', { nome: null });

    expect(resultado.faltando).toContain('primeiro_nome');
  });

  it('usa o valor de reserva quando declarado', () => {
    const resultado = aplicarModelo('Olá {{primeiro_nome|tudo bem}}!', { nome: null });

    expect(resultado.texto).toBe('Olá tudo bem!');
    expect(resultado.faltando).toEqual([]);
  });

  it('aceita campo personalizado do negócio', () => {
    const resultado = aplicarModelo('Vi que seu contrato é com o {{instituicao}}.', {
      nome: 'João',
      instituicao: 'Banco X',
    });

    expect(resultado.texto).toBe('Vi que seu contrato é com o Banco X.');
  });

  it('valor só com espaços conta como ausente', () => {
    const resultado = aplicarModelo('Oi {{nome}}', { nome: '   ' });

    expect(resultado.faltando).toContain('nome');
  });

  it('lista as variáveis usadas para a tela conferir', () => {
    const variaveis = variaveisDoModelo('Oi {{primeiro_nome}}, seu contrato no {{instituicao|banco}}');

    expect(variaveis).toEqual(['primeiro_nome', 'instituicao']);
  });

  it('primeiroNome normaliza a capitalização', () => {
    expect(primeiroNome('MARIA DA SILVA')).toBe('Maria');
    expect(primeiroNome('joão')).toBe('João');
    expect(primeiroNome(null)).toBe('');
    expect(primeiroNome('   ')).toBe('');
  });
});

describe('variações de mensagem', () => {
  it('o mesmo contato recebe sempre a mesma variação', () => {
    const variacoes = ['Texto A', 'Texto B'];
    const primeira = escolherVariacao(variacoes, 'Padrão', 'contato-123');
    const segunda = escolherVariacao(variacoes, 'Padrão', 'contato-123');

    // Determinístico: um retry não muda o texto que o cliente já recebeu,
    // e a comparação entre variações continua honesta.
    expect(primeira).toEqual(segunda);
  });

  it('sem variações, usa a mensagem padrão', () => {
    const resultado = escolherVariacao([], 'Padrão', 'contato-1');

    expect(resultado.texto).toBe('Padrão');
    expect(resultado.indice).toBeNull();
  });

  it('distribui entre as opções disponíveis', () => {
    const variacoes = ['A', 'B', 'C'];
    const usados = new Set<string>();

    for (let i = 0; i < 60; i += 1) {
      usados.add(escolherVariacao(variacoes, 'Padrão', `contato-${i}`).texto);
    }

    expect(usados.size).toBeGreaterThan(1);
  });
});

describe('janela de envio', () => {
  const janela = {
    inicio: '09:00',
    fim: '18:00',
    diasSemana: [1, 2, 3, 4, 5],
    fuso: 'America/Sao_Paulo',
  };

  it('permite envio dentro do horário em dia útil', () => {
    // Quarta-feira, 14h em São Paulo (17h UTC).
    expect(dentroDaJanela(janela, new Date('2026-09-09T17:00:00Z'))).toBe(true);
  });

  it('bloqueia antes de abrir', () => {
    // 06h em São Paulo.
    expect(dentroDaJanela(janela, new Date('2026-09-09T09:00:00Z'))).toBe(false);
  });

  it('bloqueia depois de fechar', () => {
    // 20h em São Paulo.
    expect(dentroDaJanela(janela, new Date('2026-09-09T23:00:00Z'))).toBe(false);
  });

  it('bloqueia fim de semana quando não está na lista', () => {
    // Domingo, 14h em São Paulo.
    expect(dentroDaJanela(janela, new Date('2026-09-13T17:00:00Z'))).toBe(false);
  });

  it('usa o fuso da organização, não o do servidor', () => {
    // 22h UTC de quarta é 19h em São Paulo (fora da janela) e 17h no Acre
    // (dentro). O mesmo instante decide diferente conforme o fuso — é o
    // que impede uma campanha de Brasília de disparar de madrugada.
    const instante = new Date('2026-09-09T22:00:00Z');

    expect(dentroDaJanela(janela, instante)).toBe(false);
    expect(dentroDaJanela({ ...janela, fuso: 'America/Rio_Branco' }, instante)).toBe(true);
  });

  it('o fim da janela é exclusivo: às 18:00 em ponto já não envia', () => {
    // 21h UTC = 18h em São Paulo. "Até as 18h" não inclui as 18h.
    expect(dentroDaJanela(janela, new Date('2026-09-09T21:00:00Z'))).toBe(false);
    // Um minuto antes ainda envia.
    expect(dentroDaJanela(janela, new Date('2026-09-09T20:59:00Z'))).toBe(true);
  });

  it('entende janela que atravessa a meia-noite', () => {
    const noturna = { inicio: '20:00', fim: '02:00', diasSemana: [1, 2, 3, 4, 5], fuso: 'UTC' };

    expect(dentroDaJanela(noturna, new Date('2026-09-09T21:00:00Z'))).toBe(true);
    expect(dentroDaJanela(noturna, new Date('2026-09-09T01:00:00Z'))).toBe(true);
    expect(dentroDaJanela(noturna, new Date('2026-09-09T10:00:00Z'))).toBe(false);
  });

  it('calcula quanto falta para a janela abrir', () => {
    // Domingo às 14h: a próxima abertura é segunda às 9h.
    const domingo = new Date('2026-09-13T17:00:00Z');
    const espera = milissegundosAteAbrir(janela, domingo);

    expect(espera).toBeGreaterThan(0);
    expect(dentroDaJanela(janela, new Date(domingo.getTime() + espera))).toBe(true);
  });

  it('não espera nada quando a janela já está aberta', () => {
    expect(milissegundosAteAbrir(janela, new Date('2026-09-09T17:00:00Z'))).toBe(0);
  });

  it('o intervalo entre envios respeita o mínimo configurado', () => {
    for (let i = 0; i < 50; i += 1) {
      const intervalo = intervaloEntreEnvios(45, 90);
      expect(intervalo).toBeGreaterThanOrEqual(45_000);
      expect(intervalo).toBeLessThanOrEqual(90_000);
    }
  });

  it('nunca deixa o intervalo cair abaixo de 5 segundos', () => {
    expect(intervaloEntreEnvios(0, 0)).toBeGreaterThanOrEqual(5_000);
  });
});

describe('horário de atendimento da IA', () => {
  it('sem configuração, atende sempre', () => {
    expect(conferirHorarioAtendimento(null).dentro).toBe(true);
    expect(conferirHorarioAtendimento({}).dentro).toBe(true);
    expect(conferirHorarioAtendimento({ dias: {} }).dentro).toBe(true);
  });

  it('reconhece estar dentro do horário', () => {
    const horario = {
      fuso: 'America/Sao_Paulo',
      dias: { '3': ['08:00', '18:00'] },
      fora_do_horario: 'Voltamos amanhã.',
    };

    // Quarta, 14h em São Paulo.
    const resultado = conferirHorarioAtendimento(horario, new Date('2026-09-09T17:00:00Z'));

    expect(resultado.dentro).toBe(true);
    expect(resultado.mensagemForaDoHorario).toBeNull();
  });

  it('devolve a mensagem configurada fora do horário', () => {
    const horario = {
      fuso: 'America/Sao_Paulo',
      dias: { '3': ['08:00', '18:00'] },
      fora_do_horario: 'Voltamos amanhã.',
    };

    // Quarta, 22h em São Paulo.
    const resultado = conferirHorarioAtendimento(horario, new Date('2026-09-10T01:00:00Z'));

    expect(resultado.dentro).toBe(false);
    expect(resultado.mensagemForaDoHorario).toBe('Voltamos amanhã.');
  });

  it('dia sem faixa configurada é dia sem atendimento', () => {
    const horario = { fuso: 'America/Sao_Paulo', dias: { '1': ['08:00', '18:00'] } };

    // Quarta (dia 3), que não está na configuração.
    expect(conferirHorarioAtendimento(horario, new Date('2026-09-09T17:00:00Z')).dentro).toBe(false);
  });
});

describe('partesNoFuso', () => {
  it('converte para o fuso pedido, com dia da semana ISO', () => {
    // 2026-09-09 é uma quarta-feira.
    const partes = partesNoFuso(new Date('2026-09-09T17:00:00Z'), 'America/Sao_Paulo');

    expect(partes.ano).toBe(2026);
    expect(partes.mes).toBe(9);
    expect(partes.dia).toBe(9);
    expect(partes.hora).toBe(14);
    expect(partes.diaSemana).toBe(3);
  });

  it('trata a meia-noite como hora 0', () => {
    const partes = partesNoFuso(new Date('2026-09-09T03:00:00Z'), 'America/Sao_Paulo');

    expect(partes.hora).toBe(0);
  });
});
