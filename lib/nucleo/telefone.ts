/**
 * Normalização de telefone.
 *
 * Todo telefone é guardado em E.164 sem o "+": 5511999999999. Se cada
 * ponto de entrada (webhook, planilha, cadastro manual) guardasse do seu
 * jeito, o mesmo cliente viraria três contatos e o histórico se perderia
 * — que é exatamente o que não pode acontecer.
 *
 * O caso brasileiro tem uma armadilha conhecida: o nono dígito. O mesmo
 * celular aparece como 551199999999 (antigo, 8 dígitos) e
 * 5511999999999 (com o 9). `variantesBrasil` devolve as duas formas para
 * a busca de contato existente conseguir casar as duas.
 */

const DDI_PADRAO = '55';

export function apenasDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/**
 * Extrai o telefone de um identificador do WhatsApp.
 * Aceita "5511999999999@s.whatsapp.net", "5511999999999@c.us" ou o número cru.
 * Grupos (@g.us) e transmissões não são contato: devolve null.
 */
export function telefoneDoIdentificadorWhatsapp(identificador: string): string | null {
  if (!identificador) return null;
  if (identificador.includes('@g.us')) return null;
  if (identificador.includes('broadcast')) return null;
  if (identificador.includes('@lid')) return null;

  const parte = identificador.split('@')[0] ?? '';
  // Alguns provedores devolvem "5511999999999:12" (aparelho conectado).
  const semDispositivo = parte.split(':')[0] ?? '';
  return normalizarTelefone(semDispositivo);
}

/**
 * Devolve o telefone em E.164 sem "+", ou null se não der para
 * interpretar com segurança. Nunca adivinha DDD.
 */
export function normalizarTelefone(entrada: string, ddiPadrao = DDI_PADRAO): string | null {
  let digitos = apenasDigitos(entrada);
  if (!digitos) return null;

  // "00" internacional na frente.
  if (digitos.startsWith('00')) digitos = digitos.slice(2);

  // Número nacional sem DDI: 10 (fixo com DDD) ou 11 (celular com DDD).
  if (digitos.length === 10 || digitos.length === 11) {
    digitos = ddiPadrao + digitos;
  }

  // Sem DDD não dá para saber de onde é. Melhor recusar do que inventar.
  if (digitos.length < 11) return null;
  if (digitos.length > 15) return null;

  if (digitos.startsWith(DDI_PADRAO)) {
    const nacional = digitos.slice(2);
    // Brasil válido: DDD (2) + 8 ou 9 dígitos.
    if (nacional.length !== 10 && nacional.length !== 11) return null;
    const ddd = Number(nacional.slice(0, 2));
    if (ddd < 11 || ddd > 99) return null;
  }

  return digitos;
}

/**
 * Formas possíveis do mesmo número no Brasil (com e sem o nono dígito).
 * Para números de fora, devolve só a forma normalizada.
 */
export function variantesBrasil(telefone: string): string[] {
  const normalizado = normalizarTelefone(telefone);
  if (!normalizado) return [];
  if (!normalizado.startsWith(DDI_PADRAO)) return [normalizado];

  const ddd = normalizado.slice(2, 4);
  const assinante = normalizado.slice(4);
  const variantes = new Set<string>([normalizado]);

  if (assinante.length === 9 && assinante.startsWith('9')) {
    variantes.add(`${DDI_PADRAO}${ddd}${assinante.slice(1)}`);
  }

  // Só celular ganha o nono dígito. Fixo começa com 2–5 e fica como está.
  if (assinante.length === 8 && /^[6-9]/.test(assinante)) {
    variantes.add(`${DDI_PADRAO}${ddd}9${assinante}`);
  }

  return [...variantes];
}

/** Formatação para a tela: +55 (11) 99999-9999. */
export function formatarTelefone(telefone: string): string {
  const digitos = apenasDigitos(telefone);
  if (!digitos) return '';

  if (digitos.startsWith(DDI_PADRAO) && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = digitos.slice(2, 4);
    const assinante = digitos.slice(4);
    const meio = assinante.length === 9 ? assinante.slice(0, 5) : assinante.slice(0, 4);
    const fim = assinante.length === 9 ? assinante.slice(5) : assinante.slice(4);
    return `+55 (${ddd}) ${meio}-${fim}`;
  }

  return `+${digitos}`;
}

/** Identificador aceito pela Evolution API no envio. */
export function paraIdentificadorWhatsapp(telefone: string): string {
  const normalizado = normalizarTelefone(telefone);
  if (!normalizado) throw new Error(`Telefone inválido: ${telefone}`);
  return `${normalizado}@s.whatsapp.net`;
}
