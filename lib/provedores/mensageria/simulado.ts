/**
 * Provedor de mensageria simulado.
 *
 * Não é enfeite de demonstração: é o que permite rodar a aplicação
 * inteira — receber mensagem, IA responder, atendente assumir — sem ter
 * a Evolution API no ar. Serve para desenvolvimento e para os testes que
 * cobrem o fluxo de ponta a ponta.
 *
 * Ele NUNCA entrega nada a um WhatsApp real: guarda o que "enviou" em
 * memória e devolve identificadores próprios. Um canal só usa este
 * provedor se estiver marcado como SIMULADO no cadastro.
 */
import {
  type CanalDeEnvio,
  type EventoNormalizado,
  type MidiaParaEnvio,
  type MidiaRecebida,
  type ProvedorMensageria,
  type ResultadoConexao,
  type RespostaEnvio,
} from './contrato';
import { normalizarTelefone } from '@/lib/nucleo/telefone';

export interface EnvioSimulado {
  canalId: string;
  telefone: string;
  texto: string | null;
  midia: MidiaParaEnvio | null;
  identificadorExterno: string;
  em: string;
}

export class ProvedorSimulado implements ProvedorMensageria {
  readonly nome = 'SIMULADO' as const;

  /** Tudo que foi "enviado". Os testes leem daqui. */
  readonly enviados: EnvioSimulado[] = [];

  private conexoes = new Map<string, ResultadoConexao>();

  async provisionar(): Promise<void> {
    // Nada a provisionar: a instância simulada existe por existir.
  }

  async configurarWebhook(): Promise<void> {
    // Sem webhook: os eventos entram pela própria aplicação nos testes.
  }

  async conectar(canal: CanalDeEnvio): Promise<ResultadoConexao> {
    const resultado: ResultadoConexao = {
      status: 'CONECTADO',
      qrCodeBase64: null,
      codigo: null,
    };
    this.conexoes.set(canal.identificador_externo, resultado);
    return resultado;
  }

  async desconectar(canal: CanalDeEnvio): Promise<void> {
    this.conexoes.set(canal.identificador_externo, { status: 'DESCONECTADO' });
  }

  async remover(canal: CanalDeEnvio): Promise<void> {
    this.conexoes.delete(canal.identificador_externo);
  }

  async statusConexao(canal: CanalDeEnvio): Promise<ResultadoConexao> {
    return this.conexoes.get(canal.identificador_externo) ?? { status: 'DESCONECTADO' };
  }

  async enviarTexto(canal: CanalDeEnvio, telefone: string, texto: string): Promise<RespostaEnvio> {
    const numero = normalizarTelefone(telefone);
    if (!numero) throw new Error(`Telefone inválido: ${telefone}`);

    const identificadorExterno = `simulado-${this.enviados.length + 1}-${Date.now()}`;
    const em = new Date().toISOString();

    this.enviados.push({
      canalId: canal.id,
      telefone: numero,
      texto,
      midia: null,
      identificadorExterno,
      em,
    });

    return { identificadorExterno, enviadoEm: em };
  }

  async enviarMidia(
    canal: CanalDeEnvio,
    telefone: string,
    midia: MidiaParaEnvio,
  ): Promise<RespostaEnvio> {
    const numero = normalizarTelefone(telefone);
    if (!numero) throw new Error(`Telefone inválido: ${telefone}`);

    const identificadorExterno = `simulado-midia-${this.enviados.length + 1}-${Date.now()}`;
    const em = new Date().toISOString();

    this.enviados.push({
      canalId: canal.id,
      telefone: numero,
      texto: midia.legenda ?? null,
      midia,
      identificadorExterno,
      em,
    });

    return { identificadorExterno, enviadoEm: em };
  }

  async baixarMidia(_canal: CanalDeEnvio, midia: MidiaRecebida): Promise<Buffer> {
    return Buffer.from(`conteudo-simulado:${midia.referencia}`, 'utf8');
  }

  async buscarFotoPerfil(): Promise<string | null> {
    // Ambiente fictício: nunca há foto de verdade para trazer.
    return null;
  }

  interpretarEvento(carga: unknown): EventoNormalizado {
    // No simulado, a carga já chega no formato normalizado.
    if (carga && typeof carga === 'object' && 'tipo' in carga) {
      return carga as EventoNormalizado;
    }
    return {
      tipo: 'IGNORADO',
      identificadorEvento: `simulado-${Date.now()}`,
      instancia: '',
      motivo: 'Carga simulada fora do formato',
    };
  }

  limpar(): void {
    this.enviados.length = 0;
    this.conexoes.clear();
  }
}
