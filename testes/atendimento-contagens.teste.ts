import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

/**
 * Tela de Atendimento: escopos (meu, equipe, IA) e filtros (novos, não
 * respondidos, todos), como o banco os conta.
 *
 * Definições que estes testes fixam, ditas pelo dono do produto:
 *
 *   Novo             o cliente escreveu e ninguém VISUALIZOU a conversa
 *   Não respondido   já foi visualizada, mas o cliente continua sem resposta
 *   Todos            todo o atendimento do escopo
 *
 * "Visualizar" é abrir a conversa (o contador `nao_lidas` zera). Nota
 * interna e leitura não encerram a espera do cliente — só uma resposta
 * humana enviada.
 *
 * Roda só com uma URL de banco descartável em SUPABASE_DB_URL (nunca lê o
 * .env.local); cada teste roda numa transação que é desfeita no fim.
 */
const url = process.env.SUPABASE_DB_URL;

describe.skipIf(!url)('atendimento: contagens por escopo e filtro', () => {
  let db: pg.Client;
  let org: string;
  let canal: string;
  let equipe: string;
  let consultor: { perfil: string; membro: string };
  let outroConsultor: { perfil: string; membro: string };
  let supervisor: { perfil: string; membro: string };

  const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: url, ssl: url?.includes('localhost') ? false : { rejectUnauthorized: false } });
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  async function criarMembro(email: string, papel: 'ATENDENTE' | 'SUPERVISOR') {
    const perfil = (await q('insert into auth.users(email) values($1) returning id', [email]))[0].id as string;
    const membro = (
      await q('insert into membros_organizacao(organizacao_id,perfil_id,papel) values($1,$2,$3) returning id', [org, perfil, papel])
    )[0].id as string;
    await q('insert into membros_departamento(organizacao_id,membro_id,departamento_id) values($1,$2,$3)', [org, membro, equipe]);
    return { perfil, membro };
  }

  beforeEach(async () => {
    await q('begin');
    await q(`select set_config('request.jwt.claims','{"role":"service_role"}',true)`);
    org = (await q(`insert into organizacoes(nome,apelido) values('Teste atendimento',gen_random_uuid()::text) returning id`))[0].id;
    equipe = (await q(`insert into departamentos(organizacao_id,nome,chave) values($1,'Comercial','comercial') returning id`, [org]))[0].id;
    canal = (
      await q(
        `insert into canais(organizacao_id,nome,provedor,status,departamento_id,identificador_externo) values($1,'Simulado','SIMULADO','CONECTADO',$2,gen_random_uuid()::text) returning id`,
        [org, equipe],
      )
    )[0].id;
    await q('insert into regras_atendimento(organizacao_id,versao) values($1,1)', [org]);
    consultor = await criarMembro('consultor@atendimento.local', 'ATENDENTE');
    outroConsultor = await criarMembro('outro@atendimento.local', 'ATENDENTE');
    supervisor = await criarMembro('supervisor@atendimento.local', 'SUPERVISOR');
  });

  afterEach(async () => {
    await q('rollback');
  });

  async function autenticarComo(perfil: string) {
    await q(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: perfil, role: 'authenticated' })]);
    await q('set local role authenticated');
  }

  /** Cria contato + conversa no estado pedido. Cada conversa tem o seu contato (só há uma aberta por contato e canal). */
  async function conversa(estado: string, responsavel: string | null, naoLidas = 0) {
    const contato = (
      await q(`insert into contatos(organizacao_id,nome,telefone,departamento_id) values($1,'Cliente',$2,$3) returning id`, [
        org,
        `55119${Math.floor(Math.random() * 1e8)}`,
        equipe,
      ])
    )[0].id as string;

    const id = (
      await q(
        `insert into conversas(organizacao_id,contato_id,canal_id,departamento_id,estado,responsavel_id,nao_lidas)
         values($1,$2,$3,$4,$5,$6,$7) returning id`,
        [org, contato, canal, equipe, estado, responsavel, naoLidas],
      )
    )[0].id as string;

    return { id, contato };
  }

  async function clienteEscreve(c: { id: string; contato: string }) {
    await q(
      `insert into mensagens(organizacao_id,conversa_id,contato_id,canal_id,direcao,autor,tipo,conteudo,status,criado_em)
       values($1,$2,$3,$4,'ENTRADA','CONTATO','TEXTO','Preciso de ajuda','ENTREGUE',now() - interval '5 minutes')`,
      [org, c.id, c.contato, canal],
    );
  }

  async function atendenteResponde(c: { id: string; contato: string }, membro: string) {
    await q(
      `insert into mensagens(organizacao_id,conversa_id,contato_id,canal_id,direcao,autor,autor_membro_id,tipo,conteudo,status,enviado_em)
       values($1,$2,$3,$4,'SAIDA','ATENDENTE',$5,'TEXTO','Já te ajudo','ENVIADA',now() - interval '1 minute')`,
      [org, c.id, c.contato, canal, membro],
    );
  }

  /**
   * Chama a função como o usuário logado, que é como a aplicação chama. É
   * essencial: sem isso o teste roda como superusuário e enxerga dados de
   * outras organizações (a função confia na RLS para restringir).
   */
  async function contagens(membro: string, busca = '') {
    const perfil = [consultor, outroConsultor, supervisor].find((m) => m.membro === membro)?.perfil;
    if (!perfil) throw new Error('membro desconhecido no teste');

    await autenticarComo(perfil);

    try {
      const linha = (await q('select atendimento_contagens($1,$2) as c', [membro, busca]))[0].c;
      return linha as {
        meu: { novos: number; nao_respondidos: number; todos: number };
        equipe: { novos: number; nao_respondidos: number; todos: number };
        ia: { todos: number; falhas: number };
      };
    } finally {
      await q('reset role');
      await q(`select set_config('request.jwt.claims','{"role":"service_role"}',true)`);
    }
  }

  it('Novo é conversa que ninguém visualizou; ao abrir, sai de Novos e vai para Não respondidos', async () => {
    const c = await conversa('HUMANO', consultor.membro, 1);
    await clienteEscreve(c);

    let n = await contagens(consultor.membro);
    expect(n.meu).toEqual({ novos: 1, nao_respondidos: 0, todos: 1 });

    // O atendente abre a conversa: `marcarComoLida` zera o contador.
    await q('update conversas set nao_lidas=0 where id=$1', [c.id]);

    n = await contagens(consultor.membro);
    expect(n.meu).toEqual({ novos: 0, nao_respondidos: 1, todos: 1 });
  });

  it('Não respondido some quando o atendente responde, mas a conversa continua em Todos', async () => {
    const c = await conversa('HUMANO', consultor.membro, 0);
    await clienteEscreve(c);

    expect((await contagens(consultor.membro)).meu.nao_respondidos).toBe(1);

    await atendenteResponde(c, consultor.membro);

    const n = await contagens(consultor.membro);
    expect(n.meu).toEqual({ novos: 0, nao_respondidos: 0, todos: 1 });
  });

  it('nota interna não conta como resposta: a conversa continua não respondida', async () => {
    const c = await conversa('HUMANO', consultor.membro, 0);
    await clienteEscreve(c);
    await q(`insert into notas_internas(organizacao_id,conversa_id,autor_membro_id,conteudo) values($1,$2,$3,'Anotação')`, [
      org,
      c.id,
      consultor.membro,
    ]);

    expect((await contagens(consultor.membro)).meu.nao_respondidos).toBe(1);
  });

  it('Novos e Não respondidos são fatias que não se sobrepõem: a soma nunca passa de Todos', async () => {
    const nova = await conversa('HUMANO', consultor.membro, 2);
    const aberta = await conversa('HUMANO', consultor.membro, 0);
    const respondida = await conversa('HUMANO', consultor.membro, 0);
    await clienteEscreve(nova);
    await clienteEscreve(aberta);
    await clienteEscreve(respondida);
    await atendenteResponde(respondida, consultor.membro);

    const { meu } = await contagens(consultor.membro);
    expect(meu).toEqual({ novos: 1, nao_respondidos: 1, todos: 3 });
    expect(meu.novos + meu.nao_respondidos).toBeLessThanOrEqual(meu.todos);
  });

  it('Meu atendimento só conta o que é do usuário; Equipe conta todo o atendimento humano', async () => {
    const minha = await conversa('HUMANO', consultor.membro, 1);
    const doColega = await conversa('HUMANO', outroConsultor.membro, 1);
    const semDono = await conversa('AGUARDANDO_HUMANO', null, 1);
    await clienteEscreve(minha);
    await clienteEscreve(doColega);
    await clienteEscreve(semDono);

    const n = await contagens(consultor.membro);
    expect(n.meu.todos).toBe(1);
    expect(n.equipe.todos).toBe(3);
    // Fila humana sem responsável (a IA pediu uma pessoa) aparece na Equipe, não em Meu atendimento.
    expect(n.equipe.novos).toBe(3);
  });

  it('a IA fica separada: conversas com a IA não entram em Meu atendimento nem em Equipe', async () => {
    await conversa('IA', null, 3);
    await conversa('AGUARDANDO_CLIENTE', null, 0);
    await conversa('HUMANO', consultor.membro, 0);

    const n = await contagens(supervisor.membro);
    expect(n.ia.todos).toBe(2);
    expect(n.equipe.todos).toBe(1);
    expect(n.meu.todos).toBe(0);
  });

  it('gestor que não atende vê Meu atendimento zerado e o restante nas outras abas', async () => {
    await conversa('HUMANO', consultor.membro, 1);
    await conversa('IA', null, 0);

    const n = await contagens(supervisor.membro);
    expect(n.meu).toEqual({ novos: 0, nao_respondidos: 0, todos: 0 });
    expect(n.equipe.todos).toBe(1);
    expect(n.ia.todos).toBe(1);
  });

  it('conversa concluída não entra em nenhuma contagem', async () => {
    await conversa('ENCERRADA', consultor.membro, 0);

    const n = await contagens(consultor.membro);
    expect(n.meu.todos + n.equipe.todos + n.ia.todos).toBe(0);
  });

  it('atendente com escopo "próprias" não enxerga conversa alheia nas contagens (RLS)', async () => {
    await q(`update membros_organizacao set escopo_conversas='PROPRIAS' where id=$1`, [consultor.membro]);
    await conversa('HUMANO', consultor.membro, 0);
    await conversa('HUMANO', outroConsultor.membro, 0);

    const n = await contagens(consultor.membro);
    expect(n.meu.todos).toBe(1);
    expect(n.equipe.todos).toBe(1);
  });

  it('a busca por nome restringe as contagens, como restringe a lista', async () => {
    const c = await conversa('HUMANO', consultor.membro, 0);
    await q(`update contatos set nome='Mariana Costa' where id=$1`, [c.contato]);
    await conversa('HUMANO', consultor.membro, 0);

    const filtrado = await contagens(consultor.membro, 'mariana');
    expect(filtrado.meu.todos).toBe(1);
  });
});
