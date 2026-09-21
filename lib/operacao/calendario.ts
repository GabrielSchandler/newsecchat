export function dataLocal(instante: Date | string, fuso: string) {
  const partes = new Intl.DateTimeFormat('sv-SE', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante));
  const p = Object.fromEntries(partes.map(i => [i.type, i.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** Converte parede local em instante sem depender do fuso do navegador. Rejeita hora inexistente. */
export function localParaUTC(local: string, fuso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Data e hora inválidas.');
  const alvo = Date.parse(`${local}:00Z`);
  let tentativa = alvo;
  for (let i = 0; i < 4; i++) {
    const observado = Date.parse(`${dataLocal(new Date(tentativa), fuso)}:00Z`);
    tentativa += alvo - observado;
  }
  if (dataLocal(new Date(tentativa), fuso) !== local) throw new Error('Esse horário não existe no fuso selecionado. Escolha outro horário.');
  return new Date(tentativa).toISOString();
}
export function formatarPrazo(instante: string, fuso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(instante));
}
