import fs from "node:fs";
import dotenv from "dotenv";
import {spawnSync} from "node:child_process";
import {createTestSchema,postgresTestUrl} from "./lib/postgres-isolation.mjs";
const fromFile=fs.existsSync(".env.homologacao")?dotenv.parse(fs.readFileSync(".env.homologacao")):{};
const settings={...fromFile,...process.env};
if(settings.ISOLATED_HOMOLOGATION!=="SIM"||!settings.POSTGRES_TEST_URL)throw new Error("Exige conexão de homologação isolada.");
const schema=createTestSchema(),env={...process.env,HOMOLOG_SCHEMA:schema,DATABASE_URL:postgresTestUrl(settings.POSTGRES_TEST_URL,schema,settings.POSTGRES_TEST_ALLOW_REMOTE==="SIM"),VERCEL:"0"};
const original=fs.readFileSync("node_modules/.prisma/client/schema.prisma","utf8").includes('provider = "postgresql"')?"prisma/postgresql/schema.prisma":"prisma/schema.prisma";
function run(args,custom=env){const result=spawnSync(process.execPath,args,{env:custom,encoding:"utf8",windowsHide:true,timeout:180000});if(result.status!==0)throw new Error("Etapa de homologação de títulos falhou.");if(result.stdout)process.stdout.write(result.stdout.replace(/postgres(?:ql)?:\/\/[^\s]+/g,"postgresql://[redacted]"));}
let generated=false;
try{
  run(["node_modules/prisma/build/index.js","generate","--schema=prisma/postgresql/schema.prisma"]);generated=true;
  run(["node_modules/prisma/build/index.js","migrate","deploy","--schema=prisma/postgresql/schema.prisma"]);
  run(["node_modules/tsx/dist/cli.mjs","scripts/postgres-title-regressions.ts"]);
}catch{console.error("Homologação PostgreSQL de títulos REPROVADA.");process.exitCode=1;}
finally{
  if(generated){
    try{run(["node_modules/tsx/dist/cli.mjs","scripts/postgres-regressions.ts","--cleanup"]);}catch{console.error("Limpeza do schema de teste falhou.");process.exitCode=1;}
    try{run(["node_modules/prisma/build/index.js","generate",`--schema=${original}`],{...process.env,DATABASE_URL:original.includes("postgresql")?env.DATABASE_URL:"file:./local.db"});}catch{console.error("Restaure o cliente Prisma do ambiente.");process.exitCode=1;}
  }
}
