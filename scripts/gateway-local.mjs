// Gateway de autenticação apenas para os três usuários fictícios do cenário local.
// Não é importado pela aplicação e escuta somente 127.0.0.1.
import http from 'node:http';
import {createHmac,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
const segredo='newsec-local-validation-only-2026-no-production';
const cenario=JSON.parse(fs.readFileSync('.validacao/cenario.json','utf8'));
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(payload){const base=b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload);return base+'.'+createHmac('sha256',segredo).update(base).digest('base64url');}
function user(u){return {id:u.id,email:u.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{nome:u.nome},created_at:new Date().toISOString(),email_confirmed_at:new Date().toISOString()};}
function session(u){return {access_token:token({sub:u.id,email:u.email,role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400}),token_type:'bearer',expires_in:86400,refresh_token:u.id,user:user(u)};}
function decode(t){try{const [h,p,s]=t.split('.');const expected=createHmac('sha256',segredo).update(h+'.'+p).digest('base64url');if(s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return null;return JSON.parse(Buffer.from(p,'base64url'));}catch{return null;}}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3109');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.end();return;}
 const json=(v,status=200)=>{res.writeHead(status);res.end(JSON.stringify(v));};
 if(req.url.startsWith('/rest/v1')){const target='http://127.0.0.1:55441'+req.url.slice(8);const headers={...req.headers};delete headers.host;const upstream=http.request(target,{method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>json({message:'Banco REST local indisponível'},503));req.pipe(upstream);return;}
 if(req.url.startsWith('/auth/v1/token')){let body='';for await(const chunk of req)body+=chunk;const b=JSON.parse(body||'{}');const u=req.url.includes('refresh_token')?cenario.users.find(u=>u.id===b.refresh_token):b.password==='ValidacaoLocal!2026'?cenario.users.find(u=>u.email===b.email):null;json(u?session(u):{msg:'Credencial local inválida'},u?200:400);return;}
 if(req.url.startsWith('/auth/v1/user')){const jwt=decode((req.headers.authorization||'').replace('Bearer ',''));const u=cenario.users.find(u=>u.id===jwt?.sub);json(u?user(u):{msg:'Sessão inválida'},u?200:401);return;}
 if(req.url.startsWith('/auth/v1/logout')){json({});return;}
 json({message:'Recurso indisponível na validação local'},404);
});
fs.writeFileSync('.env.local',`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55440\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${token({role:'anon',exp:2000000000})}\nSUPABASE_SERVICE_ROLE_KEY=${token({role:'service_role',exp:2000000000})}\nSUPABASE_DB_URL=postgresql://postgres@localhost:55439/newsec_redesign_v2\nNEXT_PUBLIC_URL_APLICACAO=http://127.0.0.1:3109\nPROVEDOR_IA=SIMULADO\n`);
fs.writeFileSync('.validacao/postgrest.conf',`db-uri = "postgresql://postgres@127.0.0.1:55439/newsec_redesign_v2"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${segredo}"\nserver-host = "127.0.0.1"\nserver-port = 55441\n`);
server.listen(55440,'127.0.0.1',()=>console.log('Gateway de validação local em 127.0.0.1:55440'));
