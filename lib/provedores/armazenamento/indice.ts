/**
 * Armazenamento de arquivos.
 *
 * Implementação atual: Supabase Storage, bucket privado `midias`. O
 * caminho SEMPRE começa pelo id da organização — é o que a política do
 * bucket confere para impedir que uma empresa leia o arquivo de outra.
 *
 * Nenhuma URL pública é gerada: o acesso sai por URL assinada com prazo
 * curto, pedida no servidor a cada exibição.
 */
import { clienteAdministrador } from '@/lib/supabase/administrador';

export interface ArquivoParaGuardar {
  organizacaoId: string;
  conteudo: Buffer;
  nomeArquivo: string;
  tipoMime: string;
}

export interface ArquivoGuardado {
  caminho: string;
  tamanhoBytes: number;
}

export interface ProvedorArmazenamento {
  readonly nome: string;
  guardar(arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado>;
  urlTemporaria(caminho: string, segundos?: number): Promise<string>;
  baixar(caminho: string): Promise<Buffer>;
  remover(caminho: string): Promise<void>;
}

const BALDE = 'midias';

/** Tira do nome do arquivo tudo que pode virar travessia de diretório. */
export function limparNomeArquivo(nome: string): string {
  const semCaminho = nome.split(/[\\/]/).pop() ?? 'arquivo';
  const limpo = semCaminho
    // NFD separa a letra do acento; o intervalo abaixo é o dos sinais
    // combinantes, então "relatório.pdf" vira "relatorio.pdf" em vez de
    // "relat_rio.pdf".
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120);
  return limpo || 'arquivo';
}

class ArmazenamentoSupabase implements ProvedorArmazenamento {
  readonly nome = 'SUPABASE';

  async guardar(arquivo: ArquivoParaGuardar): Promise<ArquivoGuardado> {
    const agora = new Date();
    const nome = limparNomeArquivo(arquivo.nomeArquivo);
    const caminho = [
      arquivo.organizacaoId,
      agora.getUTCFullYear(),
      String(agora.getUTCMonth() + 1).padStart(2, '0'),
      `${crypto.randomUUID()}-${nome}`,
    ].join('/');

    const { error } = await clienteAdministrador()
      .storage.from(BALDE)
      .upload(caminho, arquivo.conteudo, {
        contentType: arquivo.tipoMime,
        upsert: false,
      });

    if (error) {
      throw new Error(`Não foi possível guardar o arquivo: ${error.message}`);
    }

    return { caminho, tamanhoBytes: arquivo.conteudo.byteLength };
  }

  async urlTemporaria(caminho: string, segundos = 3600): Promise<string> {
    const { data, error } = await clienteAdministrador()
      .storage.from(BALDE)
      .createSignedUrl(caminho, segundos);

    if (error || !data) {
      throw new Error(`Não foi possível gerar o link do arquivo: ${error?.message ?? 'sem retorno'}`);
    }

    return data.signedUrl;
  }

  async baixar(caminho: string): Promise<Buffer> {
    const { data, error } = await clienteAdministrador().storage.from(BALDE).download(caminho);

    if (error || !data) {
      throw new Error(`Não foi possível baixar o arquivo: ${error?.message ?? 'sem retorno'}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async remover(caminho: string): Promise<void> {
    const { error } = await clienteAdministrador().storage.from(BALDE).remove([caminho]);
    if (error) {
      throw new Error(`Não foi possível remover o arquivo: ${error.message}`);
    }
  }
}

let instancia: ProvedorArmazenamento | null = null;

export function obterProvedorArmazenamento(): ProvedorArmazenamento {
  if (!instancia) instancia = new ArmazenamentoSupabase();
  return instancia;
}

export function _definirProvedorArmazenamento(provedor: ProvedorArmazenamento | null): void {
  instancia = provedor;
}
