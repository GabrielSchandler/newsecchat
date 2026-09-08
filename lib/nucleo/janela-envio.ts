/**
 * Janela de envio de campanha e horário de atendimento da IA.
 *
 * Tudo é calculado no fuso da organização, não no fuso do servidor — o
 * worker roda numa VPS que pode estar em qualquer lugar, e uma campanha
 * que deveria começar às 9h de Brasília não pode disparar às 6h da manhã
 * porque o container está em UTC.
 *
 * O cálculo usa `Intl.DateTimeFormat` com `timeZone`, que já resolve
 * horário de verão sem tabela própria.
 */

export interface JanelaEnvio {
  /** "09:00" */
  inicio: string;
  /** "18:00" */
  fim: string;
  /** ISO: 1 = segunda ... 7 = domingo */
  diasSemana: number[];
  fuso: string;
}

interface PartesLocais {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** ISO: 1 = segunda ... 7 = domingo */
  diaSemana: number;
}

const DIAS_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function partesNoFuso(instante: Date, fuso: string): PartesLocais {
  const formatador = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const partes = Object.fromEntries(
    formatador.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  ) as Record<string, string>;

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    // "24" aparece à meia-noite em algumas plataformas com hour12: false.
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
    diaSemana: DIAS_ISO[partes.weekday ?? 'Mon'] ?? 1,
  };
}

function paraMinutos(horario: string): number {
  const [hora = '0', minuto = '0'] = horario.split(':');
  return Number(hora) * 60 + Number(minuto);
}

export function dentroDaJanela(janela: JanelaEnvio, instante: Date = new Date()): boolean {
  const local = partesNoFuso(instante, janela.fuso);

  if (!janela.diasSemana.includes(local.diaSemana)) return false;

  const agora = local.hora * 60 + local.minuto;
  const inicio = paraMinutos(janela.inicio);
  const fim = paraMinutos(janela.fim);

  // Janela que atravessa a meia-noite (ex.: 20:00 às 02:00).
  if (fim <= inicio) {
    return agora >= inicio || agora < fim;
  }

  return agora >= inicio && agora < fim;
}

/**
 * Quantos milissegundos faltam até a janela abrir. Zero se já está aberta.
 * O worker usa isso para agendar o próximo ciclo em vez de acordar de
 * minuto em minuto durante a madrugada inteira.
 */
export function milissegundosAteAbrir(janela: JanelaEnvio, instante: Date = new Date()): number {
  if (dentroDaJanela(janela, instante)) return 0;

  const umMinuto = 60_000;
  // Procura minuto a minuto até 8 dias à frente. É barato (no máximo
  // ~11 mil iterações de aritmética) e evita reimplementar calendário
  // com horário de verão.
  for (let passo = 1; passo <= 8 * 24 * 60; passo += 1) {
    const candidato = new Date(instante.getTime() + passo * umMinuto);
    if (dentroDaJanela(janela, candidato)) {
      return passo * umMinuto;
    }
  }

  return 24 * 60 * umMinuto;
}

/** Intervalo aleatório entre dois envios, dentro do que a campanha define. */
export function intervaloEntreEnvios(minimoSegundos: number, maximoSegundos: number): number {
  const minimo = Math.max(5, minimoSegundos);
  const maximo = Math.max(minimo, maximoSegundos);
  const segundos = minimo + Math.random() * (maximo - minimo);
  return Math.round(segundos * 1000);
}

// ---------------------------------------------------------------------
// Horário de atendimento da IA
// ---------------------------------------------------------------------

export interface HorarioAtendimento {
  fuso?: string;
  /** { "1": ["08:00", "18:00"] } — 1 = segunda ... 7 = domingo */
  dias?: Record<string, [string, string] | string[]>;
  fora_do_horario?: string;
}

export interface ResultadoHorario {
  dentro: boolean;
  mensagemForaDoHorario: string | null;
}

export function conferirHorarioAtendimento(
  horario: HorarioAtendimento | null | undefined,
  instante: Date = new Date(),
): ResultadoHorario {
  // Sem horário configurado, atende sempre. É o padrão menos surpreendente:
  // ninguém espera que a IA fique muda por falta de preenchimento.
  if (!horario || !horario.dias || Object.keys(horario.dias).length === 0) {
    return { dentro: true, mensagemForaDoHorario: null };
  }

  const fuso = horario.fuso || 'America/Sao_Paulo';
  const local = partesNoFuso(instante, fuso);
  const faixa = horario.dias[String(local.diaSemana)];

  if (!faixa || faixa.length < 2) {
    return {
      dentro: false,
      mensagemForaDoHorario: horario.fora_do_horario ?? null,
    };
  }

  const dentro = dentroDaJanela(
    {
      inicio: faixa[0] as string,
      fim: faixa[1] as string,
      diasSemana: [local.diaSemana],
      fuso,
    },
    instante,
  );

  return {
    dentro,
    mensagemForaDoHorario: dentro ? null : horario.fora_do_horario ?? null,
  };
}
