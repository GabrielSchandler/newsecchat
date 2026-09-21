import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind resolvendo conflitos (a última vence). */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}

const FUSO_PADRAO = 'America/Sao_Paulo';

export function formatarDataHora(valor: string | Date | null | undefined, fuso = FUSO_PADRAO): string {
  if (!valor) return '—';
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

export function formatarHora(valor: string | Date | null | undefined, fuso = FUSO_PADRAO): string {
  if (!valor) return '';
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

/** "agora", "há 5 min", "há 2 h", "ontem", "12/08". */
export function tempoRelativo(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  const data = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(data.getTime())) return '';

  const segundos = Math.floor((Date.now() - data.getTime()) / 1000);

  if (segundos < 60) return 'agora';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `há ${Math.floor(segundos / 3600)} h`;
  if (segundos < 172800) return 'ontem';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_PADRAO,
    day: '2-digit',
    month: '2-digit',
  }).format(data);
}

/** Segundos em "2 min 30 s" — usado nos indicadores de tempo de resposta. */
export function formatarDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || segundos <= 0) return '—';
  if (segundos < 60) return `${Math.round(segundos)} s`;

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) {
    const resto = Math.round(segundos % 60);
    return resto ? `${minutos} min ${resto} s` : `${minutos} min`;
  }

  const horas = Math.floor(minutos / 60);
  const restoMinutos = minutos % 60;
  return restoMinutos ? `${horas} h ${restoMinutos} min` : `${horas} h`;
}

export function formatarNumero(valor: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR').format(valor ?? 0);
}

/** Iniciais para o avatar. */
export function iniciais(nome: string | null | undefined): string {
  if (!nome?.trim()) return '?';
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/** Chave de organização a partir do nome: "GRS Soluções" -> "grs-solucoes". */
export function gerarApelido(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Duração legível da espera corrente, sem confundir com minutos úteis do SLA. */
export function formatarEspera(inicio:string,agora=Date.now()):string{
 const min=Math.max(0,Math.floor((agora-Date.parse(inicio))/60000));
 if(min<60)return min+' min';const horas=Math.floor(min/60);
 if(horas<24)return horas+'h '+min%60+'min';return Math.floor(horas/24)+'d '+horas%24+'h';
}
