import fs from "node:fs";
import {spawnSync} from "node:child_process";
import dotenv from "dotenv";
import {releasePlan,matchingDatabase} from "./lib/release-plan.mjs";

const plan=releasePlan({target:process.env.DEPLOY_TARGET??"preview",confirmation:process.env.DEPLOY_CONFIRMATION,ref:process.env.GITHUB_REF_NAME??""});
if(!process.argv.includes("--execute")){console.log(JSON.stringify(plan,null,2));process.exit(0);}
const required=["VERCEL_TOKEN","VERCEL_ORG_ID","VERCEL_PROJECT_ID","RELEASE_DATABASE_URL"];
for(const key of required)if(!process.env[key])throw new Error(`Configure ${key} no ambiente de publicação.`);
const token=process.env.VERCEL_TOKEN,prod=plan.target==="production";
const vercel=process.platform==="win32"?"vercel.cmd":"vercel";
const clean=value=>String(value).replaceAll(token,"[redacted]").replace(/postgres(?:ql)?:\/\/[^\s]+/g,"postgresql://[redacted]");
let phase="configuração";
function run(command,args,env=process.env){
  const result=spawnSync(command,args,{env,encoding:"utf8",windowsHide:true,maxBuffer:16*1024*1024});
  if(result.stdout)process.stdout.write(clean(result.stdout));
  if(result.status!==0)throw new Error(`Falha na etapa ${phase}: ${clean(result.stderr||result.error?.message||"comando recusado")}`);
}
try{
  run(vercel,["pull","--yes",`--environment=${plan.target}`,"--token",token]);
  const file=`.vercel/.env.${plan.target}.local`;
  if(!fs.existsSync(file))throw new Error("Configuração Vercel não foi recebida.");
  const runtime=dotenv.parse(fs.readFileSync(file));
  matchingDatabase(runtime.DATABASE_URL??runtime.POSTGRES_PRISMA_URL??runtime.POSTGRES_URL??runtime.NEON_DATABASE_URL,process.env.RELEASE_DATABASE_URL);
  phase="build";run(vercel,["build",...(prod?["--prod"]:[]),"--token",token]);
  const migrationEnv={...process.env,DATABASE_URL:process.env.RELEASE_DATABASE_URL};
  phase="migrações";run(process.execPath,["node_modules/prisma/build/index.js","migrate","deploy","--schema=prisma/postgresql/schema.prisma"],migrationEnv);
  phase="migração financeira legada";run(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/migrate-legacy-finance.ts"],migrationEnv);
  phase="publicação";run(vercel,["deploy","--prebuilt",...(prod?["--prod"]:[]),"--token",token]);
  fs.mkdirSync("homologacao-resultados",{recursive:true});
  fs.writeFileSync("homologacao-resultados/release.json",JSON.stringify({status:"APROVADO",target:plan.target,commit:process.env.GITHUB_SHA??null,completedAt:new Date().toISOString()},null,2));
}catch(e){
  fs.mkdirSync("homologacao-resultados",{recursive:true});
  fs.writeFileSync("homologacao-resultados/release.json",JSON.stringify({status:"REPROVADO",target:plan.target,phase,error:clean(e.message)},null,2));
  console.error(clean(e.message));process.exitCode=1;
}
