import fs from "node:fs";
import net from "node:net";
import {spawn,spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import dotenv from "dotenv";
import {createTestSchema,postgresTestUrl} from "./lib/postgres-isolation.mjs";

const envFile=process.env.HOMOLOG_ENV_FILE??".env.homologacao";
if(fs.existsSync(envFile)){
  const config=dotenv.parse(fs.readFileSync(envFile));
  for(const key of ["POSTGRES_TEST_URL","POSTGRES_TEST_ALLOW_REMOTE","ISOLATED_HOMOLOGATION"])
    if(!process.env[key]&&config[key])process.env[key]=config[key];
}
if(process.env.ISOLATED_HOMOLOGATION!=="SIM")throw new Error("Defina ISOLATED_HOMOLOGATION=SIM para o ensaio descartável.");
const base=process.env.POSTGRES_TEST_URL;
if(!base)throw new Error("Informe POSTGRES_TEST_URL. DATABASE_URL de produção não é usado neste teste.");
const schemas=[createTestSchema(),createTestSchema(),createTestSchema()];
const environments=schemas.map(schema=>({...process.env,HOMOLOG_SCHEMA:schema,DATABASE_URL:postgresTestUrl(base,schema,process.env.POSTGRES_TEST_ALLOW_REMOTE==="SIM"),DATABASE_URL_UNPOOLED:"",VERCEL:"0"}));
const before=fs.existsSync("node_modules/.prisma/client/schema.prisma")?fs.readFileSync("node_modules/.prisma/client/schema.prisma","utf8"):"";
const originalProvider=/provider\s*=\s*"postgresql"/.test(before)?"postgresql":"sqlite";
const prisma="node_modules/prisma/build/index.js",tsx="node_modules/tsx/dist/cli.mjs";
const redact=value=>String(value).replace(/postgres(?:ql)?:\/\/[^\s]+/g,"postgresql://[redacted]");
const steps=[];let server,generated=false,output="";
function run(args,env,input){
  const result=spawnSync(process.execPath,args,{env,encoding:"utf8",input,maxBuffer:16*1024*1024,windowsHide:true,timeout:600000});
  if(result.stdout)process.stdout.write(redact(result.stdout));
  if(result.status!==0)throw new Error(redact(result.stderr||result.error?.message||`Falha: ${args[0]}`));
}
try{
  run([prisma,"generate","--schema=prisma/postgresql/schema.prisma"],environments[0]);generated=true;
  if(!process.argv.includes("--http-only")){
  const baseline=fs.readFileSync("prisma/postgresql/migrations/202610200001_baseline_v52/migration.sql","utf8");
  run([prisma,"db","execute","--schema=prisma/postgresql/schema.prisma","--stdin"],environments[0],`CREATE SCHEMA IF NOT EXISTS "${schemas[0]}"; SET search_path TO "${schemas[0]}";\n${baseline}`);
  run([tsx,"scripts/postgres-regressions.ts","--seed-baseline"],environments[0]);
  run([prisma,"migrate","resolve","--schema=prisma/postgresql/schema.prisma","--applied","202610200001_baseline_v52"],environments[0]);
  run([prisma,"migrate","deploy","--schema=prisma/postgresql/schema.prisma"],environments[0]);
  run([tsx,"scripts/postgres-regressions.ts","--verify-upgrade"],environments[0]);
  steps.push("migração versionada preservou reservas e transferências anteriores");
  run([prisma,"migrate","deploy","--schema=prisma/postgresql/schema.prisma"],environments[1]);
  run([tsx,"scripts/postgres-regressions.ts"],environments[1]);
  steps.push("concorrência, idempotência, migração JSON e restauração PostgreSQL aprovadas");
  }
  run([prisma,"migrate","deploy","--schema=prisma/postgresql/schema.prisma"],environments[2]);
  const listener=net.createServer();await new Promise(r=>listener.listen(0,"127.0.0.1",r));
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  const password=randomBytes(32).toString("base64url"),email="admin@pg-homolog.invalid";
  const httpEnv={...environments[2],ISOLATED_HOMOLOGATION:"SIM",HOMOLOG_BASE_URL:`http://127.0.0.1:${port}`,
    HOMOLOG_ADMIN_EMAIL:email,HOMOLOG_ADMIN_PASSWORD:password,HOMOLOG_PRODUCER_PASSWORD:randomBytes(32).toString("base64url"),
    BOOTSTRAP_ADMIN_EMAIL:email,BOOTSTRAP_ADMIN_PASSWORD:password,BOOTSTRAP_ADMIN_NAME:"Administrador PG isolado"};
  run([tsx,"scripts/bootstrap.ts"],httpEnv);
  run(["scripts/deploy-build.mjs"],httpEnv);
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port),"-H","127.0.0.1"],{env:httpEnv,stdio:["ignore","pipe","pipe"],windowsHide:true});
  server.stdout.on("data",x=>output+=redact(x));server.stderr.on("data",x=>output+=redact(x));
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(httpEnv.HOMOLOG_BASE_URL+"/login")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw new Error(`Servidor local indisponível. ${output}`);
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["scripts/homologacao-integrada.mjs"],{env:httpEnv,stdio:"inherit",windowsHide:true});
    child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(`Suíte HTTP retornou ${code}`)));
  });
  steps.push("homologação HTTP completa aprovada usando PostgreSQL");
  fs.mkdirSync("homologacao-resultados",{recursive:true});
  fs.writeFileSync("homologacao-resultados/postgresql.json",JSON.stringify({status:"APROVADO",completedAt:new Date().toISOString(),provider:"postgresql",steps},null,2));
}catch(e){
  fs.mkdirSync("homologacao-resultados",{recursive:true});
  if(output){fs.writeFileSync("homologacao-resultados/postgresql-server.log",output);console.error(output.slice(-8000));}
  fs.writeFileSync("homologacao-resultados/postgresql.json",JSON.stringify({status:"REPROVADO",steps,error:redact(e.message)},null,2));
  console.error(redact(e.message));process.exitCode=1;
}finally{
  if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once("exit",r));}
  if(generated){
    for(const env of environments)try{run([tsx,"scripts/postgres-regressions.ts","--cleanup"],env);}catch(e){console.error("Falha na limpeza do schema descartável: "+redact(e.message));process.exitCode=1;}
    if(originalProvider==="sqlite"&&process.env.POSTGRES_TEST_RESTORE_CLIENT!=="NAO")run([prisma,"generate","--schema=prisma/schema.prisma"],{...process.env,DATABASE_URL:"file:./local.db"});
  }
}
