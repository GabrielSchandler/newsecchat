import pg from 'pg';
import fs from 'node:fs';
const db=new pg.Client({connectionString:'postgresql://postgres@127.0.0.1:55439/newsec_redesign_v2'});await db.connect();
const q=async(s,p=[]) => (await db.query(s,p)).rows;
const org=(await q("insert into organizacoes(nome,apelido) values('Newsec · Validação local','newsec-validacao-local') returning id"))[0].id;
const equipes=[];for(const nome of ['Comercial','Suporte'])equipes.push((await q('insert into departamentos(organizacao_id,nome,chave) values($1,$2,$3) returning id',[org,nome,nome.toLowerCase()]))[0].id);
const users=[];for(const [nome,email,papel] of [['Gabriel Marques','admin@newsec.local','SUPER_ADMIN'],['Bruno Pereira','consultor@newsec.local','ATENDENTE'],['Fernanda Souza','supervisor@newsec.local','SUPERVISOR']]){
 const id=(await q("insert into auth.users(email,raw_user_meta_data) values($1,jsonb_build_object('nome',$2::text)) returning id",[email,nome]))[0].id;
 await q('update perfis set nome=$2 where id=$1',[id,nome]);
 const membro=(await q('insert into membros_organizacao(organizacao_id,perfil_id,papel) values($1,$2,$3) returning id',[org,id,papel]))[0].id;
 await q('insert into membros_departamento(organizacao_id,membro_id,departamento_id) values($1,$2,$3)',[org,membro,equipes[0]]);users.push({id,email,nome,membro,papel});
}
await q('insert into regras_atendimento(organizacao_id,versao,criado_por) values($1,1,$2)',[org,users[0].membro]);
const canais=[];for(const [i,nome] of ['Comercial 1','Comercial 2','Suporte'].entries())canais.push((await q("insert into canais(organizacao_id,nome,provedor,status,departamento_id,telefone,identificador_externo) values($1,$2,'SIMULADO',$3,$4,$5,$6) returning id",[org,nome,i===1?'ERRO':'CONECTADO',equipes[i===2?1:0],'551190000214'+i,'local-'+i]))[0].id);
const etiquetas=[];for(const nome of ['Novo lead','Documentos','Proposta enviada','Financiamento'])etiquetas.push((await q('insert into etiquetas(organizacao_id,nome,cor) values($1,$2,$3) returning id',[org,nome,'#009DC4']))[0].id);
const conversas=[];
for(const [i,nome] of ['Mariana Costa','João Almeida','Roberto Lima','Ana Pereira','Paulo Santos','Carla Dias','Beatriz Gomes','Ricardo Oliveira'].entries()){
 const contato=(await q("insert into contatos(organizacao_id,nome,telefone,email,departamento_id,responsavel_id,resumo) values($1,$2,$3,$4,$5,$6,'Interesse em análise de contrato. Aguarda orientação sobre documentos.') returning id",[org,nome,'551199990000'+i,'contato'+i+'@example.test',equipes[0],i===1?null:users[0].membro]))[0].id;
 const estado=i===5?'IA':i===1?'AGUARDANDO_HUMANO':'HUMANO';const membro=i===1||i===5?null:users[i===2?1:0].membro;
 const conversa=(await q('insert into conversas(organizacao_id,contato_id,canal_id,estado,departamento_id,responsavel_id,ultima_mensagem_em,ultima_mensagem_previa,nao_lidas) values($1,$2,$3,$4,$5,$6,now()-make_interval(mins=>$7),$8,2) returning id',[org,contato,canais[0],estado,equipes[0],membro,12+i,'Pode me explicar como funciona?']))[0].id;conversas.push(conversa);
 await q('insert into etiquetas_contato(organizacao_id,contato_id,etiqueta_id) values($1,$2,$3)',[org,contato,etiquetas[i%etiquetas.length]]);
 await q("insert into mensagens(organizacao_id,conversa_id,contato_id,canal_id,direcao,autor,tipo,conteudo,status,criado_em) values($1,$2,$3,$4,'ENTRADA','CONTATO','TEXTO',$5,'ENTREGUE',now()-make_interval(mins=>$6))",[org,conversa,contato,canais[0],i===1?'Quero falar com um consultor.':'Bom dia! Gostaria de entender como funciona a análise.',25+i]);
 if(membro){await q("insert into mensagens(organizacao_id,conversa_id,contato_id,canal_id,direcao,autor,autor_membro_id,tipo,conteudo,status,enviado_em,remetente_nome) values($1,$2,$3,$4,'SAIDA','ATENDENTE',$5,'TEXTO','Olá! Posso orientar você sobre os documentos.','ENVIADA',now()-interval '18 minutes','Gabriel')",[org,conversa,contato,canais[0],membro]);}
 if([0,2,6].includes(i))await q("insert into mensagens(organizacao_id,conversa_id,contato_id,canal_id,direcao,autor,tipo,conteudo,status,criado_em) values($1,$2,$3,$4,'ENTRADA','CONTATO','TEXTO','Pode me explicar quais documentos preciso enviar?','ENTREGUE',now()-interval '12 minutes')",[org,conversa,contato,canais[0]]);
 if([2,4,6].includes(i))await q("insert into retornos(organizacao_id,conversa_id,responsavel_id,motivo,prazo,criado_por) values($1,$2,$3,'Retomar proposta',now()+make_interval(hours=>$4),$3)",[org,conversa,users[0].membro,i===4?3:-2]);
}
await q("insert into notas_internas(organizacao_id,conversa_id,autor_membro_id,conteudo) values($1,$2,$3,'Prefere contato à tarde.')",[org,conversas[2],users[0].membro]);
await q("insert into respostas_rapidas(organizacao_id,autor_id,departamento_id,compartilhada,nome,atalho,categoria,conteudo) values($1,$2,$3,true,'Solicitar documentos','/docs','Atendimento','Olá, {{primeiro_nome}}! Para continuar seu atendimento, precisamos dos documentos combinados. Posso orientar por aqui?')",[org,users[0].membro,equipes[0]]);
fs.mkdirSync('.validacao',{recursive:true});fs.writeFileSync('.validacao/cenario.json',JSON.stringify({org,users,conversas,canais,equipes}));
await db.end();console.log('Cenário local criado: 3 perfis, 8 contatos, 3 canais simulados.');
