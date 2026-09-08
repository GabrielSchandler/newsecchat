'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ListChecks, Plus } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import { Cartao, EstadoVazio, Selo } from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import type { CampoPersonalizado, TipoCampo } from '@/lib/tipos-banco';
import { criarCampo, salvarCampo } from '../acoes';

const TIPOS: { valor: TipoCampo; rotulo: string }[] = [
  { valor: 'TEXTO', rotulo: 'Texto curto' },
  { valor: 'TEXTO_LONGO', rotulo: 'Texto longo' },
  { valor: 'NUMERO', rotulo: 'Número' },
  { valor: 'MOEDA', rotulo: 'Valor em reais' },
  { valor: 'DATA', rotulo: 'Data' },
  { valor: 'SELECAO', rotulo: 'Escolha uma opção' },
  { valor: 'MULTISELECAO', rotulo: 'Escolha várias opções' },
  { valor: 'BOOLEANO', rotulo: 'Sim ou não' },
  { valor: 'TELEFONE', rotulo: 'Telefone' },
  { valor: 'EMAIL', rotulo: 'E-mail' },
  { valor: 'DOCUMENTO', rotulo: 'CPF ou CNPJ' },
];

const rotuloTipo = (tipo: TipoCampo) => TIPOS.find((item) => item.valor === tipo)?.rotulo ?? tipo;

export function PainelCampos({ campos }: { campos: CampoPersonalizado[] }) {
  const [criando, definirCriando] = React.useState(false);
  const [editando, definirEditando] = React.useState<CampoPersonalizado | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-tinta-900">Campos do contato</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-bruma-600">
            É o que a IA precisa descobrir na conversa. Ela não pergunta tudo de uma vez: encaixa cada
            pergunta quando faz sentido e nunca repete o que a pessoa já respondeu.
          </p>
        </div>
        <Botao onClick={() => definirCriando(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo campo
        </Botao>
      </div>

      {campos.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<ListChecks className="h-5 w-5" />}
            titulo="Nenhum campo cadastrado"
            descricao="Sem campos, a IA conversa e encaminha, mas não guarda dados estruturados sobre o cliente."
            acao={<Botao onClick={() => definirCriando(true)}>Criar o primeiro campo</Botao>}
          />
        </Cartao>
      ) : (
        <Cartao>
          <ul className="divide-y divide-bruma-100">
            {campos.map((campo) => (
              <li key={campo.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-tinta-900">{campo.rotulo}</h3>
                    <code className="rounded bg-bruma-100 px-1.5 py-0.5 text-[11px] text-bruma-600">
                      {campo.chave}
                    </code>
                    <Selo tom="neutro">{rotuloTipo(campo.tipo)}</Selo>
                    {campo.obrigatorio_para_qualificacao ? (
                      <Selo tom="produto">obrigatório</Selo>
                    ) : null}
                    {!campo.ativo ? <Selo tom="neutro">desativado</Selo> : null}
                  </div>

                  {campo.instrucao_ia ? (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-bruma-600">
                      {campo.instrucao_ia}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-alerta-700">
                      Sem instrução — a IA vai improvisar como perguntar.
                    </p>
                  )}
                </div>

                <Botao variante="secundario" tamanho="pequeno" onClick={() => definirEditando(campo)}>
                  Editar
                </Botao>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <DialogoCampo aberto={criando} definirAberto={definirCriando} campo={null} />
      <DialogoCampo
        aberto={editando !== null}
        definirAberto={(valor) => {
          if (!valor) definirEditando(null);
        }}
        campo={editando}
      />
    </div>
  );
}

function DialogoCampo({
  aberto,
  definirAberto,
  campo,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  campo: CampoPersonalizado | null;
}) {
  const roteador = useRouter();
  const [rotulo, definirRotulo] = React.useState('');
  const [tipo, definirTipo] = React.useState<TipoCampo>('TEXTO');
  const [instrucao, definirInstrucao] = React.useState('');
  const [obrigatorio, definirObrigatorio] = React.useState(false);
  const [opcoes, definirOpcoes] = React.useState('');
  const [ativo, definirAtivo] = React.useState(true);
  const [salvando, definirSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto) return;
    definirRotulo(campo?.rotulo ?? '');
    definirTipo(campo?.tipo ?? 'TEXTO');
    definirInstrucao(campo?.instrucao_ia ?? '');
    definirObrigatorio(campo?.obrigatorio_para_qualificacao ?? false);
    definirAtivo(campo?.ativo ?? true);
    definirOpcoes(
      Array.isArray(campo?.opcoes) ? (campo.opcoes as unknown[]).map(String).join('\n') : '',
    );
  }, [aberto, campo]);

  const precisaOpcoes = tipo === 'SELECAO' || tipo === 'MULTISELECAO';

  async function salvar() {
    const listaOpcoes = opcoes
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean);

    if (precisaOpcoes && listaOpcoes.length === 0) {
      toast.error('Este tipo de campo precisa de pelo menos uma opção.');
      return;
    }

    definirSalvando(true);
    try {
      const resultado = campo
        ? await salvarCampo({
            campoId: campo.id,
            rotulo,
            tipo,
            instrucaoIa: instrucao.trim() || null,
            obrigatorio,
            opcoes: listaOpcoes,
            ativo,
          })
        : await criarCampo({
            rotulo,
            tipo,
            instrucaoIa: instrucao.trim() || null,
            obrigatorio,
            opcoes: listaOpcoes,
          });

      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível salvar.');
        return;
      }

      toast.success(campo ? 'Campo atualizado.' : 'Campo criado.');
      definirAberto(false);
      roteador.refresh();
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo titulo={campo ? `Editar “${campo.rotulo}”` : 'Novo campo'}>
        <CorpoDialogo>
          <Campo rotulo="Rótulo" htmlFor="campo-rotulo" obrigatorio ajuda="Como aparece na ficha do contato.">
            <Entrada
              id="campo-rotulo"
              value={rotulo}
              onChange={(evento) => definirRotulo(evento.target.value)}
              maxLength={60}
              placeholder="Instituição financeira"
            />
          </Campo>

          {campo ? (
            <p className="text-[12px] text-bruma-500">
              Identificador:{' '}
              <code className="rounded bg-bruma-100 px-1.5 py-0.5 text-[11.5px]">{campo.chave}</code> — não
              muda, porque é usado nas mensagens de campanha e no mapeamento das planilhas.
            </p>
          ) : null}

          <Campo rotulo="Tipo" htmlFor="campo-tipo">
            <Selecao
              id="campo-tipo"
              value={tipo}
              onChange={(evento) => definirTipo(evento.target.value as TipoCampo)}
            >
              {TIPOS.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </Selecao>
          </Campo>

          {precisaOpcoes ? (
            <Campo rotulo="Opções" htmlFor="campo-opcoes" ajuda="Uma por linha." obrigatorio>
              <AreaTexto
                id="campo-opcoes"
                value={opcoes}
                onChange={(evento) => definirOpcoes(evento.target.value)}
                rows={4}
                placeholder={'Veículo\nImóvel\nEmpréstimo pessoal'}
              />
            </Campo>
          ) : null}

          <Campo
            rotulo="Como a IA deve perguntar"
            htmlFor="campo-instrucao"
            ajuda="Escreva como orientaria um atendente novo. Ex.: “Pergunte com qual banco foi feito o contrato; aceite o nome como o cliente falar”."
          >
            <AreaTexto
              id="campo-instrucao"
              value={instrucao}
              onChange={(evento) => definirInstrucao(evento.target.value)}
              rows={3}
              maxLength={500}
            />
          </Campo>

          <label className="flex items-start gap-2.5 rounded-lg border border-bruma-200 px-3 py-2.5">
            <input
              type="checkbox"
              checked={obrigatorio}
              onChange={(evento) => definirObrigatorio(evento.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
            />
            <span>
              <span className="block text-[13.5px] font-medium text-tinta-900">
                Necessário para qualificar o lead
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-bruma-600">
                A IA insiste (com jeito) até conseguir. Marque só o que for realmente indispensável —
                cada campo obrigatório é mais uma pergunta na conversa.
              </span>
            </span>
          </label>

          {campo ? (
            <label className="flex items-center gap-2.5 text-[13.5px] text-tinta-900">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(evento) => definirAtivo(evento.target.checked)}
                className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
              />
              Campo ativo
            </label>
          ) : null}
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao carregando={salvando} disabled={rotulo.trim().length < 2} onClick={salvar}>
            {campo ? 'Salvar' : 'Criar'}
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}
