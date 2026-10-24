import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
const steps=[
  ["types","node_modules/typescript/bin/tsc","--noEmit"],
  ["static","scripts/validacao-estatica.mjs"],
  ["ui-routes","scripts/verificar-ui-rotas.mjs"],
  ["build","scripts/deploy-build.mjs"],
  ["tests","node_modules/tsx/dist/cli.mjs","--test",...fs.readdirSync("tests").filter(x=>x.endsWith(".test.ts")).sort().map(x=>`tests/${x}`)],
  ["http","scripts/run-http-homologation.mjs"]
];
const args=process.argv.slice(2);
if(args.length!==1||!['--plan','--execute'].includes(args[0])){console.error("Use --plan ou --execute.");process.exitCode=1;}
else if(args[0]==="--plan")console.log(JSON.stringify({scope:"Validação local; não publica nem ativa serviços externos.",steps:steps.map(([id])=>id)},null,2));
else{
  const dir=path.resolve("homologacao-resultados");fs.mkdirSync(dir,{recursive:true});
  const report={startedAt:new Date().toISOString(),status:"RUNNING",scope:"SQLite isolado e HTTP local; não valida serviços externos nem PostgreSQL remoto.",steps:[]};
  const save=()=>fs.writeFileSync(path.join(dir,"entrega-unica-quality.json"),JSON.stringify(report,null,2));save();
  for(const [id,script,...options] of steps){
    const started=Date.now(),log=fs.openSync(path.join(dir,`entrega-unica-${id}.log`),"w");
    console.log(`Validando: ${id}`);
    let code;
    const env={...process.env,DATABASE_URL:"file:./dev.db",POSTGRES_PRISMA_URL:"",POSTGRES_URL:"",NEON_DATABASE_URL:"",VERCEL:""};
    try{code=await new Promise(resolve=>{const child=spawn(process.execPath,[script,...options],{env,stdio:["ignore",log,log],windowsHide:true});child.once("error",()=>resolve(1));child.once("exit",value=>resolve(value??1));});}
    finally{fs.closeSync(log);}
    report.steps.push({id,exitCode:code,durationMs:Date.now()-started});save();
    if(code!==0){report.status="FAILED";process.exitCode=1;console.error(`Falha em ${id}; consulte o log local.`);break;}
  }
  if(report.status==="RUNNING")report.status="PASSED";
  report.completedAt=new Date().toISOString();save();console.log(`Validação integrada: ${report.status}`);
}
