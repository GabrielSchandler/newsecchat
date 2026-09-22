'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  Check,
  CheckCheck,
  Clock,
  Hand,
  Lock,
  Mic,
  RotateCcw,
  Send,
  Square,
  StickyNote,
  Trash2,
  MoreVertical,
  ArrowLeft,
  UserRound,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Botao } from '@/componentes/ui/botao';
import { AreaTexto, Campo, Selecao } from '@/componentes/ui/campo';
import { Selo } from '@/componentes/ui/estrutura';
import {
  ConteudoDialogo,
  CorpoDialogo,
  Dialogo,
  RodapeDialogo,
} from '@/componentes/ui/dialogo';
import { cn, formatarEspera, formatarHora, formatarDataHora } from '@/lib/utilitarios';
import { Avatar } from '@/componentes/operacao/compartilhados';
import { formatarTelefone } from '@/lib/nucleo/telefone';
import { rotuloEstado } from '@/lib/nucleo/estados';
import type { Mensagem } from '@/lib/tipos-banco';
import type { ApoioAtendimento, DetalheConversa } from './tipos';
import {
  adicionarNota,
  carregarMensagensAnteriores,
  conferirEntrega,
  assumirConversa,
  devolverParaIa,
  encerrarConversa,
  enviarAudioManual,
  enviarMensagemManual,
  marcarComoLida,
  obterUrlMidia,
  reabrirConversa,
  transferirConversa,
} from './acoes';
import { useTempoReal } from './tempo-real';
import { ContextoContato } from './contexto';
import { interpolarResposta, type FilaOperacional, type RespostaRapida } from '@/lib/operacao/tipos';

export function PainelConversa({
  detalhe,
  apoio,
  meuMembroId,
  organizacaoId,
  operacional = null,
  respostas = [],
  fuso = 'America/Sao_Paulo',
}: {
  detalhe: DetalheConversa;
  apoio: ApoioAtendimento;
  meuMembroId: string;
  organizacaoId: string;
  operacional?: FilaOperacional | null;
  respostas?: RespostaRapida[];
  fuso?: string;
}) {
  const roteador = useRouter();
  const parametros=useSearchParams();const voltar=new URLSearchParams(parametros.toString());voltar.delete('conversa');
  const { conversa, contato } = detalhe;

  const [mensagens, definirMensagens] = React.useState<Mensagem[]>(detalhe.mensagens);
  const [texto, definirTexto] = React.useState('');
  const [notaInterna, definirNotaInterna] = React.useState(false);
  const [contextoAberto, definirContextoAberto] = React.useState(false);
  const chaveRascunho = `newsec:rascunho:${organizacaoId}:${meuMembroId}:${conversa.id}:${notaInterna ? "nota" : "mensagem"}`;
  const conversaAtual = React.useRef(conversa.id);
  conversaAtual.current = conversa.id;
  const alterarTexto = (valor: string) => { definirTexto(valor); try { sessionStorage.setItem(chaveRascunho, valor); } catch { /* Rascunho continua na memória se storage indisponível. */ } };
  const [enviando, definirEnviando] = React.useState(false);
  const [ocupado, definirOcupado] = React.useState(false);
  const textoAtual = React.useRef(texto);
  textoAtual.current = texto;
  const fim = React.useRef<HTMLDivElement>(null);
  const rolagem=React.useRef<HTMLDivElement>(null);
  const [historico,setHistorico]=React.useState<Mensagem[]>([]),[mais,setMais]=React.useState(detalhe.mensagens.length>=120),[carregandoHistorico,setCarregandoHistorico]=React.useState(false);
  React.useEffect(()=>{fim.current?.scrollIntoView({block:'end'});},[]);
  const visiveis=[...historico.filter(h=>!mensagens.some(m=>m.id===h.id)),...mensagens].sort((a,b)=>a.criado_em.localeCompare(b.criado_em)||a.id.localeCompare(b.id));
  async function anteriores(){const primeiro=visiveis[0];if(!primeiro)return;const idAtual=conversa.id;setCarregandoHistorico(true);try{const r=await carregarMensagensAnteriores(idAtual,primeiro.criado_em,primeiro.id);if(conversaAtual.current!==idAtual)return;if(!r.ok){toast.error(r.erro);return;}const altura=rolagem.current?.scrollHeight||0;setHistorico(h=>[...r.mensagens,...h]);setMais(r.mais);requestAnimationFrame(()=>{if(rolagem.current)rolagem.current.scrollTop+=rolagem.current.scrollHeight-altura;});}finally{setCarregandoHistorico(false);}}


  // Trocou de conversa: recomeça a lista com o que veio do servidor.
  React.useEffect(() => {
    definirMensagens(detalhe.mensagens);
  }, [detalhe.mensagens, conversa.id]);
  React.useEffect(() => {
    try { definirTexto(sessionStorage.getItem(chaveRascunho) || ''); } catch { definirTexto(''); }
  }, [chaveRascunho]);

  const aoChegarMensagem = React.useCallback((nova: Mensagem) => {
    definirMensagens((atuais) => {
      const indice = atuais.findIndex((item) => item.id === nova.id);
      if (indice >= 0) {
        const copia = atuais.slice();
        copia[indice] = nova;
        return copia;
      }
      return [...atuais, nova];
    });
  }, []);

  const { conectado } = useTempoReal({ organizacaoId, conversaId: conversa.id, aoChegarMensagem });

  React.useEffect(() => {
    const area=rolagem.current;if(!area||area.scrollHeight-area.scrollTop-area.clientHeight<220)fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens.length]);

  // "Visualizada" é um estado da conversa, não de quem olha. Se um
  // supervisor abrir a conversa de um consultor só para conferir, isso NÃO
  // pode tirá-la de "Novos" do consultor — ele ainda não a viu. Marca como
  // lida quem é o responsável, ou qualquer pessoa quando ainda não há um.
  const podeMarcarComoLida = conversa.responsavel_id === meuMembroId || !conversa.responsavel_id;
  React.useEffect(() => {
    if (conversa.nao_lidas > 0 && podeMarcarComoLida) void marcarComoLida(conversa.id);
  }, [conversa.id, conversa.nao_lidas, podeMarcarComoLida]);

  const minha = conversa.responsavel_id === meuMembroId;
  const encerrada = conversa.estado === 'ENCERRADA';
  const comOutro = conversa.estado === 'HUMANO' && !minha && Boolean(conversa.responsavel_id);
  const nome = contato.nome || contato.nome_perfil_whatsapp || formatarTelefone(contato.telefone);

  async function executar(acao: () => Promise<{ ok: boolean; erro?: string; aviso?: string }>) {
    definirOcupado(true);
    try {
      const resultado = await acao();
      if (!resultado.ok) {
        toast.error(resultado.erro ?? 'Não foi possível concluir a ação.');
        return false;
      }
      if (resultado.aviso) toast.warning(resultado.aviso);
      roteador.refresh();
      return true;
    } catch {
      toast.error('Falha de comunicação com o servidor.');
      return false;
    } finally {
      definirOcupado(false);
    }
  }

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;

    if (notaInterna) {
      if (enviando) return;

      definirEnviando(true);
      try { const r = await adicionarNota({ conversaId: conversa.id, texto: conteudo }); if (!r.ok) { toast.error(r.erro); return; } alterarTexto(''); roteador.refresh(); }
      catch { toast.error('Não foi possível salvar a nota. Seu texto foi preservado.'); }
      finally { definirEnviando(false); }
      return;
    }

    // Otimista: o balão aparece agora. Se o envio falhar, ele sai e o
    // texto volta para a caixa — em vez de sumir sem explicação.
    const provisoria: Mensagem = {
      id: `provisoria-${Date.now()}`,
      organizacao_id: organizacaoId,
      conversa_id: conversa.id,
      contato_id: contato.id,
      canal_id: conversa.canal_id,
      direcao: 'SAIDA',
      autor: 'ATENDENTE',
      autor_membro_id: meuMembroId,
      tipo: 'TEXTO',
      conteudo,
      arquivo_id: null,
      identificador_externo: null,
      chave_idempotencia: null,
      status: 'PENDENTE',
      erro: null,
      respondendo_id: null,
      campanha_id: null,
      metadados: {},
      // Reserva do despacho: mensagem recém-criada não tem nenhuma — o
      // worker é quem grava isso quando pega o envio (ver 0012_reservas_de_
      // despacho_e_de_campanha.sql), o que nunca acontece com um balão
      // otimista que só existe no navegador.
      despacho_reservado_ate: null,
      despacho_iniciado_em: null,
      despacho_incerto: false,
      // Balão otimista, local: o servidor é quem grava o nome de verdade
      // (`enviarMensagemManual`, com o nome de quem está logado). Este
      // objeto some assim que a linha real chega pelo Realtime.
      remetente_nome: null,
      criado_em: new Date().toISOString(),
      enviado_em: null,
    };

    definirMensagens((atuais) => [...atuais, provisoria]);
    alterarTexto('');

    // O envio segue em segundo plano: a caixa de texto continua livre (e com
    // o foco) para a próxima mensagem. Antes ela ficava desabilitada até o
    // servidor responder, e o atendente esperava a cada mensagem.
    void enviarEmSegundoPlano(provisoria, conteudo);
  }

  async function enviarEmSegundoPlano(provisoria: Mensagem, conteudo: string) {
    const conversaDoEnvio = conversa.id;
    const aindaNaMesmaConversa = () => conversaAtual.current === conversaDoEnvio;

    function falhar(motivo: string) {
      if (aindaNaMesmaConversa()) {
        definirMensagens((atuais) => atuais.filter((item) => item.id !== provisoria.id));
        // Devolve o texto sem apagar o que a pessoa já digitou depois.
        alterarTexto(textoAtual.current.trim() ? `${conteudo}
${textoAtual.current}` : conteudo);
      } else {
        // Já abriu outra conversa: guarda o texto como rascunho da conversa
        // de origem, para ele reaparecer quando ela voltar.
        try { sessionStorage.setItem(`newsec:rascunho:${organizacaoId}:${meuMembroId}:${conversaDoEnvio}:mensagem`, conteudo); } catch { /* Sem storage, o aviso abaixo ainda diz o que houve. */ }
      }
      toast.error(aindaNaMesmaConversa() ? motivo : `${motivo} A mensagem para ${nome} voltou para o rascunho.`);
    }

    try {
      const resultado = await enviarMensagemManual({ conversaId: conversaDoEnvio, texto: conteudo });

      if (!resultado.ok) {
        falhar(resultado.erro ?? 'Não foi possível enviar.');
        return;
      }

      if (resultado.aviso) toast.warning(resultado.aviso);
      if (!aindaNaMesmaConversa()) return;

      // Troca o balão provisório pelo definitivo. Se a linha real já chegou
      // pelo tempo real, o provisório apenas sai; senão ele assume o id real
      // e o tempo real, ao chegar, só atualiza a linha.
      const idReal = resultado.mensagemId;
      definirMensagens((atuais) => {
        if (!idReal) return atuais;
        if (atuais.some((item) => item.id === idReal)) return atuais.filter((item) => item.id !== provisoria.id);
        return atuais.map((item) => (item.id === provisoria.id ? { ...item, id: idReal } : item));
      });

      // Recarrega agora quando a tela ficaria desatualizada: enviar assume a
      // conversa (o cabeçalho ainda mostra o estado antigo) ou o tempo real
      // está fora do ar (ninguém avisaria que o "cliente aguarda" acabou).
      // Fora isso, o tempo real traz a atualização sem uma recarga extra.
      if (!conectado || conversa.estado !== 'HUMANO' || conversa.responsavel_id !== meuMembroId) roteador.refresh();
    } catch {
      falhar('Falha de comunicação com o servidor.');
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-col bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-bruma-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link href={"/atendimento?"+voltar} aria-label="Voltar à fila" className="shrink-0 md:hidden"><ArrowLeft size={19}/></Link>
          <button
            type="button"
            onClick={() => definirContextoAberto(true)}
            className="flex min-w-0 items-center gap-2.5 rounded-lg py-0.5 pr-2 text-left hover:bg-bruma-50"
            title="Ver informações do contato"
          >
            <Avatar nome={nome} foto={contato.foto_url} cor="#5794e6"/>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold text-tinta-900">{nome}</h2>
                <SeloEstado estado={conversa.estado} />
              </div>
              <p className="mt-0.5 truncate text-[12px] text-bruma-600">
                {formatarTelefone(contato.telefone)}
                {detalhe.canal ? ` · ${detalhe.canal.nome}` : ''}
                {detalhe.responsavelNome ? ` · ${detalhe.responsavelNome}` : ''}
                {detalhe.campanhaNome ? ` · veio da campanha "${detalhe.campanhaNome}"` : ''}
              </p>
            </div>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button className="botao-link min-[1400px]:hidden" onClick={() => definirContextoAberto(true)} aria-label="Abrir contexto do contato"><UserRound size={16}/></button>
          {!conectado ? (
            <span className="mr-1 flex items-center gap-1 text-[11px] text-alerta-700" title="As mensagens novas podem demorar a aparecer.">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              sem tempo real
            </span>
          ) : null}

          {encerrada ? (
            <>
              <Botao
                variante="secundario"
                tamanho="pequeno"
                disabled={ocupado}
                onClick={() => void executar(() => reabrirConversa(conversa.id, false))}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reabrir
              </Botao>
              {detalhe.canal?.ia_ativa ? (
                <Botao
                  variante="fantasma"
                  tamanho="pequeno"
                  disabled={ocupado}
                  onClick={() => void executar(() => reabrirConversa(conversa.id, true))}
                >
                  <Bot className="h-3.5 w-3.5" aria-hidden />
                  Reabrir com IA
                </Botao>
              ) : null}
            </>
          ) : (
            <>
              {!minha ? (
                <Botao
                  tamanho="pequeno"
                  disabled={ocupado}
                  onClick={() => void executar(() => assumirConversa(conversa.id))}
                >
                  <Hand className="h-3.5 w-3.5" aria-hidden />
                  Assumir
                </Botao>
              ) : null}

              <DialogoTransferir
                apoio={apoio}
                ocupado={ocupado}
                aoConfirmar={(dados) =>
                  executar(() =>
                    transferirConversa({
                      conversaId: conversa.id,
                      departamentoId: dados.departamentoId,
                      membroId: dados.membroId,
                      motivo: dados.motivo,
                    }),
                  )
                }
              />

              <DialogoEncerrar
                ocupado={ocupado}
                aoConfirmar={(motivo) => executar(() => encerrarConversa(conversa.id, motivo, conversa.versao))}
              />
              <details className="relative"><summary aria-label="Mais ações do atendimento" className="flex h-8 w-7 cursor-pointer list-none items-center justify-center rounded hover:bg-bruma-100"><MoreVertical size={18}/></summary><div className="absolute right-0 top-10 z-20 min-w-44 rounded border bg-white p-2 shadow-lg">              {conversa.estado !== 'IA' && detalhe.canal?.ia_ativa ? (
                <Botao
                  variante="fantasma"
                  tamanho="pequeno"
                  disabled={ocupado}
                  onClick={() => void executar(() => devolverParaIa(conversa.id))}
                  title="A IA volta a responder esta conversa"
                >
                  <Bot className="h-3.5 w-3.5" aria-hidden />
                  Devolver à IA
                </Botao>
              ) : null}

              <DialogoNota
                ocupado={ocupado}
                aoConfirmar={(nota) =>
                  executar(() => adicionarNota({ conversaId: conversa.id, texto: nota }))
                }
              />

</div></details>

            </>
          )}
        </div>
      </header>

      <div className="space-y-1.5 px-3 pt-2">
        {mensagens.filter(m=>m.despacho_incerto || m.despacho_iniciado_em&&m.status==='ENFILEIRADA'&&Date.now()-Date.parse(m.despacho_iniciado_em)>120000).map(m=><details key={m.id} className="aviso-operacional !block"><summary>Entrega em confirmação · confira o canal antes de agir</summary><p className="my-2">{m.conteudo||'Mensagem de mídia'}</p><p className="mb-2">Após conferir no WhatsApp, a supervisão pode registrar o resultado.</p><div className="flex flex-wrap gap-2"><button disabled={ocupado} className="botao-link" onClick={()=>void executar(()=>conferirEntrega(m.id,true))}>Conferi: foi enviada</button><button disabled={ocupado} className="botao-link" onClick={()=>void executar(()=>conferirEntrega(m.id,false))}>Conferi: não foi enviada</button></div></details>)}

        {operacional?.para_responder && <div className="aviso-operacional"><Clock size={16}/>{operacional.espera_desde ? `Cliente aguarda ${formatarEspera(operacional.espera_desde)}` : 'Cliente aguarda atendimento humano'}{operacional.resposta_vencida ? ' · prazo vencido' : ''}</div>}
        {!encerrada && <div className="flex items-center gap-2 rounded border border-ia-50 bg-ia-50 px-3 py-2 text-xs text-ia-700"><Sparkles size={17}/>{conversa.estado === 'HUMANO' ? 'Atendimento humano · IA pausada' : conversa.estado === 'AGUARDANDO_HUMANO' ? 'Aguardando humano · IA pausada' : 'Assistente IA em atendimento'}</div>}
      </div>

      <div ref={rolagem} className="min-h-0 flex-1 overflow-y-auto rolagem-fina px-4 py-4">
        {mais&&<button disabled={carregandoHistorico} onClick={()=>void anteriores()} className="mb-4 w-full text-xs text-produto-800">{carregandoHistorico?'Carregando…':'Carregar mensagens anteriores'}</button>}
        <ol className="mx-auto flex max-w-3xl flex-col gap-2">
          {[
            ...visiveis.map(m=>({tipo:'mensagem' as const,data:m.criado_em,id:m.id,m})),
            ...detalhe.eventos.filter(e=>e.criado_em>=(visiveis[0]?.criado_em||'')).map(e=>({tipo:'evento' as const,data:e.criado_em,id:e.id,e})),
          ].sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id)).map(item=>item.tipo==='evento' ? <li key={item.id} className="my-2 flex justify-center"><span className="flex max-w-[90%] items-center gap-2 rounded bg-bruma-50 px-3 py-2 text-[11px] text-bruma-600"><UserRound size={14}/>{rotuloEvento(item.e.tipo)}{item.e.motivo?' · '+item.e.motivo:''} · {formatarHora(item.data,fuso)}</span></li> : (

            <BalaoMensagem
              key={item.id}
              mensagem={item.m}
              nomeContato={nome}
              fotoContato={contato.foto_url}
              fuso={fuso}
              anterior={visiveis[visiveis.findIndex(m=>m.id===item.id)-1]??null}
            />
          ))}
        </ol>

        {detalhe.notas.length ? (
          <div className="mx-auto mt-6 max-w-3xl rounded-lg border border-alerta-100 bg-alerta-100/30 px-3 py-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-alerta-700">
              <StickyNote className="h-3 w-3" aria-hidden />
              Notas internas (o cliente não vê)
            </p>
            <ul className="space-y-1.5">
              {detalhe.notas.map((nota) => (
                <li key={nota.id} className="text-[12.5px] leading-relaxed text-tinta-800">
                  <span className="font-medium">{nota.autorNome ?? 'Atendente'}</span>
                  <span className="text-bruma-500"> · {formatarDataHora(nota.criado_em)}</span>
                  <p className="whitespace-pre-wrap">{nota.conteudo}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div ref={fim} />
      </div>

      <footer className="border-t border-bruma-200 bg-white px-3 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {encerrada ? (
          <p className="flex items-center justify-center gap-2 py-2 text-[13px] text-bruma-600">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Conversa encerrada
            {conversa.encerrada_em ? ` em ${formatarDataHora(conversa.encerrada_em)}` : ''}. Reabra para
            responder.
          </p>
        ) : (
          <form onSubmit={aoEnviar} className="mx-auto max-w-3xl">
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b pb-1"><div role="tablist" aria-label="Tipo de conteúdo" className="abas-operacionais !border-0"><button type="button" role="tab" disabled={enviando} aria-selected={!notaInterna} onClick={() => definirNotaInterna(false)}>Mensagem</button><button type="button" role="tab" disabled={enviando} aria-selected={notaInterna} onClick={() => definirNotaInterna(true)}>Nota interna</button></div><label className="ml-auto flex items-center gap-2 text-[10px] text-bruma-600">Respostas rápidas<select aria-label="Inserir resposta rápida" className="h-7 max-w-[150px] rounded border bg-white px-1 text-[11px]" value="" onChange={e => { const r=respostas.find(i=>i.id===e.target.value); if(!r)return; const v=interpolarResposta(r.conteudo,contato); if(v.ausentes.length){toast.error('Preencha as variáveis: '+v.ausentes.join(', '));return;} alterarTexto(texto ? texto+'\n'+v.texto : v.texto); }}><option value="">Inserir modelo</option>{respostas.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label></div>
            {notaInterna && <p className="mb-2 rounded bg-alerta-100 p-2 text-xs text-alerta-700">Visível apenas para a equipe. Não será enviada ao cliente.</p>}
            {comOutro ? (
              <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-alerta-100/50 px-2.5 py-1.5 text-[12.5px] text-alerta-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Esta conversa está com {detalhe.responsavelNome ?? 'outro atendente'}. Peça a transferência antes de responder.
              </p>
            ) : null}

            {conversa.estado === 'IA' ? (
              <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-tinta-900 px-2.5 py-1.5 text-[12.5px] text-bruma-200">
                <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
                A IA está atendendo. Ao enviar uma mensagem, você assume e a IA para de responder.
              </p>
            ) : null}

            <div className="flex items-end gap-2">
              <AreaTexto
                disabled={enviando || (comOutro && !notaInterna)}
                value={texto}
                onChange={(evento) => alterarTexto(evento.target.value)}
                onKeyDown={(evento) => {
                  // Enter envia; Shift+Enter quebra linha — como no WhatsApp.
                  if (evento.key === 'Enter' && !evento.shiftKey) {
                    evento.preventDefault();
                    void aoEnviar(evento);
                  }
                }}
                placeholder={notaInterna ? 'Adicione uma nota para a equipe…' : `Escreva para ${nome}…`}
                aria-label="Mensagem"
                rows={2}
                maxLength={4000}
                className="min-h-[44px] resize-none"
              />
              {texto.trim() || notaInterna ? (
                <Botao type="submit" carregando={enviando} className="h-[44px]">
                  <Send className="h-4 w-4" aria-hidden />
                  {notaInterna ? 'Salvar nota' : 'Enviar'}
                </Botao>
              ) : (
                <GravadorAudio
                  conversaId={conversa.id}
                  desabilitado={ocupado||comOutro}
                  aoEnviar={(formData) => executar(() => enviarAudioManual(formData))}
                />
              )}
            </div>

            {detalhe.canal && (!detalhe.canal.ativo || detalhe.canal.status !== 'CONECTADO') ? (
              <p className="mt-2 text-[12px] text-alerta-700">
                O canal “{detalhe.canal.nome}” não está conectado. A mensagem fica na fila e sai quando a
                conexão voltar.
              </p>
            ) : null}
          </form>
        )}
      </footer>
      <Dialogo open={contextoAberto} onOpenChange={definirContextoAberto}><ConteudoDialogo titulo="Contexto do contato" descricao={nome}><ContextoContato detalhe={detalhe} apoio={apoio} operacional={operacional} membroId={meuMembroId} fuso={fuso}/></ConteudoDialogo></Dialogo>
    </section>
  );
}

function rotuloEvento(tipo:string){const nomes:Record<string,string>={CRIADA:'Conversa iniciada',ASSUMIU:'Atendimento assumido',TRANSFERIDA:'Atendimento transferido',ENCERRADA:'Conversa concluída',REABERTA:'Conversa reaberta',DEVOLVIDA_IA:'IA retomada',RETORNO_AGENDADO:'Retorno agendado',RETORNO_ATUALIZADO:'Retorno atualizado'};return nomes[tipo]||'Atendimento atualizado';}
function SeloEstado({ estado }: { estado: DetalheConversa['conversa']['estado'] }) {
  const tons = {
    IA: 'ia',
    AGUARDANDO_HUMANO: 'alerta',
    HUMANO: 'produto',
    AGUARDANDO_CLIENTE: 'neutro',
    ENCERRADA: 'neutro',
  } as const;

  return <Selo tom={tons[estado]}>{rotuloEstado[estado]}</Selo>;
}

function BalaoMensagem({ mensagem, anterior,nomeContato,fotoContato,fuso }: { mensagem: Mensagem; anterior: Mensagem | null;nomeContato:string;fotoContato?:string|null;fuso:string }) {
  const daEmpresa = mensagem.direcao === 'SAIDA';
  const daIa = mensagem.autor === 'IA';

  if (mensagem.autor === 'SISTEMA' && mensagem.tipo === 'SISTEMA') {
    return (
      <li className="flex justify-center">
        <p className="balao balao-sistema">{mensagem.conteudo}</p>
      </li>
    );
  }

  const mudouDeDia =
    !anterior ||
    new Date(anterior.criado_em).toDateString() !== new Date(mensagem.criado_em).toDateString();

  return (
    <>
      {mudouDeDia ? (
        <li className="my-2 flex justify-center">
          <span className="rounded-lg bg-bruma-200 px-2 py-0.5 text-[11px] font-medium text-tinta-700">
            {new Intl.DateTimeFormat('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              timeZone: fuso,
            }).format(new Date(mensagem.criado_em))}
          </span>
        </li>
      ) : null}

      <li className={cn('flex items-start gap-2 py-2', daEmpresa ? 'justify-end' : 'justify-start')}>
        {!daEmpresa&&<Avatar nome={nomeContato} foto={fotoContato} pequeno cor="#5794e6"/>}
        <div className="max-w-[85%]"><p className={cn('mb-1 text-[10px] text-bruma-600',daEmpresa&&'text-right')}>{daEmpresa?(mensagem.remetente_nome|| (daIa?'Assistente IA':'Consultor')):nomeContato} · {formatarHora(mensagem.criado_em,fuso)}</p><div
          className={cn(
            'balao !max-w-full',
            !daEmpresa && 'balao-entrada',
            daEmpresa && daIa && 'balao-saida-ia',
            daEmpresa && !daIa && 'balao-saida-humano',
          )}
        >
          {daIa ? (
            <span className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide opacity-70">
              <Bot className="h-3 w-3" aria-hidden />
              IA
            </span>
          ) : null}

          {mensagem.tipo !== 'TEXTO' && mensagem.tipo !== 'SISTEMA' ? (
            <span className="mb-1 block text-[11px] font-medium opacity-70">
              {rotuloTipo(mensagem.tipo)}
            </span>
          ) : null}

          {mensagem.tipo === 'AUDIO' && mensagem.arquivo_id ? (
            <PlayerAudio arquivoId={mensagem.arquivo_id} />
          ) : null}

          {mensagem.tipo === 'AUDIO' ? (
            mensagem.conteudo ? (
              <span className="italic opacity-90">“{mensagem.conteudo}”</span>
            ) : (
              <span className="italic opacity-60">Transcrevendo…</span>
            )
          ) : (
            <span>{mensagem.conteudo || '—'}</span>
          )}

          <span
            className={cn(
              'mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums',
              daEmpresa ? 'opacity-70' : 'text-bruma-500',
            )}
          >
            {formatarHora(mensagem.criado_em,fuso)}
            {daEmpresa ? <IconeStatus status={mensagem.status} /> : null}
          </span>

          {mensagem.status === 'FALHOU' && mensagem.erro ? (
            <span className="mt-1 block text-[11px] font-medium text-marca-600">
              Falha no envio: {mensagem.erro}
            </span>
          ) : null}
        </div></div>{daIa&&<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ia-500 text-white"><Sparkles size={17}/></span>}
      </li>
    </>
  );
}

/**
 * Player de áudio. O link é temporário (assinado, expira em 1 hora) e
 * gerado sob demanda — o arquivo é privado, então a tela nunca guarda
 * uma URL fixa. Tenta uma vez, e de novo em 3s se o arquivo ainda não
 * tiver sido baixado do provedor de mensageria (é o normal nos primeiros
 * segundos depois de o áudio chegar).
 */
function PlayerAudio({ arquivoId }: { arquivoId: string }) {
  const [url, definirUrl] = React.useState<string | null>(null);
  const [falhou, definirFalhou] = React.useState(false);

  React.useEffect(() => {
    let cancelado = false;

    async function buscar() {
      const resultado = await obterUrlMidia(arquivoId);
      if (cancelado) return;

      if (resultado.ok && resultado.url) {
        definirUrl(resultado.url);
      } else if (resultado.erro) {
        definirFalhou(true);
      } else {
        // Ainda sem `caminho` no arquivo: tenta de novo em breve.
        setTimeout(() => {
          if (!cancelado) buscar();
        }, 3000);
      }
    }

    void buscar();
    return () => {
      cancelado = true;
    };
  }, [arquivoId]);

  if (falhou) return null;
  if (!url) {
    return <p className="mb-1 text-[12px] italic opacity-70">Carregando áudio…</p>;
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- é áudio de conversa, não vídeo com fala gravada; a transcrição já aparece logo abaixo.
    <audio controls preload="none" src={url} className="mb-1 h-9 w-full max-w-[260px]" />
  );
}

/**
 * Gravador de nota de voz. Grava no formato que o navegador entrega (webm
 * na maioria; a conversão para o ogg/opus que o WhatsApp exige acontece
 * depois, no worker — ver `transcodificarParaNotaDeVoz` em
 * lib/servicos/envio.ts). Some o botão de gravar e aparece o de enviar
 * assim que há texto digitado, e vice-versa — como no WhatsApp.
 */
function GravadorAudio({
  conversaId,
  desabilitado,
  aoEnviar,
}: {
  conversaId: string;
  desabilitado: boolean;
  aoEnviar: (formData: FormData) => Promise<boolean>;
}) {
  const [gravando, definirGravando] = React.useState(false);
  const [enviando, definirEnviando] = React.useState(false);
  const [segundos, definirSegundos] = React.useState(0);
  // Parar a gravação só monta a prévia — precisa do botão Enviar pra sair.
  const [pronto, definirPronto] = React.useState<{ blob: Blob; url: string; segundos: number } | null>(
    null,
  );

  const gravadorRef = React.useRef<MediaRecorder | null>(null);
  const pedacosRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const intervaloRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inicioRef = React.useRef(0);
  // `stop()` dispara um último `dataavailable` antes do `onstop` — limpar
  // pedacosRef antes de chamar stop() não bastava: esse último pedaço
  // enchia o array de novo depois de já ter sido esvaziado, e o áudio saía
  // mesmo cancelado. Esta flag é o que o onstop confere, não o array.
  const canceladoRef = React.useRef(false);

  function encerrarCaptura() {
    streamRef.current?.getTracks().forEach((trilha) => trilha.stop());
    streamRef.current = null;
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = null;
  }

  // Sai da tela (troca de conversa, digitou texto e o componente foi
  // substituído pelo botão Enviar, etc.) com gravação em andamento ou
  // prévia pronta — nos dois casos, cancela. Nada é enviado sem o clique
  // explícito em "Enviar".
  React.useEffect(() => {
    return () => {
      if (gravadorRef.current && gravadorRef.current.state !== 'inactive') {
        canceladoRef.current = true;
        gravadorRef.current.stop();
      }
      encerrarCaptura();
    };
  }, []);

  async function iniciar() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Este navegador não permite gravar áudio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      pedacosRef.current = [];
      canceladoRef.current = false;

      const gravador = new MediaRecorder(stream);
      gravadorRef.current = gravador;

      gravador.ondataavailable = (evento) => {
        if (evento.data.size > 0) pedacosRef.current.push(evento.data);
      };

      gravador.onstop = () => {
        const cancelado = canceladoRef.current;
        const pedacos = pedacosRef.current;
        const duracao = Math.round((Date.now() - inicioRef.current) / 1000);
        encerrarCaptura();
        definirSegundos(0);

        if (cancelado || !pedacos.length) return;

        const blob = new Blob(pedacos, { type: gravador.mimeType || 'audio/webm' });
        definirPronto({ blob, url: URL.createObjectURL(blob), segundos: duracao });
      };

      gravador.start();
      inicioRef.current = Date.now();
      definirGravando(true);
      definirSegundos(0);
      intervaloRef.current = setInterval(() => definirSegundos((atual) => atual + 1), 1000);
    } catch {
      toast.error('Não foi possível acessar o microfone. Confira a permissão do navegador.');
    }
  }

  /** Só para — a prévia fica pra conferir antes de mandar. */
  function parar() {
    gravadorRef.current?.stop();
    definirGravando(false);
  }

  /** Descarta sem enviar — vale gravando ou já parado com prévia pronta. */
  function cancelar() {
    if (pronto) {
      URL.revokeObjectURL(pronto.url);
      definirPronto(null);
      return;
    }
    canceladoRef.current = true;
    gravadorRef.current?.stop();
    definirGravando(false);
  }

  async function enviar() {
    if (!pronto) return;
    const { blob, url } = pronto;

    definirEnviando(true);
    try {
      const formData = new FormData();
      formData.set('conversaId', conversaId);
      formData.set('audio', blob, 'nota-de-voz.webm');
      await aoEnviar(formData);
      URL.revokeObjectURL(url);
      definirPronto(null);
    } finally {
      definirEnviando(false);
    }
  }

  if (pronto) {
    const minutos = String(Math.floor(pronto.segundos / 60)).padStart(2, '0');
    const restoSegundos = String(pronto.segundos % 60).padStart(2, '0');

    return (
      <div className="flex h-[44px] items-center gap-2 rounded-lg border border-bruma-300 bg-white px-3">
        <button
          type="button"
          onClick={cancelar}
          disabled={enviando}
          className="shrink-0 text-bruma-600 hover:text-erro-600"
          title="Descartar"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <span className="tabular-nums text-[13px] text-tinta-700">
          {minutos}:{restoSegundos}
        </span>
        <audio src={pronto.url} controls className="h-8 flex-1" />
        <Botao
          type="button"
          tamanho="pequeno"
          onClick={enviar}
          carregando={enviando}
          className="ml-auto shrink-0"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          Enviar
        </Botao>
      </div>
    );
  }

  if (gravando) {
    const minutos = String(Math.floor(segundos / 60)).padStart(2, '0');
    const restoSegundos = String(segundos % 60).padStart(2, '0');

    return (
      <div className="flex h-[44px] items-center gap-2 rounded-lg border border-bruma-300 bg-white px-3">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-marca-500" aria-hidden />
        <span className="tabular-nums text-[13px] text-tinta-700">
          {minutos}:{restoSegundos}
        </span>
        <button
          type="button"
          onClick={cancelar}
          className="text-[12.5px] text-bruma-600 hover:text-tinta-900"
        >
          Cancelar
        </button>
        <Botao type="button" tamanho="pequeno" onClick={parar} className="ml-auto">
          <Square className="h-3.5 w-3.5" aria-hidden />
          Parar
        </Botao>
      </div>
    );
  }

  return (
    <Botao
      type="button"
      variante="secundario"
      onClick={iniciar}
      disabled={desabilitado || enviando}
      carregando={enviando}
      className="h-[44px] px-3"
      title="Gravar áudio"
    >
      <Mic className="h-4 w-4" aria-hidden />
    </Botao>
  );
}

function rotuloTipo(tipo: Mensagem['tipo']): string {
  const mapa: Partial<Record<Mensagem['tipo'], string>> = {
    IMAGEM: '📷 Imagem',
    AUDIO: '🎤 Áudio',
    VIDEO: '🎬 Vídeo',
    DOCUMENTO: '📄 Documento',
    STICKER: 'Figurinha',
    LOCALIZACAO: '📍 Localização',
    CONTATO: '👤 Contato',
  };
  return mapa[tipo] ?? '';
}

function IconeStatus({ status }: { status: Mensagem['status'] }) {
  if (status === 'PENDENTE' || status === 'ENFILEIRADA') {
    return <Clock className="h-3 w-3" aria-label="Aguardando envio" />;
  }
  if (status === 'ENVIADA') return <Check className="h-3 w-3" aria-label="Enviada" />;
  if (status === 'ENTREGUE') return <CheckCheck className="h-3 w-3" aria-label="Entregue" />;
  if (status === 'LIDA') return <CheckCheck className="h-3 w-3 text-produto-100" aria-label="Lida" />;
  if (status === 'FALHOU') return <XCircle className="h-3 w-3" aria-label="Falhou" />;
  return null;
}

function DialogoTransferir({
  apoio,
  ocupado,
  aoConfirmar,
}: {
  apoio: ApoioAtendimento;
  ocupado: boolean;
  aoConfirmar: (dados: {
    departamentoId: string | null;
    membroId: string | null;
    motivo: string;
  }) => Promise<boolean>;
}) {
  const [aberto, definirAberto] = React.useState(false);
  const [departamentoId, definirDepartamento] = React.useState('');
  const [membroId, definirMembro] = React.useState('');
  const [motivo, definirMotivo] = React.useState('');

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <Botao variante="secundario" tamanho="pequeno" disabled={ocupado} onClick={() => definirAberto(true)}>
        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
        Transferir
      </Botao>

      <ConteudoDialogo
        titulo="Transferir conversa"
        descricao="Escolha o departamento, o atendente, ou os dois. Quem receber vê todo o histórico e o que a IA já apurou."
      >
        <CorpoDialogo>
          <Campo rotulo="Departamento" htmlFor="transferir-departamento">
            <Selecao
              id="transferir-departamento"
              value={departamentoId}
              onChange={(evento) => definirDepartamento(evento.target.value)}
            >
              <option value="">Manter o atual</option>
              {apoio.departamentos.map((departamento) => (
                <option key={departamento.id} value={departamento.id}>
                  {departamento.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo
            rotulo="Atendente"
            htmlFor="transferir-membro"
            ajuda="Sem escolher ninguém, a conversa fica na fila do departamento."
          >
            <Selecao
              id="transferir-membro"
              value={membroId}
              onChange={(evento) => definirMembro(evento.target.value)}
            >
              <option value="">Deixar na fila</option>
              {apoio.atendentes.map((atendente) => (
                <option key={atendente.membroId} value={atendente.membroId}>
                  {atendente.nome}
                </option>
              ))}
            </Selecao>
          </Campo>

          <Campo rotulo="Motivo" htmlFor="transferir-motivo" ajuda="Fica no histórico da conversa.">
            <AreaTexto
              id="transferir-motivo"
              value={motivo}
              onChange={(evento) => definirMotivo(evento.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex.: cliente quer falar de prazo processual"
            />
          </Campo>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            disabled={!departamentoId && !membroId}
            onClick={async () => {
              const certo = await aoConfirmar({
                departamentoId: departamentoId || null,
                membroId: membroId || null,
                motivo,
              });
              if (certo) {
                definirAberto(false);
                definirMotivo('');
              }
            }}
          >
            Transferir
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}

function DialogoEncerrar({
  ocupado,
  aoConfirmar,
}: {
  ocupado: boolean;
  aoConfirmar: (motivo: string) => Promise<boolean>;
}) {
  const [aberto, definirAberto] = React.useState(false);
  const [motivo, definirMotivo] = React.useState('');

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <Botao variante="principal" tamanho="pequeno" disabled={ocupado} onClick={() => definirAberto(true)}>
        <Check className="h-3.5 w-3.5" aria-hidden />
        Concluir
      </Botao>

      <ConteudoDialogo
        titulo="Concluir atendimento"
        descricao="A conversa sai da fila aberta e mantém seu histórico. Novas mensagens seguem a regra de reabertura da operação."
      >
        <CorpoDialogo>
          <Campo rotulo="Como terminou?" htmlFor="encerrar-motivo">
            <AreaTexto
              id="encerrar-motivo"
              value={motivo}
              onChange={(evento) => definirMotivo(evento.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: cliente sem interesse no momento"
            />
          </Campo>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            variante="destrutivo"
            onClick={async () => {
              const certo = await aoConfirmar(motivo);
              if (certo) {
                definirAberto(false);
                definirMotivo('');
              }
            }}
          >
            Concluir
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}

function DialogoNota({
  ocupado,
  aoConfirmar,
}: {
  ocupado: boolean;
  aoConfirmar: (nota: string) => Promise<boolean>;
}) {
  const [aberto, definirAberto] = React.useState(false);
  const [nota, definirNota] = React.useState('');

  return (
    <Dialogo open={aberto} onOpenChange={definirAberto}>
      <Botao variante="fantasma" tamanho="pequeno" disabled={ocupado} onClick={() => definirAberto(true)}>
        <StickyNote className="h-3.5 w-3.5" aria-hidden />
        Nota
      </Botao>

      <ConteudoDialogo
        titulo="Nota interna"
        descricao="Fica visível só para a equipe. O cliente nunca recebe esse texto."
      >
        <CorpoDialogo>
          <Campo rotulo="Nota" htmlFor="nota-conteudo">
            <AreaTexto
              id="nota-conteudo"
              value={nota}
              onChange={(evento) => definirNota(evento.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ex.: cliente pediu retorno depois das 18h"
            />
          </Campo>
        </CorpoDialogo>

        <RodapeDialogo>
          <Botao variante="secundario" onClick={() => definirAberto(false)}>
            Cancelar
          </Botao>
          <Botao
            disabled={!nota.trim()}
            onClick={async () => {
              const certo = await aoConfirmar(nota);
              if (certo) {
                definirAberto(false);
                definirNota('');
              }
            }}
          >
            Salvar nota
          </Botao>
        </RodapeDialogo>
      </ConteudoDialogo>
    </Dialogo>
  );
}
