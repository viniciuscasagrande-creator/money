import "dotenv/config";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import {exportDatabaseDump} from "../src/lib/backup-data";
import {backupKey,saveBackup,mirrorBackup,retentionPlan,applyRetention,readBackup} from "../src/lib/operational-backup";
import {monitorHeartbeat} from "../src/lib/operational-monitor";

const url=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL;
const prisma=new PrismaClient({...(url?{datasources:{db:{url}}}:{})});
let phase="CONFIGURACAO";
async function main(){
  const key=backupKey(),folder=path.resolve(process.env.BACKUP_LOCAL_DIR??"backups/operacional"),keep=Number(process.env.BACKUP_KEEP??14);
  if(!Number.isSafeInteger(keep)||keep<2)throw new Error("BACKUP_KEEP deve ser inteiro >= 2.");
  const [mode,file]=process.argv.slice(2);
  if(mode==="--verify"){
    if(!file)throw new Error("Informe arquivo .moneybak.");
    const dump=readBackup(file,key);console.log(JSON.stringify({status:"VERIFICADO",models:dump.modelCount,rows:dump.totalRows,exportedAt:dump.exportedAt}));return;
  }
  if(mode&&mode!=="--retain"&&mode!=="--retention-plan")throw new Error("Opção desconhecida.");
  if(mode){
    if(file&&file!=="--external")throw new Error("Use --external para retenção externa.");
    const retentionFolder=file==="--external"?process.env.BACKUP_EXTERNAL_DIR:folder;
    if(!retentionFolder||!path.isAbsolute(retentionFolder))throw new Error("Diretório de retenção inválido.");
    console.log(JSON.stringify(mode==="--retain"?applyRetention(retentionFolder,key,keep):retentionPlan(retentionFolder,key,keep),null,2));return;
  }
  if(!process.env.BACKUP_EXTERNAL_DIR)throw new Error("Configure BACKUP_EXTERNAL_DIR para cópia separada antes de iniciar o backup operacional.");
  phase="SNAPSHOT";
  const dump=await exportDatabaseDump(prisma);
  phase="GRAVACAO_LOCAL";
  const local=saveBackup(folder,dump,key);
  // Retenção só ocorre depois de confirmar a cópia externa. Falhas preservam a cópia local.
  phase="COPIA_EXTERNA";
  const external=mirrorBackup(local,process.env.BACKUP_EXTERNAL_DIR,key);
  phase="REGISTRO_MONITORAMENTO";
  await monitorHeartbeat(prisma,"backup");
  phase="RETENCAO";
  const retention=applyRetention(folder,key,keep);
  console.log(JSON.stringify({status:"COPIADO_E_VERIFICADO",local,external,models:dump.modelCount,rows:dump.totalRows,retention,externalRetention:"manual: backup:retention externo",rehearsal:"pendente: executar backup:rehearse"},null,2));
}
main().catch(()=>{console.error(JSON.stringify({status:"REPROVADO",phase,message:"Confira configuração, chave, destino montado e integridade. Detalhes de conexão e conteúdo foram omitidos."}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
