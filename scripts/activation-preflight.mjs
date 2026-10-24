import fs from "node:fs";
import dotenv from "dotenv";
import {spawnSync} from "node:child_process";
const env={...(fs.existsSync(".env")?dotenv.parse(fs.readFileSync(".env")):{}),...process.env};
const present=keys=>keys.every(k=>Boolean(env[k]?.trim()));
const checks=[
  {code:"DEPLOYMENT_CREDENTIALS",ready:present(["VERCEL_TOKEN","VERCEL_ORG_ID","VERCEL_PROJECT_ID"]),required:["VERCEL_TOKEN","VERCEL_ORG_ID","VERCEL_PROJECT_ID"]},
  {code:"MIGRATION_CONNECTION",ready:present(["RELEASE_DATABASE_URL"])||present(["DATABASE_URL_UNPOOLED"]),required:["RELEASE_DATABASE_URL ou DATABASE_URL_UNPOOLED"]},
  {code:"BACKUP_DESTINATION",ready:present(["BACKUP_EXTERNAL_DIR"]),required:["BACKUP_EXTERNAL_DIR"]},
  {code:"BACKUP_KEY",ready:/^[a-f\d]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY??""),required:["BACKUP_ENCRYPTION_KEY"]},
  {code:"ALERT_CHANNEL",ready:present(["MONITOR_WEBHOOK_URL","MONITOR_WEBHOOK_TOKEN"]),required:["MONITOR_WEBHOOK_URL","MONITOR_WEBHOOK_TOKEN"]},
  {code:"GIT_REMOTE",ready:!!spawnSync("git",["remote"],{encoding:"utf8",windowsHide:true}).stdout?.trim(),required:["repositório remoto configurado"]}
];
const report={checkedAt:new Date().toISOString(),scope:"Somente presença de configuração; não conecta, publica, agenda ou envia mensagens.",status:checks.every(x=>x.ready)?"CONFIGURATION_PRESENT":"CONFIGURATION_REQUIRED",checks};
fs.mkdirSync("homologacao-resultados",{recursive:true});fs.writeFileSync("homologacao-resultados/activation-preflight.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(report.status!=="CONFIGURATION_PRESENT")process.exitCode=2;
