#!/usr/bin/env node
/**
 * Junta todas as migrações num arquivo só: `supabase/esquema-completo.sql`.
 *
 * Para que serve: se a conexão direta com o banco não funcionar da sua
 * máquina (rede da empresa, firewall), dá para abrir o Supabase no
 * navegador, ir em SQL Editor, colar este arquivo inteiro e executar.
 * O resultado é o mesmo de `npm run banco:aplicar`.
 *
 * Uso: npm run banco:montar
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pastaMigracoes = join(raiz, 'supabase', 'migrations');
const destino = join(raiz, 'supabase', 'esquema-completo.sql');

const arquivos = readdirSync(pastaMigracoes)
  .filter((nome) => nome.endsWith('.sql'))
  .sort();

const partes = [
  '-- =====================================================================',
  '-- ESQUEMA COMPLETO — NewSec Chat',
  '--',
  '-- Arquivo GERADO por `npm run banco:montar`. Não edite aqui: edite as',
  '-- migrações em supabase/migrations e gere de novo.',
  `-- Gerado em ${new Date().toISOString()}`,
  '--',
  '-- Para aplicar pelo navegador: Supabase > SQL Editor > New query >',
  '-- cole tudo > Run.',
  '-- =====================================================================',
  '',
];

for (const arquivo of arquivos) {
  partes.push(`\n-- ############ ${arquivo} ############\n`);
  partes.push(readFileSync(join(pastaMigracoes, arquivo), 'utf8'));
}

writeFileSync(destino, partes.join('\n'), 'utf8');
console.warn(`  Gerado: supabase/esquema-completo.sql (${arquivos.length} migrações)`);
