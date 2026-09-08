/**
 * Testes que só o banco pode provar: isolamento entre organizações (RLS),
 * unicidade que sustenta a idempotência e a corrida do "assumir conversa".
 *
 * Precisam de um banco de verdade. Defina SUPABASE_DB_URL no .env.local e
 * rode `npm run banco:aplicar` antes. Sem a variável, a suíte é PULADA
 * com aviso — e o relatório final diz isso, em vez de fingir que passou.
 *
 * Como se finge ser um usuário logado: `set local role authenticated` mais
 * `request.jwt.claims` com o `sub`. É o mesmo caminho que o PostgREST usa,
 * então `auth.uid()` e as políticas se comportam como em produção.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

function carregarUrlBanco(): string | null {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;

  const caminho = join(process.cwd(), '.env.local');
  if (!existsSync(caminho)) return null;

  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa.startsWith('SUPABASE_DB_URL=')) continue;
    const valor = limpa.slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '');
    return valor || null;
  }

  return null;
}

const urlBanco = carregarUrlBanco();

if (!urlBanco) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n  [banco] SUPABASE_DB_URL não definida — os testes de RLS e concorrência foram PULADOS.\n' +
      '  Eles são os que provam o isolamento entre empresas. Configure o banco e rode de novo.\n',
  );
}

const sufixo = Math.random().toString(36).slice(2, 8);
const ORG_A = { nome: `Teste A ${sufixo}`, apelido: `teste-a-${sufixo}` };
const ORG_B = { nome: `Teste B ${sufixo}`, apelido: `teste-b-${sufixo}` };

interface Cenario {
  organizacaoA: string;
  organizacaoB: string;
  usuarioA: string;
  usuarioB: string;
  membroA: string;
  membroA2: string;
  usuarioA2: string;
  contatoA: string;
  canalA: string;
  conversaA: string;
}

describe.skipIf(!urlBanco)('banco: isolamento, unicidade e concorrência', () => {
  let admin: pg.Client;
  let cenario: Cenario;

  async function comoUsuario<T>(
    usuarioId: string,
    executar: (cliente: pg.Client) => Promise<T>,
  ): Promise<T> {
    const cliente = new pg.Client({
      connectionString: urlBanco as string,
      ssl: (urlBanco as string).includes('localhost') ? false : { rejectUnauthorized: false },
    });

    await cliente.connect();
    try {
      await cliente.query('begin');
      await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: usuarioId, role: 'authenticated' }),
      ]);
      await cliente.query('set local role authenticated');
      const resultado = await executar(cliente);
      await cliente.query('rollback');
      return resultado;
    } finally {
      await cliente.end();
    }
  }

  beforeAll(async () => {
    admin = new pg.Client({
      connectionString: urlBanco as string,
      ssl: (urlBanco as string).includes('localhost') ? false : { rejectUnauthorized: false },
    });
    await admin.connect();

    const criarUsuario = async (email: string): Promise<string> => {
      const { rows } = await admin.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, '', now(), now(), now())
         returning id`,
        [email],
      );
      return rows[0].id as string;
    };

    const usuarioA = await criarUsuario(`a-${sufixo}@teste.local`);
    const usuarioA2 = await criarUsuario(`a2-${sufixo}@teste.local`);
    const usuarioB = await criarUsuario(`b-${sufixo}@teste.local`);

    const criarOrganizacao = async (dados: { nome: string; apelido: string }): Promise<string> => {
      const { rows } = await admin.query(
        'insert into organizacoes (nome, apelido) values ($1, $2) returning id',
        [dados.nome, dados.apelido],
      );
      return rows[0].id as string;
    };

    const organizacaoA = await criarOrganizacao(ORG_A);
    const organizacaoB = await criarOrganizacao(ORG_B);

    const vincular = async (org: string, usuario: string, papel: string): Promise<string> => {
      const { rows } = await admin.query(
        'insert into membros_organizacao (organizacao_id, perfil_id, papel) values ($1, $2, $3) returning id',
        [org, usuario, papel],
      );
      return rows[0].id as string;
    };

    const membroA = await vincular(organizacaoA, usuarioA, 'ADMIN');
    const membroA2 = await vincular(organizacaoA, usuarioA2, 'ADMIN');
    await vincular(organizacaoB, usuarioB, 'ADMIN');

    const { rows: canais } = await admin.query(
      `insert into canais (organizacao_id, nome, provedor, identificador_externo)
       values ($1, 'Canal de teste', 'SIMULADO', $2) returning id`,
      [organizacaoA, `teste-${sufixo}`],
    );
    const canalA = canais[0].id as string;

    const { rows: contatos } = await admin.query(
      `insert into contatos (organizacao_id, telefone, nome) values ($1, $2, 'Contato de teste') returning id`,
      [organizacaoA, `5511${Math.floor(100000000 + Math.random() * 800000000)}`],
    );
    const contatoA = contatos[0].id as string;

    const { rows: conversas } = await admin.query(
      `insert into conversas (organizacao_id, contato_id, canal_id, estado)
       values ($1, $2, $3, 'IA') returning id`,
      [organizacaoA, contatoA, canalA],
    );

    cenario = {
      organizacaoA,
      organizacaoB,
      usuarioA,
      usuarioA2,
      usuarioB,
      membroA,
      membroA2,
      contatoA,
      canalA,
      conversaA: conversas[0].id as string,
    };
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;

    // A remoção em cascata das organizações leva contatos, conversas e
    // mensagens junto.
    await admin.query('delete from organizacoes where id = any($1)', [
      [cenario?.organizacaoA, cenario?.organizacaoB].filter(Boolean),
    ]);
    await admin.query('delete from auth.users where email like $1', [`%${sufixo}@teste.local`]);
    await admin.end();
  }, 60_000);

  describe('isolamento entre organizações', () => {
    it('um usuário só enxerga contatos da própria organização', async () => {
      const daOrganizacaoA = await comoUsuario(cenario.usuarioA, async (cliente) => {
        const { rows } = await cliente.query('select id from contatos where id = $1', [
          cenario.contatoA,
        ]);
        return rows.length;
      });

      const daOrganizacaoB = await comoUsuario(cenario.usuarioB, async (cliente) => {
        const { rows } = await cliente.query('select id from contatos where id = $1', [
          cenario.contatoA,
        ]);
        return rows.length;
      });

      expect(daOrganizacaoA).toBe(1);
      // O contato existe, mas para a organização B ele não existe.
      expect(daOrganizacaoB).toBe(0);
    });

    it('um usuário não enxerga conversas de outra organização', async () => {
      const visiveis = await comoUsuario(cenario.usuarioB, async (cliente) => {
        const { rows } = await cliente.query('select id from conversas where id = $1', [
          cenario.conversaA,
        ]);
        return rows.length;
      });

      expect(visiveis).toBe(0);
    });

    it('um usuário não enxerga canais de outra organização', async () => {
      const visiveis = await comoUsuario(cenario.usuarioB, async (cliente) => {
        const { rows } = await cliente.query('select id from canais where id = $1', [cenario.canalA]);
        return rows.length;
      });

      expect(visiveis).toBe(0);
    });

    it('escrever contato em outra organização é recusado', async () => {
      await expect(
        comoUsuario(cenario.usuarioB, async (cliente) => {
          await cliente.query(
            `insert into contatos (organizacao_id, telefone) values ($1, '5511900000000')`,
            [cenario.organizacaoA],
          );
        }),
      ).rejects.toThrow();
    });

    it('atualizar contato de outra organização não afeta linha nenhuma', async () => {
      const afetadas = await comoUsuario(cenario.usuarioB, async (cliente) => {
        const resultado = await cliente.query(
          `update contatos set nome = 'invadido' where id = $1`,
          [cenario.contatoA],
        );
        return resultado.rowCount;
      });

      expect(afetadas).toBe(0);

      const { rows } = await admin.query('select nome from contatos where id = $1', [
        cenario.contatoA,
      ]);
      expect(rows[0].nome).toBe('Contato de teste');
    });

    it('o segredo do webhook não é legível pelo usuário logado', async () => {
      // A migração 0011 revoga o privilégio nessa coluna. Sem isso, um
      // atendente conseguiria forjar eventos de webhook.
      await expect(
        comoUsuario(cenario.usuarioA, async (cliente) => {
          await cliente.query('select segredo_webhook from canais where id = $1', [cenario.canalA]);
        }),
      ).rejects.toThrow(/permission denied|permissão negada/i);
    });

    it('as colunas não sensíveis do canal continuam legíveis', async () => {
      const nome = await comoUsuario(cenario.usuarioA, async (cliente) => {
        const { rows } = await cliente.query('select nome from canais where id = $1', [
          cenario.canalA,
        ]);
        return rows[0]?.nome;
      });

      expect(nome).toBe('Canal de teste');
    });
  });

  describe('unicidade que sustenta a idempotência', () => {
    it('a mesma mensagem do provedor não entra duas vezes', async () => {
      const identificador = `EXTERNO-${sufixo}`;

      const inserir = () =>
        admin.query(
          `insert into mensagens (organizacao_id, conversa_id, contato_id, canal_id, direcao, autor, tipo, conteudo, identificador_externo)
           values ($1, $2, $3, $4, 'ENTRADA', 'CONTATO', 'TEXTO', 'oi', $5)`,
          [cenario.organizacaoA, cenario.conversaA, cenario.contatoA, cenario.canalA, identificador],
        );

      await inserir();
      await expect(inserir()).rejects.toThrow(/duplicate key|duplicada/i);
    });

    it('a mesma chave de envio não gera duas mensagens', async () => {
      const chave = `ia:${cenario.conversaA}:gatilho-${sufixo}`;

      const inserir = () =>
        admin.query(
          `insert into mensagens (organizacao_id, conversa_id, contato_id, canal_id, direcao, autor, tipo, conteudo, chave_idempotencia)
           values ($1, $2, $3, $4, 'SAIDA', 'IA', 'TEXTO', 'resposta', $5)`,
          [cenario.organizacaoA, cenario.conversaA, cenario.contatoA, cenario.canalA, chave],
        );

      await inserir();
      await expect(inserir()).rejects.toThrow(/duplicate key|duplicada/i);
    });

    it('só existe uma conversa aberta por contato e canal', async () => {
      await expect(
        admin.query(
          `insert into conversas (organizacao_id, contato_id, canal_id, estado) values ($1, $2, $3, 'IA')`,
          [cenario.organizacaoA, cenario.contatoA, cenario.canalA],
        ),
      ).rejects.toThrow(/duplicate key|duplicada/i);
    });

    it('o mesmo evento de webhook não é gravado duas vezes', async () => {
      const identificador = `EVOLUTION:inst:${sufixo}`;

      const inserir = () =>
        admin.query(
          `insert into eventos_webhook (organizacao_id, canal_id, provedor, tipo_evento, identificador_externo, carga)
           values ($1, $2, 'EVOLUTION', 'MENSAGEM_RECEBIDA', $3, '{}'::jsonb)`,
          [cenario.organizacaoA, cenario.canalA, identificador],
        );

      await inserir();
      await expect(inserir()).rejects.toThrow(/duplicate key|duplicada/i);
    });
  });

  describe('handoff IA → humano sob concorrência', () => {
    it('dois atendentes assumindo ao mesmo tempo: exatamente um vence', async () => {
      // O caso real: dois operadores clicam em "Assumir" no mesmo segundo.
      await admin.query(
        `update conversas set estado = 'IA', responsavel_id = null where id = $1`,
        [cenario.conversaA],
      );

      const assumir = async (usuarioId: string, membroId: string): Promise<boolean> => {
        const cliente = new pg.Client({
          connectionString: urlBanco as string,
          ssl: (urlBanco as string).includes('localhost') ? false : { rejectUnauthorized: false },
        });
        await cliente.connect();

        try {
          await cliente.query('begin');
          await cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: usuarioId, role: 'authenticated' }),
          ]);
          await cliente.query('set local role authenticated');

          const { rows } = await cliente.query(
            'select assumir_conversa($1, $2, null) as venceu',
            [cenario.conversaA, membroId],
          );

          await cliente.query('commit');
          return rows[0].venceu as boolean;
        } finally {
          await cliente.end();
        }
      };

      const [primeiro, segundo] = await Promise.all([
        assumir(cenario.usuarioA, cenario.membroA),
        assumir(cenario.usuarioA2, cenario.membroA2),
      ]);

      // Um dos dois assume; o outro recebe false e a interface avisa.
      expect([primeiro, segundo].filter(Boolean)).toHaveLength(1);

      const { rows } = await admin.query(
        'select estado, responsavel_id from conversas where id = $1',
        [cenario.conversaA],
      );

      expect(rows[0].estado).toBe('HUMANO');
      expect([cenario.membroA, cenario.membroA2]).toContain(rows[0].responsavel_id);
    }, 30_000);

    it('a IA não consegue gravar resposta depois de um humano assumir', async () => {
      // A conversa ficou em HUMANO no teste anterior. Um job de IA que
      // estava em voo tenta responder agora.
      const { rows } = await admin.query(
        `select registrar_mensagem_ia($1, 'resposta atrasada da IA', $2, '{}'::jsonb) as mensagem_id`,
        [cenario.conversaA, `ia:${cenario.conversaA}:atrasado-${sufixo}`],
      );

      // Null significa: a função conferiu o estado dentro da transação e
      // recusou. Nada foi enviado ao cliente.
      expect(rows[0].mensagem_id).toBeNull();

      const { rows: mensagens } = await admin.query(
        `select count(*)::int as total from mensagens where conversa_id = $1 and conteudo = 'resposta atrasada da IA'`,
        [cenario.conversaA],
      );

      expect(mensagens[0].total).toBe(0);
    });

    it('a IA volta a responder depois da devolução explícita', async () => {
      await admin.query(`select devolver_conversa_para_ia($1, $2, 'teste')`, [
        cenario.conversaA,
        cenario.membroA,
      ]);

      const { rows } = await admin.query(
        `select registrar_mensagem_ia($1, 'agora pode', $2, '{}'::jsonb) as mensagem_id`,
        [cenario.conversaA, `ia:${cenario.conversaA}:permitido-${sufixo}`],
      );

      expect(rows[0].mensagem_id).not.toBeNull();

      const { rows: conversa } = await admin.query('select estado from conversas where id = $1', [
        cenario.conversaA,
      ]);

      // Depois de falar, a IA fica aguardando o cliente.
      expect(conversa[0].estado).toBe('AGUARDANDO_CLIENTE');
    });

    it('a mesma chave de resposta da IA não gera segunda mensagem', async () => {
      await admin.query(`update conversas set estado = 'IA' where id = $1`, [cenario.conversaA]);

      const chave = `ia:${cenario.conversaA}:repetido-${sufixo}`;

      const primeira = await admin.query(
        `select registrar_mensagem_ia($1, 'primeira', $2, '{}'::jsonb) as mensagem_id`,
        [cenario.conversaA, chave],
      );

      await admin.query(`update conversas set estado = 'IA' where id = $1`, [cenario.conversaA]);

      const segunda = await admin.query(
        `select registrar_mensagem_ia($1, 'primeira', $2, '{}'::jsonb) as mensagem_id`,
        [cenario.conversaA, chave],
      );

      expect(primeira.rows[0].mensagem_id).not.toBeNull();
      expect(segunda.rows[0].mensagem_id).toBeNull();
    });
  });

  describe('reserva de destinatário de campanha', () => {
    it('dois workers na mesma campanha nunca pegam o mesmo destinatário', async () => {
      const { rows: campanhas } = await admin.query(
        `insert into campanhas (organizacao_id, nome, canal_id, mensagem)
         values ($1, $2, $3, 'Olá, tudo bem?') returning id`,
        [cenario.organizacaoA, `Campanha ${sufixo}`, cenario.canalA],
      );
      const campanhaId = campanhas[0].id as string;

      await admin.query(
        `insert into contatos_campanha (organizacao_id, campanha_id, contato_id) values ($1, $2, $3)`,
        [cenario.organizacaoA, campanhaId, cenario.contatoA],
      );

      const reservar = async (): Promise<string | null> => {
        const cliente = new pg.Client({
          connectionString: urlBanco as string,
          ssl: (urlBanco as string).includes('localhost') ? false : { rejectUnauthorized: false },
        });
        await cliente.connect();
        try {
          const { rows } = await cliente.query('select reservar_contato_campanha($1) as id', [
            campanhaId,
          ]);
          return rows[0].id as string | null;
        } finally {
          await cliente.end();
        }
      };

      const [a, b] = await Promise.all([reservar(), reservar()]);

      // Só um dos dois recebe o destinatário; o outro recebe null.
      expect([a, b].filter(Boolean)).toHaveLength(1);

      await admin.query('delete from campanhas where id = $1', [campanhaId]);
    }, 30_000);
  });
});
