'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Link2,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Unplug,
} from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import {
  Cartao,
  CorpoCartao,
  EstadoVazio,
  Selo,
  Separador,
} from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import { formatarDataHora } from '@/lib/utilitarios';
import { formatarTelefone } from '@/lib/nucleo/telefone';
import type { Canal, Departamento, ProvedorMensageria, StatusCanal } from '@/lib/tipos-banco';
import {
  atualizarCanal,
  conectarCanal,
  conferirStatusCanal,
  criarCanal,
  desconectarCanal,
  girarSegredoWebhook,
  obterUrlWebhook,
  removerCanal,
} from './acoes';

type CanalSemSegredo = Omit<Canal, 'segredo_webhook'>;

const ROTULO_STATUS: Record<StatusCanal, { texto: string; tom: 'sucesso' | 'alerta' | 'erro' | 'neutro' }> = {
  CONECTADO: { texto: 'Conectado', tom: 'sucesso' },
  CONECTANDO: { texto: 'Conectando', tom: 'alerta' },
  AGUARDANDO_QR: { texto: 'Aguardando leitura do QR', tom: 'alerta' },
  DESCONECTADO: { texto: 'Desconectado', tom: 'neutro' },
  ERRO: { texto: 'Erro', tom: 'erro' },
};

export function PainelCanais({
  canais,
  departamentos,
  evolutionPronta,
}: {
  canais: CanalSemSegredo[];
  departamentos: Departamento[];
  evolutionPronta: boolean;
}) {
  const roteador = useRouter();
  const [criando, definirCriando] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-tinta-900">Números de WhatsApp</h2>
          <p className="mt-0.5 text-[13px] text-bruma-600">
            Cada número é um canal. Você pode ter quantos precisar — um por departamento, ou um de reserva.
          </p>
        </div>
        <Botao onClick={() => definirCriando(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo canal
        </Botao>
      </div>

      {canais.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Smartphone className="h-5 w-5" />}
            titulo="Nenhum número conectado ainda"
            descricao="Cadastre o primeiro canal e leia o QR Code no celular. A partir daí, tudo que chegar nesse número aparece na central de atendimento."
            acao={<Botao onClick={() => definirCriando(true)}>Cadastrar primeiro canal</Botao>}
          />
        </Cartao>
      ) : (
        <div className="space-y-3">
          {canais.map((canal) => (
            <LinhaCanal
              key={canal.id}
              canal={canal}
              departamentos={departamentos}
              aoMudar={() => roteador.refresh()}
            />
          ))}
        </div>
      )}

      <DialogoNovoCanal
        aberto={criando}
        definirAberto={definirCriando}
        departamentos={departamentos}
        evolutionPronta={evolutionPronta}
      />
    </div>
  );
}

function LinhaCanal({
  canal,
  departamentos,
  aoMudar,
}: {
  canal: CanalSemSegredo;
  departamentos: Departamento[];
  aoMudar: () => void;
}) {
  const [ocupado, definirOcupado] = React.useState(false);
  const [qr, definirQr] = React.useState<string | null>(null);
  const [codigo, definirCodigo] = React.useState<string | null>(null);
  const [qrAberto, definirQrAberto] = React.useState(false);
  const [editando, definirEditando] = React.useState(false);

  const status = ROTULO_STATUS[canal.status];
  const departamento = departamentos.find((item) => item.id === canal.departamento_id);

  // Enquanto o QR está na tela, o status é conferido a cada 5 s: o usuário
  // lê o código no celular e a tela precisa reagir sozinha.
  React.useEffect(() => {
    if (!qrAberto) return;

    const relogio = setInterval(async () => {
      const resultado = await conferirStatusCanal(canal.id);
      if (resultado.ok && resultado.status === 'CONECTADO') {
        definirQrAberto(false);
        toast.success('Número conectado.');
        aoMudar();
      }
    }, 5000);

    return () => clearInterval(relogio);
  }, [qrAberto, canal.id, aoMudar]);

  async function executar(acao: () => Promise<{ ok: boolean; erro?: string }>, sucesso?: string) {
    definirOcupado(true);
    try {
      const resultado = await acao();
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível concluir.');
        return false;
      }
      if (sucesso) toast.success(sucesso);
      aoMudar();
      return true;
    } finally {
      definirOcupado(false);
    }
  }

  async function conectar() {
    definirOcupado(true);
    try {
      const resultado = await conectarCanal(canal.id);
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível conectar.');
        return;
      }

      if (resultado.status === 'CONECTADO') {
        toast.success('Este número já está conectado.');
        aoMudar();
        return;
      }

      definirQr(resultado.qrCodeBase64 ?? null);
      definirCodigo(resultado.codigo ?? null);
      definirQrAberto(true);
      aoMudar();
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <Cartao>
      <CorpoCartao className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-tinta-900">{canal.nome}</h3>
              <Selo tom={status.tom}>{status.texto}</Selo>
              {!canal.ativo ? <Selo tom="neutro">Desativado</Selo> : null}
              {canal.ia_ativa ? <Selo tom="ia">IA ligada</Selo> : <Selo tom="neutro">IA desligada</Selo>}
              {canal.provedor === 'SIMULADO' ? <Selo tom="alerta">Simulado</Selo> : null}
            </div>

            <p className="mt-1 text-[12.5px] text-bruma-600">
              {canal.telefone ? formatarTelefone(canal.telefone) : 'Número ainda não identificado'}
              {departamento ? ` · ${departamento.nome}` : ' · sem departamento'}
              {canal.ultima_conexao_em
                ? ` · última conexão em ${formatarDataHora(canal.ultima_conexao_em)}`
                : ''}
            </p>

            {canal.ultimo_erro ? (
              <p className="mt-1.5 rounded-lg bg-marca-50 px-2 py-1 text-[12px] leading-relaxed text-marca-600">
                {canal.ultimo_erro}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canal.status === 'CONECTADO' ? (
              <Botao
                variante="secundario"
                tamanho="pequeno"
                disabled={ocupado}
                onClick={() => void executar(() => desconectarCanal(canal.id), 'Número desconectado.')}
              >
                <Unplug className="h-3.5 w-3.5" aria-hidden />
                Desconectar
              </Botao>
            ) : (
              <Botao tamanho="pequeno" disabled={ocupado} carregando={ocupado} onClick={conectar}>
                <QrCode className="h-3.5 w-3.5" aria-hidden />
                Conectar
              </Botao>
            )}

            <Botao
              variante="fantasma"
              tamanho="pequeno"
              disabled={ocupado}
              onClick={() => void executar(() => conferirStatusCanal(canal.id))}
              title="Perguntar ao provedor qual é o status agora"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Atualizar
            </Botao>

            <Botao variante="fantasma" tamanho="pequeno" onClick={() => definirEditando(true)}>
              Editar
            </Botao>
          </div>
        </div>

        <Separador />

        <EnderecoWebhook canalId={canal.id} />
      </CorpoCartao>

      <DialogoQr
        aberto={qrAberto}
        definirAberto={definirQrAberto}
        qr={qr}
        codigo={codigo}
        nomeCanal={canal.nome}
      />

      <DialogoEditarCanal
        aberto={editando}
        definirAberto={definirEditando}
        canal={canal}
        departamentos={departamentos}
        aoMudar={aoMudar}
      />
    </Cartao>
  );
}

/**
 * O endereço do webhook só é buscado quando o gestor pede.
 *
 * Ele contém o segredo do canal — deixá-lo pré-carregado no HTML da
 * página o colocaria no cache do navegador e no histórico de quem
 * inspecionar a resposta, sem necessidade nenhuma.
 */
function EnderecoWebhook({ canalId }: { canalId: string }) {
  const [url, definirUrl] = React.useState<string | null>(null);
  const [carregando, definirCarregando] = React.useState(false);
  const [copiado, definirCopiado] = React.useState(false);

  async function mostrar() {
    definirCarregando(true);
    try {
      const resultado = await obterUrlWebhook(canalId);
      if (!resultado.ok || !resultado.url) {
        toast.error(resultado.erro ?? 'Não foi possível obter o endereço.');
        return;
      }
      definirUrl(resultado.url);
    } finally {
      definirCarregando(false);
    }
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      definirCopiado(true);
      setTimeout(() => definirCopiado(false), 2000);
    } catch {
      toast.error('O navegador não deixou copiar. Selecione o texto e copie na mão.');
    }
  }

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-bruma-500">
        <Link2 className="h-3 w-3" aria-hidden />
        Endereço do webhook
      </p>

      {url ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-bruma-200 bg-bruma-50 px-2.5 py-1.5 text-[11.5px] text-tinta-800">
              {url}
            </code>
            <Botao variante="secundario" tamanho="pequeno" onClick={copiar}>
              {copiado ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copiado ? 'Copiado' : 'Copiar'}
            </Botao>
          </div>
          <p className="text-[12px] leading-relaxed text-bruma-600">
            Este endereço é uma senha: quem o tiver consegue injetar mensagens neste canal. A aplicação já
            o configura sozinha ao conectar — só use manualmente se a Evolution API pedir.{' '}
            <button
              type="button"
              className="font-medium text-marca-600 underline-offset-2 hover:underline"
              onClick={async () => {
                const resultado = await girarSegredoWebhook(canalId);
                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível trocar o segredo.');
                  return;
                }
                toast.success('Segredo trocado e Evolution API reconfigurada.');
                definirUrl(null);
              }}
            >
              Gerar um endereço novo
            </button>{' '}
            se achar que ele vazou.
          </p>
        </div>
      ) : (
        <Botao variante="suave" tamanho="pequeno" carregando={carregando} onClick={mostrar}>
          Mostrar endereço
        </Botao>
      )}
    </div>
  );
}

function DialogoQr({
  aberto,
  definirAberto,
  qr,
  codigo,
  nomeCanal,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  qr: string | null;
  codigo: string | null;
  nomeCanal: string;
}) {
  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo
        titulo={`Conectar “${nomeCanal}”`}
        descricao="Leia o código com o celular que tem o número. A tela avisa sozinha quando conectar."
      >
        <CorpoDialogo>
          <ol className="space-y-1.5 text-[13px] leading-relaxed text-tinta-800">
            <li>1. Abra o WhatsApp no celular do número.</li>
            <li>
              2. Toque em <strong>Configurações</strong> → <strong>Aparelhos conectados</strong>.
            </li>
            <li>
              3. Toque em <strong>Conectar um aparelho</strong>.
            </li>
            <li>4. Aponte a câmera para o código abaixo.</li>
          </ol>

          <div className="flex justify-center rounded-lg border border-bruma-200 bg-white p-4">
            {qr ? (
              <Image
                src={qr}
                alt="QR Code para conectar o WhatsApp"
                width={240}
                height={240}
                unoptimized
                className="h-[240px] w-[240px]"
              />
            ) : (
              <p className="py-12 text-center text-[13px] leading-relaxed text-bruma-600">
                O provedor não devolveu o código desta vez. Feche, clique em Atualizar e tente conectar
                de novo.
              </p>
            )}
          </div>

          {codigo ? (
            <p className="text-center text-[13px] text-bruma-600">
              Ou use o código de pareamento:{' '}
              <code className="rounded bg-bruma-100 px-1.5 py-0.5 font-semibold text-tinta-900">
                {codigo}
              </code>
            </p>
          ) : null}

          <p className="text-[12px] leading-relaxed text-bruma-500">
            O código expira em cerca de um minuto. Se expirar, feche e clique em Conectar de novo.
          </p>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Fechar
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}

function DialogoNovoCanal({
  aberto,
  definirAberto,
  departamentos,
  evolutionPronta,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  departamentos: Departamento[];
  evolutionPronta: boolean;
}) {
  const roteador = useRouter();
  const [nome, definirNome] = React.useState('');
  const [departamentoId, definirDepartamento] = React.useState('');
  const [provedor, definirProvedor] = React.useState<ProvedorMensageria>('EVOLUTION');
  const [iaAtiva, definirIaAtiva] = React.useState(true);
  const [salvando, definirSalvando] = React.useState(false);

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo
        titulo="Novo canal de WhatsApp"
        descricao="Depois de cadastrar, clique em Conectar para ler o QR Code."
      >
        <CorpoDialogo>
          <Campo
            rotulo="Nome do canal"
            htmlFor="canal-nome"
            obrigatorio
            ajuda="É como ele aparece na central. Ex.: Comercial principal."
          >
            <Entrada
              id="canal-nome"
              value={nome}
              onChange={(evento) => definirNome(evento.target.value)}
              maxLength={80}
              placeholder="Comercial principal"
            />
          </Campo>

          <Campo
            rotulo="Departamento"
            htmlFor="canal-departamento"
            ajuda="Conversas que chegarem por este número já entram neste departamento."
          >
            <Selecao
              id="canal-departamento"
              value={departamentoId}
              onChange={(evento) => definirDepartamento(evento.target.value)}
            >
              <option value="">Nenhum (a IA decide)</option>
              {departamentos.map((departamento) => (
                <option key={departamento.id} value={departamento.id}>
                  {departamento.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo
            rotulo="Provedor"
            htmlFor="canal-provedor"
            ajuda={
              evolutionPronta
                ? 'A Evolution API conecta um número real. O simulado serve para testar a aplicação sem WhatsApp.'
                : 'A Evolution API ainda não está configurada. O simulado deixa você testar a central enquanto isso — ele não envia nada para ninguém.'
            }
          >
            <Selecao
              id="canal-provedor"
              value={provedor}
              onChange={(evento) => definirProvedor(evento.target.value as ProvedorMensageria)}
            >
              <option value="EVOLUTION">Evolution API (número real)</option>
              <option value="SIMULADO">Simulado (só para testes)</option>
            </Selecao>
          </Campo>

          <label className="flex items-start gap-2.5 rounded-lg border border-bruma-200 px-3 py-2.5">
            <input
              type="checkbox"
              checked={iaAtiva}
              onChange={(evento) => definirIaAtiva(evento.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
            />
            <span>
              <span className="block text-[13.5px] font-medium text-tinta-900">
                A IA atende neste canal
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-bruma-600">
                Desligue em números usados só para disparo. Quando um humano assume uma conversa, a IA
                para de responder de qualquer forma.
              </span>
            </span>
          </label>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            carregando={salvando}
            disabled={nome.trim().length < 2}
            onClick={async () => {
              definirSalvando(true);
              try {
                const resultado = await criarCanal({
                  nome,
                  departamentoId: departamentoId || null,
                  provedor,
                  iaAtiva,
                });

                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível cadastrar.');
                  return;
                }

                toast.success('Canal cadastrado. Agora clique em Conectar.');
                definirAberto(false);
                definirNome('');
                roteador.refresh();
              } finally {
                definirSalvando(false);
              }
            }}
          >
            Cadastrar canal
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}

function DialogoEditarCanal({
  aberto,
  definirAberto,
  canal,
  departamentos,
  aoMudar,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  canal: CanalSemSegredo;
  departamentos: Departamento[];
  aoMudar: () => void;
}) {
  const [nome, definirNome] = React.useState(canal.nome);
  const [departamentoId, definirDepartamento] = React.useState(canal.departamento_id ?? '');
  const [iaAtiva, definirIaAtiva] = React.useState(canal.ia_ativa);
  const [ativo, definirAtivo] = React.useState(canal.ativo);
  const [salvando, definirSalvando] = React.useState(false);
  const [removendo, definirRemovendo] = React.useState(false);

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo titulo={`Editar “${canal.nome}”`}>
        <CorpoDialogo>
          <Campo rotulo="Nome do canal" htmlFor={`editar-nome-${canal.id}`} obrigatorio>
            <Entrada
              id={`editar-nome-${canal.id}`}
              value={nome}
              onChange={(evento) => definirNome(evento.target.value)}
              maxLength={80}
            />
          </Campo>

          <Campo rotulo="Departamento" htmlFor={`editar-departamento-${canal.id}`}>
            <Selecao
              id={`editar-departamento-${canal.id}`}
              value={departamentoId}
              onChange={(evento) => definirDepartamento(evento.target.value)}
            >
              <option value="">Nenhum (a IA decide)</option>
              {departamentos.map((departamento) => (
                <option key={departamento.id} value={departamento.id}>
                  {departamento.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <label className="flex items-center gap-2.5 text-[13.5px] text-tinta-900">
            <input
              type="checkbox"
              checked={iaAtiva}
              onChange={(evento) => definirIaAtiva(evento.target.checked)}
              className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
            />
            A IA atende neste canal
          </label>

          <label className="flex items-center gap-2.5 text-[13.5px] text-tinta-900">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(evento) => definirAtivo(evento.target.checked)}
              className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
            />
            Canal ativo
          </label>

          <div className="rounded-lg border border-marca-50 bg-marca-50/50 px-3 py-2.5">
            <p className="text-[13px] font-medium text-marca-600">Remover este canal</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-tinta-700">
              Apaga o canal e todo o histórico de conversas dele. Não dá para desfazer. Se a ideia é só
              parar de usar, desmarque “Canal ativo”.
            </p>
            <Botao
              variante="destrutivo"
              tamanho="pequeno"
              className="mt-2"
              carregando={removendo}
              onClick={async () => {
                definirRemovendo(true);
                try {
                  const resultado = await removerCanal(canal.id);
                  if (!resultado.ok) {
                    toast.error(resultado.erro ?? 'Não foi possível remover.');
                    return;
                  }
                  toast.success('Canal removido.');
                  definirAberto(false);
                  aoMudar();
                } finally {
                  definirRemovendo(false);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remover canal
            </Botao>
          </div>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            carregando={salvando}
            onClick={async () => {
              definirSalvando(true);
              try {
                const resultado = await atualizarCanal({
                  canalId: canal.id,
                  nome,
                  departamentoId: departamentoId || null,
                  iaAtiva,
                  ativo,
                });
                if (!resultado.ok) {
                  toast.error(resultado.erro ?? 'Não foi possível salvar.');
                  return;
                }
                toast.success('Canal atualizado.');
                definirAberto(false);
                aoMudar();
              } finally {
                definirSalvando(false);
              }
            }}
          >
            Salvar
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}
