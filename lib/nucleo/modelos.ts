/**
 * Substituição de variáveis na mensagem de campanha.
 *
 * Aceita {{nome}}, {{primeiro_nome}}, {{telefone}} e qualquer chave de
 * campo personalizado da organização.
 *
 * Variável sem valor NÃO vira texto vazio no meio da frase — isso produz
 * "Olá , tudo bem?", que denuncia disparo automático. A mensagem cai para
 * um valor de reserva declarado ({{nome|cliente}}) e, se não houver, o
 * envio é recusado para aquele destinatário, que fica registrado como
 * ignorado com o motivo.
 */

export interface DadosModelo {
  nome?: string | null;
  telefone?: string | null;
  [chave: string]: string | null | undefined;
}

export interface ResultadoModelo {
  texto: string;
  faltando: string[];
}

const PADRAO_VARIAVEL = /\{\{\s*([a-zA-Z0-9_:.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return '';
  const limpo = nome.trim().split(/\s+/)[0] ?? '';
  if (!limpo) return '';
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

export function aplicarModelo(modelo: string, dados: DadosModelo): ResultadoModelo {
  const faltando: string[] = [];

  const valores: DadosModelo = {
    ...dados,
    primeiro_nome: primeiroNome(dados.nome),
  };

  const texto = modelo.replace(PADRAO_VARIAVEL, (_correspondencia, chave: string, reserva?: string) => {
    const valor = valores[chave];
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      return String(valor).trim();
    }
    if (reserva !== undefined && reserva !== '') {
      return reserva;
    }
    faltando.push(chave);
    return '';
  });

  return { texto: texto.replace(/[ \t]{2,}/g, ' ').trim(), faltando };
}

/** Nomes de variáveis usados num modelo — a tela mostra ao montar a campanha. */
export function variaveisDoModelo(modelo: string): string[] {
  const encontradas = new Set<string>();
  for (const item of modelo.matchAll(PADRAO_VARIAVEL)) {
    if (item[1]) encontradas.add(item[1]);
  }
  return [...encontradas];
}

/**
 * Escolhe a variação da mensagem. A escolha é determinística pelo id do
 * destinatário: o mesmo contato recebe sempre a mesma variação, mesmo se
 * o envio for retentado — e a comparação entre variações continua
 * honesta, porque ninguém migra de grupo no meio do teste.
 */
export function escolherVariacao(variacoes: string[], padrao: string, contatoId: string): {
  texto: string;
  indice: number | null;
} {
  if (!variacoes.length) return { texto: padrao, indice: null };

  const opcoes = [padrao, ...variacoes];
  let soma = 0;
  for (let i = 0; i < contatoId.length; i += 1) {
    soma = (soma * 31 + contatoId.charCodeAt(i)) % 100000;
  }
  const indice = soma % opcoes.length;
  return { texto: opcoes[indice] ?? padrao, indice: indice === 0 ? null : indice - 1 };
}
