/**
 * Normalização de telefone.
 *
 * Errar aqui não dá erro na tela: dá dois contatos para a mesma pessoa e
 * histórico partido ao meio. Por isso o cuidado com o nono dígito.
 */
import { describe, expect, it } from 'vitest';
import {
  formatarTelefone,
  normalizarTelefone,
  paraIdentificadorWhatsapp,
  telefoneDoIdentificadorWhatsapp,
  variantesBrasil,
} from '@/lib/nucleo/telefone';

describe('normalizarTelefone', () => {
  it('aceita as formas que uma pessoa digita', () => {
    expect(normalizarTelefone('(11) 99999-8888')).toBe('5511999998888');
    expect(normalizarTelefone('11999998888')).toBe('5511999998888');
    expect(normalizarTelefone('+55 11 99999-8888')).toBe('5511999998888');
    expect(normalizarTelefone('5511999998888')).toBe('5511999998888');
    expect(normalizarTelefone('0055 11 99999 8888')).toBe('5511999998888');
  });

  it('aceita fixo com DDD', () => {
    expect(normalizarTelefone('(11) 2941-6796')).toBe('551129416796');
  });

  it('recusa o que não dá para interpretar com segurança', () => {
    // Sem DDD não há como adivinhar de onde é. Inventar criaria contato errado.
    expect(normalizarTelefone('99998888')).toBeNull();
    expect(normalizarTelefone('999998888')).toBeNull();
    expect(normalizarTelefone('')).toBeNull();
    expect(normalizarTelefone('abc')).toBeNull();
    expect(normalizarTelefone('1')).toBeNull();
  });

  it('recusa DDD inexistente', () => {
    expect(normalizarTelefone('5501999998888')).toBeNull();
    expect(normalizarTelefone('5510999998888')).toBeNull();
  });

  it('recusa número longo demais', () => {
    expect(normalizarTelefone('5511999998888123456')).toBeNull();
  });

  it('deixa passar número internacional já normalizado', () => {
    expect(normalizarTelefone('351912345678')).toBe('351912345678');
  });
});

describe('variantesBrasil — o problema do nono dígito', () => {
  it('celular com 9 também procura a forma antiga', () => {
    const variantes = variantesBrasil('5511999998888');

    expect(variantes).toContain('5511999998888');
    expect(variantes).toContain('551199998888');
  });

  it('celular antigo também procura a forma com 9', () => {
    const variantes = variantesBrasil('551199998888');

    expect(variantes).toContain('551199998888');
    expect(variantes).toContain('5511999998888');
  });

  it('as duas formas do mesmo número produzem o mesmo conjunto', () => {
    const comNove = variantesBrasil('5511999998888').slice().sort();
    const semNove = variantesBrasil('551199998888').slice().sort();

    expect(comNove).toEqual(semNove);
  });

  it('fixo não ganha nono dígito', () => {
    const variantes = variantesBrasil('551129416796');

    expect(variantes).toEqual(['551129416796']);
  });

  it('telefone inválido não gera variante nenhuma', () => {
    expect(variantesBrasil('123')).toEqual([]);
  });

  it('número de fora do Brasil fica como está', () => {
    expect(variantesBrasil('351912345678')).toEqual(['351912345678']);
  });
});

describe('identificadores do WhatsApp', () => {
  it('extrai o telefone do formato do provedor', () => {
    expect(telefoneDoIdentificadorWhatsapp('5511999998888@s.whatsapp.net')).toBe('5511999998888');
    expect(telefoneDoIdentificadorWhatsapp('5511999998888@c.us')).toBe('5511999998888');
  });

  it('ignora o sufixo de aparelho conectado', () => {
    expect(telefoneDoIdentificadorWhatsapp('5511999998888:12@s.whatsapp.net')).toBe('5511999998888');
  });

  it('grupo, transmissão e status não são contato', () => {
    expect(telefoneDoIdentificadorWhatsapp('123456789-987@g.us')).toBeNull();
    expect(telefoneDoIdentificadorWhatsapp('status@broadcast')).toBeNull();
    expect(telefoneDoIdentificadorWhatsapp('123@lid')).toBeNull();
    expect(telefoneDoIdentificadorWhatsapp('')).toBeNull();
  });

  it('monta o identificador para envio', () => {
    expect(paraIdentificadorWhatsapp('(11) 99999-8888')).toBe('5511999998888@s.whatsapp.net');
  });

  it('recusa montar identificador de telefone inválido', () => {
    expect(() => paraIdentificadorWhatsapp('123')).toThrow();
  });
});

describe('formatarTelefone', () => {
  it('formata celular e fixo brasileiros', () => {
    expect(formatarTelefone('5511999998888')).toBe('+55 (11) 99999-8888');
    expect(formatarTelefone('551129416796')).toBe('+55 (11) 2941-6796');
  });

  it('não quebra com número de fora ou vazio', () => {
    expect(formatarTelefone('351912345678')).toBe('+351912345678');
    expect(formatarTelefone('')).toBe('');
  });
});
