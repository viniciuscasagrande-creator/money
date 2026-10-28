import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import {
  exportDatabaseDump,
  identifyDatabaseEnvironment,
  summarizeDatabaseDump,
  detectBackupRegression,
  auditBackupFinancialConsistency,
  type DatabaseDump
} from "../src/lib/backup-data";
import {
  backupKeyRing,
  saveBackup,
  mirrorBackup,
  retentionPlan,
  applyRetention,
  readBackup,
  inspectBackupMetadata,
  rotateBackupFileKey,
  isSameStorageVolume,
  compareBackupFiles,
  validateBackupFinancialFile,
  previewBackupRecovery,
  runScheduledBackupWithLockAndRetry,
  preflightCapacityCheck,
  measureBackupPerformanceAndCapacity,
  generateFinalMaintenanceDossier
} from "../src/lib/operational-backup";
import {
  monitorHeartbeat,
  recordLocalBackupHistory,
  inspectBackupOperationsHealth
} from "../src/lib/operational-monitor";

const url=process.env.DATABASE_URL||process.env.POSTGRES_PRISMA_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL;
const prisma=new PrismaClient({...(url?{datasources:{db:{url}}}:{})});
let phase="CONFIGURACAO";

function loadLatestValidDump(folder:string,ring:ReturnType<typeof backupKeyRing>):DatabaseDump|null{
  if(!fs.existsSync(folder))return null;
  const plan=retentionPlan(folder,ring,2);
  const newest=plan.retained[0];
  if(!newest)return null;
  try{return readBackup(newest,ring);}catch{return null;}
}

async function executeBackupCycle(ring:ReturnType<typeof backupKeyRing>,folder:string,keep:number,flags:Set<string>){
  if(!process.env.BACKUP_EXTERNAL_DIR)throw new Error("Configure BACKUP_EXTERNAL_DIR para cópia separada antes de iniciar o backup operacional.");

  const envMeta=identifyDatabaseEnvironment();
  const baselineDump=loadLatestValidDump(folder,ring);

  phase="SNAPSHOT";
  const dump=await exportDatabaseDump(prisma);
  const dataSummary=summarizeDatabaseDump(dump);
  const financialAudit=auditBackupFinancialConsistency(dump);
  const regression=detectBackupRegression(dump,baselineDump);

  if(regression.regressionDetected&&!flags.has("--allow-regression")){
    phase="CONFERENCIA_REGRESSAO";
    throw new Error(`Redução inesperada de registros detectada (${regression.previousBusinessRows} -> ${regression.currentBusinessRows}). Use --allow-regression se a exclusão foi intencional.`);
  }

  phase="CAPACIDADE_E_DESEMPENHO";
  const performanceMetrics=measureBackupPerformanceAndCapacity(dump,ring.primary);
  preflightCapacityCheck(folder,performanceMetrics.encryptedBytes,Number(process.env.BACKUP_MIN_FREE_BYTES??1024*1024));

  phase="GRAVACAO_LOCAL";
  const local=saveBackup(folder,dump,ring.primary);

  // Retenção só ocorre depois de confirmar a cópia externa. Falhas preservam a cópia local.
  phase="COPIA_EXTERNA";
  const external=mirrorBackup(local,process.env.BACKUP_EXTERNAL_DIR,ring);

  let archive:string|null=null;
  if(process.env.BACKUP_ARCHIVE_DIR?.trim()){
    phase="COPIA_ARQUIVO_INDEPENDENTE";
    archive=mirrorBackup(local,process.env.BACKUP_ARCHIVE_DIR.trim(),ring);
  }

  phase="REGISTRO_MONITORAMENTO";
  await monitorHeartbeat(prisma,"backup");

  phase="RETENCAO";
  const retention=applyRetention(folder,ring,keep);
  const externalKeep=Number(process.env.BACKUP_EXTERNAL_KEEP??keep);
  const externalRetention=Number.isSafeInteger(externalKeep)&&externalKeep>=2&&flags.has("--retain-external")
    ?applyRetention(process.env.BACKUP_EXTERNAL_DIR,ring,externalKeep)
    :"manual: backup:retention externo";

  const sameVolumeExternal=isSameStorageVolume(folder,process.env.BACKUP_EXTERNAL_DIR);

  recordLocalBackupHistory({
    status:"COPIADO_E_VERIFICADO",
    phase:"CONCLUIDO",
    environment:envMeta.environment,
    targetHost:envMeta.targetHost,
    keyId:ring.primaryId,
    modelCount:dump.modelCount,
    totalRows:dump.totalRows,
    businessRows:dataSummary.businessRows,
    regressionDetected:regression.regressionDetected,
    destinations:{local,external,archive},
    rehearsalStatus:"pendente: executar backup:rehearse",
    diagnostic:sameVolumeExternal
      ?"Backup concluído e verificado; atenção: destino externo compartilha o mesmo volume físico do diretório local."
      :"Backup concluído e verificado em todos os destinos."
  });

  return {
    status:"COPIADO_E_VERIFICADO" as const,
    keyId:ring.primaryId,
    environment:envMeta,
    local,
    external,
    archive,
    sameVolumeExternal,
    models:dump.modelCount,
    rows:dump.totalRows,
    businessRows:dataSummary.businessRows,
    nonEmptyTables:dataSummary.nonEmptyTables,
    financialTotals:dataSummary.financialTotals,
    financialAudit:{valid:financialAudit.valid,totalInconsistencies:financialAudit.totalInconsistencies},
    performance:{
      encryptedBytes:performanceMetrics.encryptedBytes,
      compressionRatio:performanceMetrics.compressionRatio,
      totalElapsedMs:performanceMetrics.totalElapsedMs
    },
    regressionCheck:regression,
    retention,
    externalRetention,
    rehearsal:"pendente: executar backup:rehearse"
  };
}

async function main(){
  const args=process.argv.slice(2);
  const flags=new Set(args.filter(a=>a.startsWith("--")));
  const positional=args.filter(a=>!a.startsWith("--"));
  const mode=args[0]?.startsWith("--")?args[0]:undefined;
  const file=positional[0];

  if(mode==="--health"||mode==="--status"){
    console.log(JSON.stringify(inspectBackupOperationsHealth(),null,2));
    return;
  }

  const ring=backupKeyRing();
  const folder=path.resolve(process.env.BACKUP_LOCAL_DIR??"backups/operacional");
  const keep=Number(process.env.BACKUP_KEEP??14);
  if(!Number.isSafeInteger(keep)||keep<2)throw new Error("BACKUP_KEEP deve ser inteiro >= 2.");

  if(mode==="--verify"){
    if(!file)throw new Error("Informe arquivo .moneybak.");
    const meta=inspectBackupMetadata(file,ring,{allowLegacyMigration:true});
    const dump=readBackup(file,ring,{allowLegacyMigration:true});
    const summary=summarizeDatabaseDump(dump);
    const financialAudit=auditBackupFinancialConsistency(dump);
    console.log(JSON.stringify({
      status:"VERIFICADO",
      keyId:meta.keyId,
      version:dump.version,
      models:dump.modelCount,
      rows:dump.totalRows,
      businessRows:summary.businessRows,
      exportedAt:dump.exportedAt,
      financialTotals:summary.financialTotals,
      financialAuditValid:financialAudit.valid,
      inconsistenciesCount:financialAudit.totalInconsistencies
    }));
    return;
  }

  if(mode==="--diff"){
    const [olderFile,newerFile]=positional;
    if(!olderFile||!newerFile)throw new Error("Uso: tsx scripts/backup-operacional.ts --diff antigo.moneybak novo.moneybak");
    console.log(JSON.stringify(compareBackupFiles(olderFile,newerFile,ring),null,2));
    return;
  }

  if(mode==="--audit-financial"){
    if(!file)throw new Error("Informe arquivo .moneybak para validação financeira.");
    const report=validateBackupFinancialFile(file,ring);
    console.log(JSON.stringify(report,null,2));
    if(!report.valid)process.exitCode=2;
    return;
  }

  if(mode==="--preview-restore"){
    if(!file)throw new Error("Informe arquivo .moneybak para prévia de restauração.");
    console.log(JSON.stringify(previewBackupRecovery(file,ring),null,2));
    return;
  }

  if(mode==="--rotate-key"){
    if(!file)throw new Error("Informe arquivo .moneybak para rotação de chave.");
    const rotated=rotateBackupFileKey(file,ring);
    console.log(JSON.stringify({status:"CHAVE_ROTACIONADA",...rotated},null,2));
    return;
  }

  if(mode==="--dossier"){
    const dump=await exportDatabaseDump(prisma);
    const dossier=generateFinalMaintenanceDossier({
      dump,
      keyOrRing:ring,
      outputDossierPath:path.resolve("homologacao-resultados/dossie-backup-pacotes-1-18.json")
    });
    console.log(JSON.stringify(dossier,null,2));
    return;
  }

  if(mode==="--scheduled"){
    const scheduledResult=await runScheduledBackupWithLockAndRetry({
      lockFolder:folder,
      task:()=>executeBackupCycle(ring,folder,keep,flags)
    });
    console.log(JSON.stringify(scheduledResult,null,2));
    return;
  }

  if(mode&&mode!=="--retain"&&mode!=="--retention-plan"&&mode!=="--allow-regression")throw new Error("Opção desconhecida.");
  if(mode==="--retain"||mode==="--retention-plan"){
    const targetFlag=args[1];
    if(targetFlag&&targetFlag!=="--external"&&targetFlag!=="--archive")throw new Error("Use --external ou --archive para retenção fora do diretório local.");
    const retentionFolder=targetFlag==="--external"
      ?process.env.BACKUP_EXTERNAL_DIR
      :targetFlag==="--archive"
      ?process.env.BACKUP_ARCHIVE_DIR
      :folder;
    if(!retentionFolder||!path.isAbsolute(retentionFolder))throw new Error("Diretório de retenção inválido.");
    console.log(JSON.stringify(mode==="--retain"?applyRetention(retentionFolder,ring,keep):retentionPlan(retentionFolder,ring,keep),null,2));
    return;
  }

  const result=await executeBackupCycle(ring,folder,keep,flags);
  console.log(JSON.stringify(result,null,2));
}

main().catch((err)=>{
  const envMeta=identifyDatabaseEnvironment();
  try{
    recordLocalBackupHistory({
      status:"REPROVADO",
      phase,
      environment:envMeta.environment,
      targetHost:envMeta.targetHost,
      diagnostic:err instanceof Error?err.message:"Falha operacional na execução do backup."
    });
  }catch{}
  console.error(JSON.stringify({
    status:"REPROVADO",
    phase,
    message:"Confira configuração, chave, destino montado e integridade. Detalhes de conexão e conteúdo foram omitidos."
  }));
  process.exitCode=1;
}).finally(()=>prisma.$disconnect());
