#!/usr/bin/env node
/**
 * Aplica as migrações de `supabase/migrations` no banco do Supabase.
 *
 * Como usar (na pasta do projeto):
 *   1. Preencha SUPABASE_DB_URL no arquivo .env.local
 *   2. npm run banco:aplicar
 *
 * Cada arquivo roda UMA vez. O controle fica na tabela
 * `migracoes_aplicadas`, dentro do próprio banco — rodar o comando duas
 * vezes não repete nada. Cada migração roda dentro de uma transação: se
 * ela falhar no meio, nada dela fica aplicado pela metade.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pastaMigracoes = join(raiz, 'supabase', 'migrations');

/** Lê .env.local sem depender de biblioteca externa. */
function carregarAmbiente() {
  for (const arquivo of ['.env.local', '.env']) {
    const caminho = join(raiz, arquivo);
    if (!existsSync(caminho)) continue;
    for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith('#')) continue;
      const igual = limpa.indexOf('=');
      if (igual === -1) continue;
      const chave = limpa.slice(0, igual).trim();
      let valor = limpa.slice(igual + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      if (!(chave in process.env)) process.env[chave] = valor;
    }
  }
}

function encerrarComOrientacao(mensagem) {
  console.error(`\n  ERRO: ${mensagem}\n`);
  console.error('  Onde encontrar a URL do banco:');
  console.error('    Supabase > seu projeto > Project Settings > Database');
  console.error('    > Connection string > URI (marque "Use connection pooling" se estiver fora do Brasil)');
  console.error('    Cole no arquivo .env.local, na linha SUPABASE_DB_URL=\n');
  process.exit(1);
}

async function principal() {
  carregarAmbiente();

  const urlBanco = process.env.SUPABASE_DB_URL;
  if (!urlBanco) {
    encerrarComOrientacao('SUPABASE_DB_URL não está definida.');
  }

  const cliente = new pg.Client({
    connectionString: urlBanco,
    ssl: urlBanco.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    await cliente.connect();
  } catch (erro) {
    encerrarComOrientacao(`não foi possível conectar ao banco (${erro.message}).`);
  }

  await cliente.query(`
    create table if not exists migracoes_aplicadas (
      arquivo text primary key,
      aplicado_em timestamptz not null default now()
    );
  `);

  const { rows } = await cliente.query('select arquivo from migracoes_aplicadas');
  const jaAplicadas = new Set(rows.map((linha) => linha.arquivo));

  const arquivos = readdirSync(pastaMigracoes)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  let aplicadas = 0;

  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) {
      console.warn(`  ja aplicada  ${arquivo}`);
      continue;
    }

    const sql = readFileSync(join(pastaMigracoes, arquivo), 'utf8');
    process.stdout.write(`  aplicando    ${arquivo} ... `);

    try {
      await cliente.query('begin');
      await cliente.query(sql);
      await cliente.query('insert into migracoes_aplicadas (arquivo) values ($1)', [arquivo]);
      await cliente.query('commit');
      process.stdout.write('ok\n');
      aplicadas += 1;
    } catch (erro) {
      await cliente.query('rollback');
      process.stdout.write('FALHOU\n');
      console.error(`\n  A migração ${arquivo} falhou e foi desfeita por inteiro.`);
      console.error(`  Mensagem do banco: ${erro.message}\n`);
      await cliente.end();
      process.exit(1);
    }
  }

  await cliente.end();

  if (aplicadas === 0) {
    console.warn('\n  Banco já estava atualizado. Nenhuma migração nova.\n');
  } else {
    console.warn(`\n  Pronto. ${aplicadas} migração(ões) aplicada(s).\n`);
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
