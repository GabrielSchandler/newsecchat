'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building, Plus, Trash2 } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { AreaTexto, Campo, Entrada } from '@/componentes/ui/campo';
import { Cartao, CorpoCartao, EstadoVazio, Selo } from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import type { Departamento } from '@/lib/tipos-banco';
import { criarDepartamento, removerDepartamento, salvarDepartamento } from '../acoes';

const CORES = ['#0f766e', '#b5121a', '#3a3e48', '#b45309', '#15803d', '#1d4ed8', '#7c3aed'];

export function PainelDepartamentos({ departamentos }: { departamentos: Departamento[] }) {
  const [criando, definirCriando] = React.useState(false);
  const [editando, definirEditando] = React.useState<Departamento | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-tinta-900">Departamentos</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-bruma-600">
            A IA usa o critério de cada departamento para decidir para onde encaminhar a conversa. Quanto
            mais concreto o critério, menos transferência errada.
          </p>
        </div>
        <Botao onClick={() => definirCriando(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Novo departamento
        </Botao>
      </div>

      {departamentos.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Building className="h-5 w-5" />}
            titulo="Nenhum departamento cadastrado"
            descricao="Sem departamentos, toda conversa que sair da IA vai para uma fila única."
            acao={<Botao onClick={() => definirCriando(true)}>Criar o primeiro</Botao>}
          />
        </Cartao>
      ) : (
        <div className="space-y-2.5">
          {departamentos.map((departamento) => (
            <Cartao key={departamento.id}>
              <CorpoCartao className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: departamento.cor }}
                      aria-hidden
                    />
                    <h3 className="text-[14.5px] font-semibold text-tinta-900">{departamento.nome}</h3>
                    <code className="rounded bg-bruma-100 px-1.5 py-0.5 text-[11px] text-bruma-600">
                      {departamento.chave}
                    </code>
                    {!departamento.ativo ? <Selo tom="neutro">Desativado</Selo> : null}
                  </div>

                  {departamento.descricao ? (
                    <p className="mt-1 text-[13px] leading-relaxed text-bruma-600">
                      {departamento.descricao}
                    </p>
                  ) : null}

                  {departamento.criterio_transferencia ? (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-tinta-700">
                      <span className="font-medium text-bruma-600">A IA encaminha quando: </span>
                      {departamento.criterio_transferencia}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[12.5px] text-alerta-700">
                      Sem critério definido — a IA não sabe quando usar este departamento.
                    </p>
                  )}
                </div>

                <Botao variante="secundario" tamanho="pequeno" onClick={() => definirEditando(departamento)}>
                  Editar
                </Botao>
              </CorpoCartao>
            </Cartao>
          ))}
        </div>
      )}

      <DialogoDepartamento
        aberto={criando}
        definirAberto={definirCriando}
        departamento={null}
      />

      <DialogoDepartamento
        aberto={editando !== null}
        definirAberto={(valor) => {
          if (!valor) definirEditando(null);
        }}
        departamento={editando}
      />
    </div>
  );
}

function DialogoDepartamento({
  aberto,
  definirAberto,
  departamento,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  departamento: Departamento | null;
}) {
  const roteador = useRouter();
  const [nome, definirNome] = React.useState('');
  const [descricao, definirDescricao] = React.useState('');
  const [criterio, definirCriterio] = React.useState('');
  const [cor, definirCor] = React.useState(CORES[0] as string);
  const [ativo, definirAtivo] = React.useState(true);
  const [salvando, definirSalvando] = React.useState(false);
  const [removendo, definirRemovendo] = React.useState(false);

  // Carrega os valores do departamento quando o diálogo abre.
  React.useEffect(() => {
    if (!aberto) return;
    definirNome(departamento?.nome ?? '');
    definirDescricao(departamento?.descricao ?? '');
    definirCriterio(departamento?.criterio_transferencia ?? '');
    definirCor(departamento?.cor ?? (CORES[0] as string));
    definirAtivo(departamento?.ativo ?? true);
  }, [aberto, departamento]);

  async function salvar() {
    definirSalvando(true);
    try {
      const resultado = departamento
        ? await salvarDepartamento({
            departamentoId: departamento.id,
            nome,
            descricao: descricao.trim() || null,
            criterioTransferencia: criterio.trim() || null,
            cor,
            ativo,
          })
        : await criarDepartamento({
            nome,
            descricao: descricao.trim() || null,
            criterioTransferencia: criterio.trim() || null,
            cor,
          });

      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível salvar.');
        return;
      }

      toast.success(departamento ? 'Departamento atualizado.' : 'Departamento criado.');
      definirAberto(false);
      roteador.refresh();
    } finally {
      definirSalvando(false);
    }
  }

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo
        titulo={departamento ? `Editar “${departamento.nome}”` : 'Novo departamento'}
        descricao="O critério é lido pela IA em toda conversa. Escreva como explicaria a um atendente novo."
      >
        <CorpoDialogo>
          <Campo rotulo="Nome" htmlFor="dep-nome" obrigatorio>
            <Entrada
              id="dep-nome"
              value={nome}
              onChange={(evento) => definirNome(evento.target.value)}
              maxLength={60}
              placeholder="Comercial"
            />
          </Campo>

          <Campo rotulo="Descrição" htmlFor="dep-descricao" ajuda="Para a equipe. Opcional.">
            <AreaTexto
              id="dep-descricao"
              value={descricao}
              onChange={(evento) => definirDescricao(evento.target.value)}
              rows={2}
              maxLength={400}
            />
          </Campo>

          <Campo
            rotulo="Quando a IA deve encaminhar para cá"
            htmlFor="dep-criterio"
            ajuda="Ex.: quando a pessoa perguntar preço, condições ou quiser contratar."
          >
            <AreaTexto
              id="dep-criterio"
              value={criterio}
              onChange={(evento) => definirCriterio(evento.target.value)}
              rows={3}
              maxLength={600}
            />
          </Campo>

          <Campo rotulo="Cor">
            <div className="flex flex-wrap gap-2">
              {CORES.map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => definirCor(opcao)}
                  aria-label={`Cor ${opcao}`}
                  aria-pressed={cor === opcao}
                  className="h-7 w-7 rounded-lg border-2 transition-transform hover:scale-105"
                  style={{
                    backgroundColor: opcao,
                    borderColor: cor === opcao ? '#0b0b0d' : 'transparent',
                  }}
                />
              ))}
            </div>
          </Campo>

          {departamento ? (
            <>
              <label className="flex items-center gap-2.5 text-[13.5px] text-tinta-900">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(evento) => definirAtivo(evento.target.checked)}
                  className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
                />
                Departamento ativo
              </label>

              <div className="rounded-lg border border-marca-50 bg-marca-50/50 px-3 py-2.5">
                <p className="text-[12.5px] leading-relaxed text-tinta-700">
                  Remover apaga o departamento de vez. Para apenas parar de usá-lo, desmarque a opção
                  acima — assim o histórico das conversas antigas continua legível.
                </p>
                <Botao
                  variante="destrutivo"
                  tamanho="pequeno"
                  className="mt-2"
                  carregando={removendo}
                  onClick={async () => {
                    definirRemovendo(true);
                    try {
                      const resultado = await removerDepartamento(departamento.id);
                      if (!resultado.ok) {
                        toast.error(resultado.erro ?? 'Não foi possível remover.');
                        return;
                      }
                      toast.success('Departamento removido.');
                      definirAberto(false);
                      roteador.refresh();
                    } finally {
                      definirRemovendo(false);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remover
                </Botao>
              </div>
            </>
          ) : null}
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao carregando={salvando} disabled={nome.trim().length < 2} onClick={salvar}>
            {departamento ? 'Salvar' : 'Criar'}
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}
