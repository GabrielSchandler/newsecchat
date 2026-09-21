'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { salvarAcesso } from './acesso';
import { Identidade } from '@/componentes/operacao/compartilhados';
import { Check, Copy, UserPlus } from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { Campo, Entrada, Selecao } from '@/componentes/ui/campo';
import { Cartao, CorpoCartao } from '@/componentes/ui/estrutura';
import { ConteudoDialogo, CorpoDialogo, Dialogo, RodapeDialogo } from '@/componentes/ui/dialogo';
import { formatarDataHora } from '@/lib/utilitarios';
import { rotuloPapel } from '@/lib/papeis';
import type { Departamento, PapelMembro } from '@/lib/tipos-banco';
import {
  alterarSituacaoUsuario,
  convidarUsuario,
} from '../acoes';

export interface UsuarioDaLista {
  membroId: string;
  nome: string;
  email: string;
  papel: PapelMembro;
  ativo: boolean;
  departamentos: string[];
  souEu: boolean;
  escopo: 'PROPRIAS'|'EQUIPE';
  assumir:boolean;
  transferir:boolean;
}

const PAPEIS: PapelMembro[] = ['ATENDENTE', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'];

const EXPLICACAO_PAPEL: Record<PapelMembro, string> = {
  ATENDENTE: 'Atende as conversas permitidas pelo escopo e pelas equipes abaixo.',
  SUPERVISOR: 'Supervisiona as equipes autorizadas e acompanha relatórios no mesmo escopo.',
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
 const [convidando,definirConvidando]=React.useState(false),[busca,setBusca]=React.useState(''),[selecionado,setSelecionado]=React.useState(usuarios[0]?.membroId||'');
 const usuario=usuarios.find(u=>u.membroId===selecionado);
 return <div className="space-y-4"><div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">Usuários e permissões</h1><p className="mt-1 text-sm text-bruma-600">Cada pessoa acessa o que precisa para atender.</p></div><Botao onClick={()=>definirConvidando(true)}><UserPlus size={16}/>Convidar usuário</Botao></div>
 <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]"><section className="superficie min-w-0"><input aria-label="Buscar usuário" placeholder="Buscar usuário" className="campo-operacional mb-3" value={busca} onChange={e=>setBusca(e.target.value)}/><div className="tabela-container"><table className="tabela-operacional"><thead><tr><th>Usuário</th><th>Perfil</th><th>Equipes</th><th>Acesso</th><th>Ação</th></tr></thead><tbody>{usuarios.filter(u=>(u.nome+' '+u.email).toLowerCase().includes(busca.toLowerCase())).map(u=><tr key={u.membroId} className={u.membroId===selecionado?'linha-selecionada':''}><td><Identidade nome={u.nome} pequeno/><span className={'mt-1 block text-[11px] '+(u.ativo?'text-sucesso-700':'text-bruma-600')}>{u.ativo?'● Ativo':'○ Desativado'}</span></td><td>{rotuloPapel[u.papel]}</td><td>{['ADMIN','SUPER_ADMIN'].includes(u.papel)?'Todas':u.departamentos.map(id=>departamentos.find(d=>d.id===id)?.nome).filter(Boolean).join(', ')||'Sem equipe'}</td><td>{['ADMIN','SUPER_ADMIN'].includes(u.papel)?'Toda a organização':u.escopo==='PROPRIAS'?'Próprias conversas':'Equipes autorizadas'}</td><td><button className="botao-link" onClick={()=>setSelecionado(u.membroId)}>Editar</button></td></tr>)}</tbody></table></div></section>
 {usuario?<EditorAcesso key={usuario.membroId+JSON.stringify(usuario)} usuario={usuario} departamentos={departamentos} meuPapel={meuPapel}/>:<section className="superficie text-sm">Selecione uma pessoa para editar o acesso.</section>}</div>
 {convites.length>0&&<Cartao><CorpoCartao><h2 className="titulo-painel">Convites em aberto</h2>{convites.map(c=><p key={c.id} className="py-2 text-sm">{c.email} · {rotuloPapel[c.papel]} · expira em {formatarDataHora(c.expiraEm)}</p>)}</CorpoCartao></Cartao>}
 <DialogoConvite aberto={convidando} definirAberto={definirConvidando} departamentos={departamentos} meuPapel={meuPapel}/></div>;
}
function EditorAcesso({usuario,departamentos,meuPapel}:{usuario:UsuarioDaLista;departamentos:Departamento[];meuPapel:PapelMembro}){
 const router=useRouter();const [papel,setPapel]=React.useState(usuario.papel),[equipes,setEquipes]=React.useState(usuario.departamentos),[escopo,setEscopo]=React.useState(usuario.escopo),[assumir,setAssumir]=React.useState(usuario.assumir),[transferir,setTransferir]=React.useState(usuario.transferir),[ocupado,setOcupado]=React.useState(false),[erro,setErro]=React.useState('');
 const gestor=papel==='ADMIN'||papel==='SUPER_ADMIN';
 async function salvar(e:React.FormEvent){e.preventDefault();setOcupado(true);setErro('');try{const r=await salvarAcesso({membro:usuario.membroId,papel,equipes,escopo,assumir,transferir});if(!r.ok)setErro(r.erro||'Não foi possível salvar.');else{toast.success('Acesso atualizado.');router.refresh();}}catch{setErro('Falha de conexão. As alterações foram preservadas.');}finally{setOcupado(false);}}
 return <form onSubmit={salvar} className="superficie space-y-4"><h2 className="titulo-painel">Editar acesso</h2><Identidade nome={usuario.nome} pequeno/><fieldset disabled={ocupado||usuario.souEu} className="space-y-4"><label className="block text-xs">Perfil<select className="campo-operacional mt-1" value={papel} onChange={e=>setPapel(e.target.value as PapelMembro)}>{PAPEIS.filter(p=>p!=='SUPER_ADMIN'||meuPapel==='SUPER_ADMIN').map(p=><option key={p} value={p}>{rotuloPapel[p]}</option>)}</select></label><div><p className="mb-2 text-xs">Equipes</p>{departamentos.map(d=><label className="mb-2 flex items-center gap-2 text-xs" key={d.id}><input type="checkbox" checked={equipes.includes(d.id)} onChange={e=>setEquipes(e.target.checked?[...equipes,d.id]:equipes.filter(id=>id!==d.id))}/>{d.nome}</label>)}</div><fieldset disabled={gestor} className="space-y-2 text-xs"><legend className="mb-2">Escopo de acesso</legend><label className="flex items-center gap-2"><input type="radio" name="escopo" checked={escopo==='PROPRIAS'} onChange={()=>setEscopo('PROPRIAS')}/>Conversas atribuídas a mim</label><label className="flex items-center gap-2"><input type="radio" name="escopo" checked={escopo==='EQUIPE'} onChange={()=>setEscopo('EQUIPE')}/>Conversas das minhas equipes</label><p className="pt-3">Permissões adicionais</p><label className="flex items-center gap-2"><input type="checkbox" role="switch" checked={assumir} onChange={e=>setAssumir(e.target.checked)}/>Assumir conversas sem responsável</label><label className="flex items-center gap-2"><input type="checkbox" role="switch" checked={transferir} onChange={e=>setTransferir(e.target.checked)}/>Transferir dentro das equipes autorizadas</label></fieldset></fieldset><p className="text-xs text-bruma-600">{gestor?'Administradores gerenciam canais e acessam toda a organização.':'As mesmas permissões valem para buscas, históricos e exportações.'}</p>{usuario.souEu&&<p className="aviso-operacional">Peça a outro administrador para alterar seu acesso.</p>}{erro&&<p role="alert" className="text-xs text-marca-600">{erro}</p>}<div className="flex gap-2"><button type="button" className="botao-link flex-1" onClick={()=>{setPapel(usuario.papel);setEquipes(usuario.departamentos);setEscopo(usuario.escopo);setAssumir(usuario.assumir);setTransferir(usuario.transferir);setErro('');}}>Cancelar</button><Botao type="submit" disabled={usuario.souEu} carregando={ocupado}>Salvar acesso</Botao></div><div className="aviso-operacional">A mudança será aplicada após salvar.</div><Link href="/configuracoes/auditoria" className="block text-xs text-produto-800">Ver histórico de alterações →</Link>{!usuario.souEu&&<button type="button" className="text-xs text-bruma-600 underline" onClick={async()=>{setOcupado(true);try{const r=await alterarSituacaoUsuario(usuario.membroId,!usuario.ativo);if(!r.ok)setErro(r.erro||'Não foi possível alterar.');else router.refresh();}finally{setOcupado(false);}}}>{usuario.ativo?'Desativar acesso':'Reativar acesso'}</button>}</form>;
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
