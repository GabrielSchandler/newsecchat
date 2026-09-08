'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Copy, UserPlus } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import { Cartao, CorpoCartao, Selo } from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import { formatarDataHora, iniciais } from '@/lib/utilitarios';
import { rotuloPapel } from '@/lib/papeis';
import type { Departamento, PapelMembro } from '@/lib/tipos-banco';
import {
  alterarPapel,
  alterarSituacaoUsuario,
  convidarUsuario,
  definirDepartamentosDoUsuario,
} from '../acoes';

export interface UsuarioDaLista {
  membroId: string;
  nome: string;
  email: string;
  papel: PapelMembro;
  ativo: boolean;
  departamentos: string[];
  souEu: boolean;
}

const PAPEIS: PapelMembro[] = ['ATENDENTE', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'];

const EXPLICACAO_PAPEL: Record<PapelMembro, string> = {
  ATENDENTE: 'Atende conversas dos seus departamentos e das que estão sem departamento.',
  SUPERVISOR: 'Vê toda a operação, campanhas e a IA. Não mexe em configurações.',
  ADMIN: 'Configura canais, pessoas, departamentos e a IA.',
  SUPER_ADMIN: 'Tudo, incluindo criar e remover administradores.',
};

export function PainelUsuarios({
  usuarios,
  departamentos,
  convites,
  meuPapel,
}: {
  usuarios: UsuarioDaLista[];
  departamentos: Departamento[];
  convites: { id: string; email: string; papel: PapelMembro; expiraEm: string }[];
  meuPapel: PapelMembro;
}) {
  const roteador = useRouter();
  const [convidando, definirConvidando] = React.useState(false);
  const [editando, definirEditando] = React.useState<UsuarioDaLista | null>(null);

  async function trocarSituacao(usuario: UsuarioDaLista) {
    const resultado = await alterarSituacaoUsuario(usuario.membroId, !usuario.ativo);
    if (!resultado.ok) {
      toast.error(resultado.erro ?? 'Não foi possível alterar.');
      return;
    }
    if (resultado.aviso) toast.warning(resultado.aviso);
    else toast.success(usuario.ativo ? 'Usuário desativado.' : 'Usuário reativado.');
    roteador.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-tinta-900">Usuários</h2>
          <p className="mt-0.5 text-[13px] text-bruma-600">
            Quem tem acesso à central e o que cada um pode fazer.
          </p>
        </div>
        <Botao onClick={() => definirConvidando(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Convidar
        </Botao>
      </div>

      <Cartao>
        <ul className="divide-y divide-bruma-100">
          {usuarios.map((usuario) => (
            <li key={usuario.membroId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bruma-100 text-[12px] font-semibold text-tinta-700">
                {iniciais(usuario.nome)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-tinta-900">{usuario.nome}</span>
                  {usuario.souEu ? <Selo tom="produto">você</Selo> : null}
                  {!usuario.ativo ? <Selo tom="neutro">desativado</Selo> : null}
                </div>
                <p className="truncate text-[12.5px] text-bruma-600">{usuario.email}</p>
                {usuario.departamentos.length ? (
                  <p className="mt-0.5 text-[12px] text-bruma-500">
                    {usuario.departamentos
                      .map((id) => departamentos.find((d) => d.id === id)?.nome)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12px] text-bruma-500">Sem departamento</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Selo tom="neutro">{rotuloPapel[usuario.papel]}</Selo>
                <Botao variante="secundario" tamanho="pequeno" onClick={() => definirEditando(usuario)}>
                  Editar
                </Botao>
                {!usuario.souEu ? (
                  <Botao
                    variante="fantasma"
                    tamanho="pequeno"
                    onClick={() => void trocarSituacao(usuario)}
                  >
                    {usuario.ativo ? 'Desativar' : 'Reativar'}
                  </Botao>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Cartao>

      {convites.length ? (
        <Cartao>
          <CorpoCartao>
            <h3 className="text-[14px] font-semibold text-tinta-900">Convites em aberto</h3>
            <ul className="mt-2 space-y-1.5">
              {convites.map((convite) => (
                <li
                  key={convite.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                >
                  <span className="text-tinta-800">{convite.email}</span>
                  <span className="text-bruma-600">
                    {rotuloPapel[convite.papel]} · expira em {formatarDataHora(convite.expiraEm)}
                  </span>
                </li>
              ))}
            </ul>
          </CorpoCartao>
        </Cartao>
      ) : null}

      <DialogoConvite aberto={convidando} definirAberto={definirConvidando} departamentos={departamentos} meuPapel={meuPapel} />

      <DialogoEditarUsuario
        aberto={editando !== null}
        definirAberto={(valor) => {
          if (!valor) definirEditando(null);
        }}
        usuario={editando}
        departamentos={departamentos}
        meuPapel={meuPapel}
      />
    </div>
  );
}

function DialogoConvite({
  aberto,
  definirAberto,
  departamentos,
  meuPapel,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  departamentos: Departamento[];
  meuPapel: PapelMembro;
}) {
  const roteador = useRouter();
  const [email, definirEmail] = React.useState('');
  const [papel, definirPapel] = React.useState<PapelMembro>('ATENDENTE');
  const [selecionados, definirSelecionados] = React.useState<string[]>([]);
  const [salvando, definirSalvando] = React.useState(false);
  const [link, definirLink] = React.useState<string | null>(null);
  const [copiado, definirCopiado] = React.useState(false);

  const disponiveis = PAPEIS.filter((item) => item !== 'SUPER_ADMIN' || meuPapel === 'SUPER_ADMIN');

  return (
    <Dialogo
      open={aberto}
      onOpenChange={(valor) => {
        definirAberto(valor);
        if (!valor) {
          definirLink(null);
          definirEmail('');
        }
      }}
    >
      <ConteudoDialogo
        titulo="Convidar usuário"
        descricao="O convite gera um link. Envie-o para a pessoa; ela cria a senha ao abrir."
      >
        <CorpoDialogo>
          {link ? (
            <div className="space-y-2">
              <p className="text-[13px] leading-relaxed text-tinta-800">
                Convite criado. Copie o link e envie para a pessoa — o sistema não manda e-mail sozinho.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-bruma-200 bg-bruma-50 px-2.5 py-1.5 text-[11.5px] text-tinta-800">
                  {link}
                </code>
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      definirCopiado(true);
                      setTimeout(() => definirCopiado(false), 2000);
                    } catch {
                      toast.error('O navegador não deixou copiar. Selecione e copie na mão.');
                    }
                  }}
                >
                  {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </Botao>
              </div>
              <p className="text-[12px] text-bruma-500">O link vale por 7 dias.</p>
            </div>
          ) : (
            <>
              <Campo rotulo="E-mail" htmlFor="convite-email" obrigatorio>
                <Entrada
                  id="convite-email"
                  type="email"
                  value={email}
                  onChange={(evento) => definirEmail(evento.target.value)}
                  placeholder="pessoa@empresa.com.br"
                />
              </Campo>

              <Campo rotulo="Papel" htmlFor="convite-papel" ajuda={EXPLICACAO_PAPEL[papel]}>
                <Selecao
                  id="convite-papel"
                  value={papel}
                  onChange={(evento) => definirPapel(evento.target.value as PapelMembro)}
                >
                  {disponiveis.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {rotuloPapel[opcao]}
                    </option>
                  ))}
                </Selecao>
              </Campo>

              {departamentos.length ? (
                <Campo
                  rotulo="Departamentos"
                  ajuda="Um atendente só enxerga conversas dos departamentos dele e as que ainda não têm departamento."
                >
                  <div className="space-y-1.5">
                    {departamentos.map((departamento) => (
                      <label
                        key={departamento.id}
                        className="flex items-center gap-2.5 text-[13.5px] text-tinta-900"
                      >
                        <input
                          type="checkbox"
                          checked={selecionados.includes(departamento.id)}
                          onChange={(evento) =>
                            definirSelecionados((atuais) =>
                              evento.target.checked
                                ? [...atuais, departamento.id]
                                : atuais.filter((id) => id !== departamento.id),
                            )
                          }
                          className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
                        />
                        {departamento.nome}
                      </label>
                    ))}
                  </div>
                </Campo>
              ) : null}
            </>
          )}
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            {link ? 'Fechar' : 'Cancelar'}
          </Botao>
          {!link ? (
            <Botao
              carregando={salvando}
              disabled={!email.includes('@')}
              onClick={async () => {
                definirSalvando(true);
                try {
                  const resultado = await convidarUsuario({
                    email,
                    papel,
                    departamentos: selecionados,
                  });

                  if (!resultado.ok || !resultado.convite) {
                    toast.error(resultado.erro ?? 'Não foi possível convidar.');
                    return;
                  }

                  definirLink(resultado.convite.url);
                  roteador.refresh();
                } finally {
                  definirSalvando(false);
                }
              }}
            >
              Gerar convite
            </Botao>
          ) : null}
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}

function DialogoEditarUsuario({
  aberto,
  definirAberto,
  usuario,
  departamentos,
  meuPapel,
}: {
  aberto: boolean;
  definirAberto: (valor: boolean) => void;
  usuario: UsuarioDaLista | null;
  departamentos: Departamento[];
  meuPapel: PapelMembro;
}) {
  const roteador = useRouter();
  const [papel, definirPapel] = React.useState<PapelMembro>('ATENDENTE');
  const [selecionados, definirSelecionados] = React.useState<string[]>([]);
  const [salvando, definirSalvando] = React.useState(false);

  React.useEffect(() => {
    if (!aberto || !usuario) return;
    definirPapel(usuario.papel);
    definirSelecionados(usuario.departamentos);
  }, [aberto, usuario]);

  if (!usuario) return null;

  const disponiveis = PAPEIS.filter((item) => item !== 'SUPER_ADMIN' || meuPapel === 'SUPER_ADMIN');

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <ConteudoDialogo titulo={`Editar ${usuario.nome}`} descricao={usuario.email}>
        <CorpoDialogo>
          <Campo rotulo="Papel" htmlFor="editar-papel" ajuda={EXPLICACAO_PAPEL[papel]}>
            <Selecao
              id="editar-papel"
              value={papel}
              disabled={usuario.souEu}
              onChange={(evento) => definirPapel(evento.target.value as PapelMembro)}
            >
              {disponiveis.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {rotuloPapel[opcao]}
                </option>
              ))}
            </Selecao>
          </Campo>

          {usuario.souEu ? (
            <p className="text-[12.5px] text-bruma-600">
              Você não pode alterar o próprio papel — peça a outro administrador.
            </p>
          ) : null}

          {departamentos.length ? (
            <Campo rotulo="Departamentos">
              <div className="space-y-1.5">
                {departamentos.map((departamento) => (
                  <label
                    key={departamento.id}
                    className="flex items-center gap-2.5 text-[13.5px] text-tinta-900"
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.includes(departamento.id)}
                      onChange={(evento) =>
                        definirSelecionados((atuais) =>
                          evento.target.checked
                            ? [...atuais, departamento.id]
                            : atuais.filter((id) => id !== departamento.id),
                        )
                      }
                      className="h-4 w-4 rounded border-bruma-400 text-produto-700 focus:ring-produto-700"
                    />
                    {departamento.nome}
                  </label>
                ))}
              </div>
            </Campo>
          ) : null}
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
                if (!usuario.souEu && papel !== usuario.papel) {
                  const resultado = await alterarPapel(usuario.membroId, papel);
                  if (!resultado.ok) {
                    toast.error(resultado.erro ?? 'Não foi possível alterar o papel.');
                    return;
                  }
                }

                const resultadoDepartamentos = await definirDepartamentosDoUsuario(
                  usuario.membroId,
                  selecionados,
                );

                if (!resultadoDepartamentos.ok) {
                  toast.error(resultadoDepartamentos.erro ?? 'Não foi possível salvar os departamentos.');
                  return;
                }

                toast.success('Usuário atualizado.');
                definirAberto(false);
                roteador.refresh();
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
