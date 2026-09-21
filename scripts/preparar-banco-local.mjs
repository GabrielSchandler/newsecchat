import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
const nome = process.env.BANCO_LOCAL || 'newsec_redesign_v1';
if (!/^newsec_redesign_[a-z0-9_]+$/.test(nome)) throw new Error('Nome de banco local inválido');
const bootstrap = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:55439/postgres' });
await bootstrap.connect();
if (!(await bootstrap.query('select 1 from pg_database where datname=$1',[nome])).rowCount) await bootstrap.query('create database '+nome);
await bootstrap.end();
const client = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:55439/'+nome });
await client.connect();
await client.query(`do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; create schema if not exists storage;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(),email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),instance_id uuid,aud text,role text,encrypted_password text,email_confirmed_at timestamptz,updated_at timestamptz);
`);
await client.query(`create or replace function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create or replace function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user)$$;
create table if not exists storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to authenticated,service_role;
alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
grant select on auth.users to authenticated,service_role;
create table if not exists migracoes_aplicadas(arquivo text primary key,aplicado_em timestamptz default now());`);
const done = new Set((await client.query('select arquivo from migracoes_aplicadas')).rows.map(r=>r.arquivo));
for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
 if(done.has(f))continue;
 try {await client.query('begin');await client.query(readFileSync('supabase/migrations/'+f,'utf8'));await client.query('insert into migracoes_aplicadas(arquivo) values($1)',[f]);await client.query('commit');console.log('OK',f);}
 catch(e){await client.query('rollback');console.error('FAIL',f,e.message,e.where||'',e.position||'');process.exitCode=1;break;}
}
await client.query("notify pgrst,'reload schema'");
await client.end();
