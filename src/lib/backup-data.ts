import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

export type DatabaseDump={exportedAt:string;version:string;modelCount:number;totalRows:number;tables:Record<string,{count:number;rows:Record<string,unknown>[]}>};
export type SignedBackupEnvelope = {
  dump: DatabaseDump;
  sha256Checksum: string;
  hmacSignature: string | null;
  signed: boolean;
  createdAt: string;
};
export type BackupVerificationCertificate = {
  verifiedAt: string;
  sha256Checksum: string;
  signed: boolean;
  modelCount: number;
  totalRows: number;
  referentialLinksChecked: number;
  valid: boolean;
};

type Delegate={findMany:()=>Promise<Record<string,unknown>[]>;create:(args:{data:Record<string,unknown>})=>Promise<unknown>;count:()=>Promise<number>};
export const modelKey=(name:string)=>name[0].toLowerCase()+name.slice(1);
const delegate=(tx:Prisma.TransactionClient,key:string)=>(tx as unknown as Record<string,Delegate>)[key];
export async function exportDatabaseDump(db:PrismaClient):Promise<DatabaseDump>{
  return db.$transaction(async tx=>{
    const tables:DatabaseDump["tables"]={};let totalRows=0;
    for(const model of Prisma.dmmf.datamodel.models){
      const key=modelKey(model.name),rows=await delegate(tx,key).findMany();
      const serialized=JSON.parse(JSON.stringify(rows,(_k,v)=>typeof v==="bigint"?v.toString():v));
      tables[key]={count:rows.length,rows:serialized};totalRows+=rows.length;
    }
    return {exportedAt:new Date().toISOString(),version:"SOUL-v5.2.1",modelCount:Object.keys(tables).length,totalRows,tables};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:60000});
}

function orderedModels(){
  const models=Prisma.dmmf.datamodel.models,result:typeof models[number][]=[],pending=[...models];
  while(pending.length){
    const index=pending.findIndex(m=>m.fields.filter(f=>f.kind==="object"&&(f.relationFromFields?.length??0)>0&&f.type!==m.name).every(f=>result.some(x=>x.name===f.type)));
    if(index<0)throw new Error("Ciclo de dependências impede restauração automática.");
    result.push(pending.splice(index,1)[0]);
  }
  return result;
}

export async function restoreDatabaseDump(db:PrismaClient,dump:DatabaseDump,includeSessions=false){
  if(!dump.tables||dump.modelCount!==Object.keys(dump.tables).length)throw new Error("Dump incompleto ou inválido.");
  const models=orderedModels(),known=new Set(models.map(m=>modelKey(m.name)));
  if(Object.keys(dump.tables).some(k=>!known.has(k)))throw new Error("Dump contém modelos desconhecidos.");
  const total=Object.values(dump.tables).reduce((n,t)=>{if(t.count!==t.rows.length)throw new Error("Contagem inválida no dump.");return n+t.count;},0);
  if(total!==dump.totalRows)throw new Error("Total de registros divergente.");
  return db.$transaction(async tx=>{
    for(const m of models)if(await delegate(tx,modelKey(m.name)).count())throw new Error("Restauração exige banco vazio.");
    const counts:Record<string,number>={};
    for(const m of models){
      const key=modelKey(m.name),table=dump.tables[key];counts[key]=0;
      if(key==="session"&&!includeSessions)continue;
      for(const raw of table?.rows??[]){
        const data:Record<string,unknown>={};
        for(const [field,value]of Object.entries(raw)){
          const def=m.fields.find(f=>f.name===field&&f.kind!=="object");
          if(!def)throw new Error(`Campo desconhecido: ${key}.${field}`);
          data[field]=value===null?null:def.type==="BigInt"?BigInt(String(value)):def.type==="DateTime"?new Date(String(value)):value;
        }
        await delegate(tx,key).create({data});counts[key]++;
      }
    }
    return counts;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:60000});
}

function canonicalPayloadHash(dump: DatabaseDump): string {
  const payload = JSON.stringify({
    version: dump.version,
    modelCount: dump.modelCount,
    totalRows: dump.totalRows,
    tables: dump.tables
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function createSignedBackupEnvelope(db: PrismaClient, signingSecret = process.env.BACKUP_SIGNING_KEY): Promise<SignedBackupEnvelope> {
  const dump = await exportDatabaseDump(db);
  const sha256Checksum = canonicalPayloadHash(dump);
  const cleanSecret = signingSecret?.trim();
  const hmacSignature = cleanSecret
    ? createHmac("sha256", cleanSecret).update(sha256Checksum).digest("hex")
    : null;
  return {
    dump,
    sha256Checksum,
    hmacSignature,
    signed: Boolean(hmacSignature),
    createdAt: new Date().toISOString()
  };
}

export function verifyBackupEnvelopeIntegrity(envelope: SignedBackupEnvelope, signingSecret = process.env.BACKUP_SIGNING_KEY): BackupVerificationCertificate {
  const expectedChecksum = canonicalPayloadHash(envelope.dump);
  if (expectedChecksum !== envelope.sha256Checksum) {
    throw new Error("Integridade do backup reprovada: hash SHA-256 divergente (arquivo adulterado ou corrompido).");
  }
  const cleanSecret = signingSecret?.trim();
  if (envelope.signed || cleanSecret) {
    if (!cleanSecret || !envelope.hmacSignature) {
      throw new Error("Assinatura HMAC ausente ou chave de verificação não configurada.");
    }
    const expectedHmac = createHmac("sha256", cleanSecret).update(expectedChecksum).digest("hex");
    const a = Buffer.from(expectedHmac);
    const b = Buffer.from(envelope.hmacSignature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("Assinatura criptográfica HMAC do backup inválida.");
    }
  }

  const models = orderedModels();
  const known = new Set(models.map((m) => modelKey(m.name)));
  if (envelope.dump.modelCount !== models.length || Object.keys(envelope.dump.tables).some((k) => !known.has(k))) {
    throw new Error("Catálogo de modelos do backup incompatível com o schema Prisma atual.");
  }

  const primaryKeySets = new Map<string, Set<string>>();
  for (const m of models) {
    const key = modelKey(m.name);
    const idField = m.fields.find((f) => f.isId)?.name ?? "id";
    const rows = envelope.dump.tables[key]?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) {
      if (r[idField] !== undefined && r[idField] !== null) {
        set.add(String(r[idField]));
      }
    }
    primaryKeySets.set(m.name, set);
  }

  let referentialLinksChecked = 0;
  for (const m of models) {
    const key = modelKey(m.name);
    const rows = envelope.dump.tables[key]?.rows ?? [];
    for (const raw of rows) {
      for (const [field, value] of Object.entries(raw)) {
        const def = m.fields.find((f) => f.name === field && f.kind !== "object");
        if (!def) throw new Error(`Campo inválido na verificação de restauração: ${key}.${field}`);
        if (value !== null) {
          if (def.type === "BigInt") BigInt(String(value));
          if (def.type === "DateTime" && Number.isNaN(new Date(String(value)).getTime())) {
            throw new Error(`Data inválida em ${key}.${field}`);
          }
        }
      }
      for (const rel of m.fields.filter((f) => f.kind === "object" && (f.relationFromFields?.length ?? 0) === 1 && f.type !== m.name)) {
        const fkField = rel.relationFromFields![0]!;
        const fkVal = raw[fkField];
        if (fkVal !== null && fkVal !== undefined) {
          referentialLinksChecked++;
          const targetIds = primaryKeySets.get(rel.type);
          if (targetIds && !targetIds.has(String(fkVal))) {
            throw new Error(`Vínculo órfão detectado em ${key}.${fkField} -> ${rel.type}(${String(fkVal)})`);
          }
        }
      }
    }
  }

  return {
    verifiedAt: new Date().toISOString(),
    sha256Checksum: envelope.sha256Checksum,
    signed: envelope.signed,
    modelCount: envelope.dump.modelCount,
    totalRows: envelope.dump.totalRows,
    referentialLinksChecked,
    valid: true
  };
}

export async function runAndRecordBackupVerification(db: PrismaClient, actorId: string) {
  const envelope = await createSignedBackupEnvelope(db);
  const certificate = verifyBackupEnvelopeIntegrity(envelope);
  await db.$transaction([
    db.financeSetting.upsert({
      where: { key: "backup_verification:latest" },
      create: { key: "backup_verification:latest", value: JSON.stringify(certificate), changedById: actorId },
      update: { value: JSON.stringify(certificate), changedById: actorId }
    }),
    db.auditLog.create({
      data: {
        actorId,
        action: "BACKUP_VERIFICATION_PASSED",
        entity: "DatabaseBackup",
        entityId: certificate.sha256Checksum.slice(0, 16),
        summary: `Ensaio periódico de backup e verificação relacional aprovado (${certificate.modelCount} modelos, ${certificate.totalRows} registros, SHA-256 ${certificate.sha256Checksum.slice(0, 12)}).`
      }
    })
  ]);
  return { certificate, envelope };
}

export type BackupEnvironmentMetadata = {
  systemVersion: string;
  schemaVersion: string;
  environment: string;
  provider: "postgresql" | "sqlite" | "unknown";
  targetHost: string;
  branch: string | null;
};

export type BackupFinancialTotals = {
  bankAccountsCount: number;
  totalBankBalanceCents: string;
  ledgerCreditsCents: string;
  ledgerDebitsCents: string;
  ledgerNetCents: string;
  bankLedgerReconciled: boolean;
  openReceivablesCents: string;
  settledReceivablesCents: string;
  openPayablesCents: string;
  settledPayablesCents: string;
  grossSalesCents: string;
  netSettlementSalesCents: string;
  payoutsTotalCents: string;
};

export type BackupDataSummary = {
  exportedAt: string;
  version: string;
  modelCount: number;
  totalRows: number;
  businessRows: number;
  tableCounts: Record<string, number>;
  nonEmptyTables: Record<string, number>;
  financialTotals: BackupFinancialTotals;
};

export type BackupRegressionAlert = {
  regressionDetected: boolean;
  previousExportedAt: string | null;
  previousTotalRows: number;
  currentTotalRows: number;
  previousBusinessRows: number;
  currentBusinessRows: number;
  regressions: { table: string; previous: number; current: number; delta: number }[];
};

const EPHEMERAL_TABLES = new Set(["session", "loginAttempt", "operationalNotification"]);

export function identifyDatabaseEnvironment(env: Record<string, string | undefined> = process.env): BackupEnvironmentMetadata {
  const rawUrl = (
    env.DATABASE_URL ||
    env.POSTGRES_PRISMA_URL ||
    env.POSTGRES_URL ||
    env.NEON_DATABASE_URL ||
    ""
  ).trim();
  const environment = (env.MONITOR_ENVIRONMENT || env.NODE_ENV || "development").trim();
  const branch = env.NEON_BRANCH?.trim() || null;
  let provider: BackupEnvironmentMetadata["provider"] = "unknown";
  let targetHost = "unconfigured";

  if (rawUrl.startsWith("file:")) {
    provider = "sqlite";
    const filePart = rawUrl.slice(5).replaceAll("\\", "/").split("/").pop() || "sqlite.db";
    targetHost = `sqlite:${filePart.split("?")[0]}`;
  } else if (rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://")) {
    provider = "postgresql";
    try {
      const parsed = new URL(rawUrl);
      const dbName = parsed.pathname.replace(/^\//, "") || "db";
      targetHost = `${parsed.hostname}/${dbName}`;
    } catch {
      targetHost = "postgresql:masked";
    }
  }

  return {
    systemVersion: "5.2.1",
    schemaVersion: "SOUL-v5.2.1",
    environment,
    provider,
    targetHost,
    branch
  };
}

function sumBigIntField(rows: Record<string, unknown>[], field: string, filter?: (r: Record<string, unknown>) => boolean): bigint {
  let total = 0n;
  for (const row of rows) {
    if (filter && !filter(row)) continue;
    const raw = row[field];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      total += BigInt(String(raw));
    }
  }
  return total;
}

export function summarizeDatabaseDump(dump: DatabaseDump): BackupDataSummary {
  const tableCounts: Record<string, number> = {};
  const nonEmptyTables: Record<string, number> = {};
  let totalRows = 0;
  let businessRows = 0;

  for (const [table, data] of Object.entries(dump.tables ?? {})) {
    const count = data?.count ?? 0;
    tableCounts[table] = count;
    if (count > 0) nonEmptyTables[table] = count;
    totalRows += count;
    if (!EPHEMERAL_TABLES.has(table)) {
      businessRows += count;
    }
  }

  const bankRows = dump.tables.bankAccount?.rows ?? [];
  const ledgerRows = dump.tables.ledgerEntry?.rows ?? [];
  const titleRows = dump.tables.financialTitle?.rows ?? [];
  const saleRows = dump.tables.financialSale?.rows ?? [];
  const payoutRows = dump.tables.payoutRequest?.rows ?? [];

  const totalBankBalance = sumBigIntField(bankRows, "balanceCents");
  const ledgerCredits = sumBigIntField(ledgerRows, "amountCents", (r) => r.direction === "CREDIT");
  const ledgerDebits = sumBigIntField(ledgerRows, "amountCents", (r) => r.direction === "DEBIT");
  const ledgerNet = ledgerCredits - ledgerDebits;

  const perAccountLedger = new Map<string, bigint>();
  for (const entry of ledgerRows) {
    const accId = String(entry.bankAccountId ?? "");
    const amount = BigInt(String(entry.amountCents ?? "0"));
    const signed = entry.direction === "CREDIT" ? amount : -amount;
    perAccountLedger.set(accId, (perAccountLedger.get(accId) ?? 0n) + signed);
  }
  let bankLedgerReconciled = totalBankBalance === ledgerNet;
  for (const acc of bankRows) {
    const accId = String(acc.id ?? "");
    const recorded = BigInt(String(acc.balanceCents ?? "0"));
    if ((perAccountLedger.get(accId) ?? 0n) !== recorded) {
      bankLedgerReconciled = false;
      break;
    }
  }

  const openReceivables = sumBigIntField(
    titleRows,
    "amountCents",
    (r) => r.kind === "RECEIVABLE" && (r.status === "OPEN" || r.status === "OVERDUE")
  );
  const settledReceivables = sumBigIntField(
    titleRows,
    "amountCents",
    (r) => r.kind === "RECEIVABLE" && r.status === "SETTLED"
  );
  const openPayables = sumBigIntField(
    titleRows,
    "amountCents",
    (r) => r.kind === "PAYABLE" && (r.status === "OPEN" || r.status === "OVERDUE")
  );
  const settledPayables = sumBigIntField(
    titleRows,
    "amountCents",
    (r) => r.kind === "PAYABLE" && r.status === "SETTLED"
  );
  const grossSales = sumBigIntField(saleRows, "grossCents");
  const netSettlementSales = sumBigIntField(saleRows, "netSettlementCents");
  const payoutsTotal = sumBigIntField(payoutRows, "amountCents", (r) => r.status !== "REJECTED");

  return {
    exportedAt: dump.exportedAt,
    version: dump.version,
    modelCount: dump.modelCount,
    totalRows,
    businessRows,
    tableCounts,
    nonEmptyTables,
    financialTotals: {
      bankAccountsCount: bankRows.length,
      totalBankBalanceCents: totalBankBalance.toString(),
      ledgerCreditsCents: ledgerCredits.toString(),
      ledgerDebitsCents: ledgerDebits.toString(),
      ledgerNetCents: ledgerNet.toString(),
      bankLedgerReconciled,
      openReceivablesCents: openReceivables.toString(),
      settledReceivablesCents: settledReceivables.toString(),
      openPayablesCents: openPayables.toString(),
      settledPayablesCents: settledPayables.toString(),
      grossSalesCents: grossSales.toString(),
      netSettlementSalesCents: netSettlementSales.toString(),
      payoutsTotalCents: payoutsTotal.toString()
    }
  };
}

export function detectBackupRegression(current: DatabaseDump, baseline: DatabaseDump | null): BackupRegressionAlert {
  const currentSummary = summarizeDatabaseDump(current);
  if (!baseline) {
    return {
      regressionDetected: false,
      previousExportedAt: null,
      previousTotalRows: 0,
      currentTotalRows: currentSummary.totalRows,
      previousBusinessRows: 0,
      currentBusinessRows: currentSummary.businessRows,
      regressions: []
    };
  }
  const baselineSummary = summarizeDatabaseDump(baseline);
  const regressions: { table: string; previous: number; current: number; delta: number }[] = [];

  for (const [table, prevCount] of Object.entries(baselineSummary.tableCounts)) {
    if (EPHEMERAL_TABLES.has(table)) continue;
    const currCount = currentSummary.tableCounts[table] ?? 0;
    if (currCount < prevCount) {
      regressions.push({
        table,
        previous: prevCount,
        current: currCount,
        delta: currCount - prevCount
      });
    }
  }

  return {
    regressionDetected: regressions.length > 0 || currentSummary.businessRows < baselineSummary.businessRows,
    previousExportedAt: baseline.exportedAt,
    previousTotalRows: baselineSummary.totalRows,
    currentTotalRows: currentSummary.totalRows,
    previousBusinessRows: baselineSummary.businessRows,
    currentBusinessRows: currentSummary.businessRows,
    regressions
  };
}

export function verifyDumpRelationalIntegrity(dump: DatabaseDump): BackupVerificationCertificate {
  const sha256Checksum = canonicalPayloadHash(dump);
  return verifyBackupEnvelopeIntegrity({
    dump,
    sha256Checksum,
    hmacSignature: null,
    signed: false,
    createdAt: dump.exportedAt
  }, "");
}

// ============================================================================
// Pacote 7 — Comparação entre backups (Diff de registros, saldos e períodos)
// ============================================================================

export type TableRecordDiff = {
  table: string;
  olderCount: number;
  newerCount: number;
  addedIds: string[];
  removedIds: string[];
  modifiedRecords: { id: string; changedFields: string[] }[];
};

export type PeriodMovementComparison = {
  period: string;
  olderCreditsCents: string;
  newerCreditsCents: string;
  olderDebitsCents: string;
  newerDebitsCents: string;
  olderNetCents: string;
  newerNetCents: string;
  deltaNetCents: string;
};

export type BackupComparisonReport = {
  olderExportedAt: string;
  newerExportedAt: string;
  olderVersion: string;
  newerVersion: string;
  summary: {
    tablesChangedCount: number;
    totalAdded: number;
    totalModified: number;
    totalRemoved: number;
  };
  tableDiffs: TableRecordDiff[];
  financialDelta: {
    older: BackupFinancialTotals;
    newer: BackupFinancialTotals;
    deltaBankBalanceCents: string;
    deltaLedgerCreditsCents: string;
    deltaLedgerDebitsCents: string;
    deltaOpenReceivablesCents: string;
    deltaSettledReceivablesCents: string;
    deltaOpenPayablesCents: string;
    deltaSettledPayablesCents: string;
    deltaGrossSalesCents: string;
    deltaPayoutsTotalCents: string;
  };
  periodMovements: PeriodMovementComparison[];
  volumeDropAlert: BackupRegressionAlert;
};

function recordPrimaryKey(modelName: string, row: Record<string, unknown>, fallbackIndex: number): string {
  const dmmfModel = Prisma.dmmf.datamodel.models.find((m) => modelKey(m.name) === modelName);
  const idField = dmmfModel?.fields.find((f) => f.isId)?.name ?? "id";
  const val = row[idField] ?? row.id ?? row.key ?? row.code;
  return val !== undefined && val !== null ? String(val) : `idx:${fallbackIndex}`;
}

export function diffDatabaseDumps(older: DatabaseDump, newer: DatabaseDump): BackupComparisonReport {
  const allTables = Array.from(new Set([...Object.keys(older.tables ?? {}), ...Object.keys(newer.tables ?? {})])).sort();
  const tableDiffs: TableRecordDiff[] = [];
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  for (const table of allTables) {
    const oldRows = older.tables[table]?.rows ?? [];
    const newRows = newer.tables[table]?.rows ?? [];
    const oldMap = new Map<string, Record<string, unknown>>();
    const newMap = new Map<string, Record<string, unknown>>();

    oldRows.forEach((r, idx) => oldMap.set(recordPrimaryKey(table, r, idx), r));
    newRows.forEach((r, idx) => newMap.set(recordPrimaryKey(table, r, idx), r));

    const addedIds: string[] = [];
    const removedIds: string[] = [];
    const modifiedRecords: { id: string; changedFields: string[] }[] = [];

    for (const [id, newRow] of newMap.entries()) {
      const oldRow = oldMap.get(id);
      if (!oldRow) {
        addedIds.push(id);
      } else {
        const fields = Array.from(new Set([...Object.keys(oldRow), ...Object.keys(newRow)])).sort();
        const changedFields = fields.filter((f) => JSON.stringify(oldRow[f]) !== JSON.stringify(newRow[f]));
        if (changedFields.length > 0) {
          modifiedRecords.push({ id, changedFields });
        }
      }
    }

    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) {
        removedIds.push(id);
      }
    }

    totalAdded += addedIds.length;
    totalModified += modifiedRecords.length;
    totalRemoved += removedIds.length;

    if (addedIds.length > 0 || removedIds.length > 0 || modifiedRecords.length > 0) {
      tableDiffs.push({
        table,
        olderCount: oldRows.length,
        newerCount: newRows.length,
        addedIds,
        removedIds,
        modifiedRecords
      });
    }
  }

  const olderSum = summarizeDatabaseDump(older).financialTotals;
  const newerSum = summarizeDatabaseDump(newer).financialTotals;
  const diffBig = (a: string, b: string) => (BigInt(b) - BigInt(a)).toString();

  // Agrupamento de movimentações do razão por período (YYYY-MM-DD)
  const groupLedgerByPeriod = (rows: Record<string, unknown>[]) => {
    const map = new Map<string, { credits: bigint; debits: bigint }>();
    for (const r of rows) {
      const dateStr = String(r.createdAt ?? "").slice(0, 10) || "sem-data";
      const cur = map.get(dateStr) ?? { credits: 0n, debits: 0n };
      const amt = BigInt(String(r.amountCents ?? "0"));
      if (r.direction === "CREDIT") cur.credits += amt;
      else if (r.direction === "DEBIT") cur.debits += amt;
      map.set(dateStr, cur);
    }
    return map;
  };

  const oldPeriods = groupLedgerByPeriod(older.tables.ledgerEntry?.rows ?? []);
  const newPeriods = groupLedgerByPeriod(newer.tables.ledgerEntry?.rows ?? []);
  const allPeriodKeys = Array.from(new Set([...oldPeriods.keys(), ...newPeriods.keys()])).sort();
  const periodMovements: PeriodMovementComparison[] = allPeriodKeys.map((period) => {
    const o = oldPeriods.get(period) ?? { credits: 0n, debits: 0n };
    const n = newPeriods.get(period) ?? { credits: 0n, debits: 0n };
    const oNet = o.credits - o.debits;
    const nNet = n.credits - n.debits;
    return {
      period,
      olderCreditsCents: o.credits.toString(),
      newerCreditsCents: n.credits.toString(),
      olderDebitsCents: o.debits.toString(),
      newerDebitsCents: n.debits.toString(),
      olderNetCents: oNet.toString(),
      newerNetCents: nNet.toString(),
      deltaNetCents: (nNet - oNet).toString()
    };
  });

  return {
    olderExportedAt: older.exportedAt,
    newerExportedAt: newer.exportedAt,
    olderVersion: older.version,
    newerVersion: newer.version,
    summary: {
      tablesChangedCount: tableDiffs.length,
      totalAdded,
      totalModified,
      totalRemoved
    },
    tableDiffs,
    financialDelta: {
      older: olderSum,
      newer: newerSum,
      deltaBankBalanceCents: diffBig(olderSum.totalBankBalanceCents, newerSum.totalBankBalanceCents),
      deltaLedgerCreditsCents: diffBig(olderSum.ledgerCreditsCents, newerSum.ledgerCreditsCents),
      deltaLedgerDebitsCents: diffBig(olderSum.ledgerDebitsCents, newerSum.ledgerDebitsCents),
      deltaOpenReceivablesCents: diffBig(olderSum.openReceivablesCents, newerSum.openReceivablesCents),
      deltaSettledReceivablesCents: diffBig(olderSum.settledReceivablesCents, newerSum.settledReceivablesCents),
      deltaOpenPayablesCents: diffBig(olderSum.openPayablesCents, newerSum.openPayablesCents),
      deltaSettledPayablesCents: diffBig(olderSum.settledPayablesCents, newerSum.settledPayablesCents),
      deltaGrossSalesCents: diffBig(olderSum.grossSalesCents, newerSum.grossSalesCents),
      deltaPayoutsTotalCents: diffBig(olderSum.payoutsTotalCents, newerSum.payoutsTotalCents)
    },
    periodMovements,
    volumeDropAlert: detectBackupRegression(newer, older)
  };
}

// ============================================================================
// Pacote 8 — Validação financeira detalhada do backup
// ============================================================================

export type FinancialInconsistencyItem = {
  code:
    | "BANK_LEDGER_DIVERGENCE"
    | "ORPHAN_REFERENCE"
    | "INVALID_AMOUNT"
    | "DUPLICATE_RECORD"
    | "PAYMENT_RECEIPT_MISMATCH";
  severity: "CRITICAL" | "WARNING";
  table: string;
  recordId: string;
  description: string;
};

export type FinancialValidationReport = {
  valid: boolean;
  checkedAt: string;
  totalInconsistencies: number;
  inconsistencies: FinancialInconsistencyItem[];
};

export function auditBackupFinancialConsistency(dump: DatabaseDump): FinancialValidationReport {
  const inconsistencies: FinancialInconsistencyItem[] = [];
  const models = orderedModels();

  // 1. Mapa de chaves primárias para conferência de vínculos referenciais
  const primaryKeySets = new Map<string, Set<string>>();
  for (const m of models) {
    const key = modelKey(m.name);
    const idField = m.fields.find((f) => f.isId)?.name ?? "id";
    const rows = dump.tables[key]?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) {
      if (r[idField] !== undefined && r[idField] !== null) {
        set.add(String(r[idField]));
      }
    }
    primaryKeySets.set(m.name, set);
  }

  for (const m of models) {
    const key = modelKey(m.name);
    const idField = m.fields.find((f) => f.isId)?.name ?? "id";
    const rows = dump.tables[key]?.rows ?? [];
    for (const raw of rows) {
      const recId = String(raw[idField] ?? "sem-id");
      for (const rel of m.fields.filter((f) => f.kind === "object" && (f.relationFromFields?.length ?? 0) === 1 && f.type !== m.name)) {
        const fkField = rel.relationFromFields![0]!;
        const fkVal = raw[fkField];
        if (fkVal !== null && fkVal !== undefined) {
          const targetIds = primaryKeySets.get(rel.type);
          if (targetIds && !targetIds.has(String(fkVal))) {
            inconsistencies.push({
              code: "ORPHAN_REFERENCE",
              severity: "CRITICAL",
              table: key,
              recordId: recId,
              description: `Vínculo órfão em ${key}.${fkField} apontando para ${rel.type}(${String(fkVal)}) inexistente.`
            });
          }
        }
      }
    }
  }

  // 2. Conferência de saldos bancários vs razão, valores inválidos e duplicidades no razão
  const bankRows = dump.tables.bankAccount?.rows ?? [];
  const ledgerRows = dump.tables.ledgerEntry?.rows ?? [];
  const titleRows = dump.tables.financialTitle?.rows ?? [];
  const saleRows = dump.tables.financialSale?.rows ?? [];
  const payoutRows = dump.tables.payoutRequest?.rows ?? [];

  const ledgerByBank = new Map<string, bigint>();
  const openingCountByBank = new Map<string, string[]>();
  const ledgerByTitle = new Map<string, Record<string, unknown>[]>();
  const ledgerByPayout = new Map<string, Record<string, unknown>[]>();

  for (const entry of ledgerRows) {
    const id = String(entry.id ?? "sem-id");
    const bankId = String(entry.bankAccountId ?? "");
    const dir = String(entry.direction ?? "");
    const origin = String(entry.origin ?? "");
    let amount = 0n;
    try {
      amount = BigInt(String(entry.amountCents ?? "0"));
    } catch {
      amount = -1n;
    }

    if (amount <= 0n || (dir !== "CREDIT" && dir !== "DEBIT")) {
      inconsistencies.push({
        code: "INVALID_AMOUNT",
        severity: "CRITICAL",
        table: "ledgerEntry",
        recordId: id,
        description: `Lançamento do razão com valor (${String(entry.amountCents)}) ou direção (${dir}) inválida.`
      });
    } else {
      ledgerByBank.set(bankId, (ledgerByBank.get(bankId) ?? 0n) + (dir === "CREDIT" ? amount : -amount));
    }

    if (origin === "OPENING") {
      const list = openingCountByBank.get(bankId) ?? [];
      list.push(id);
      openingCountByBank.set(bankId, list);
    }

    if (entry.titleId !== null && entry.titleId !== undefined) {
      const tId = String(entry.titleId);
      const list = ledgerByTitle.get(tId) ?? [];
      list.push(entry);
      ledgerByTitle.set(tId, list);
    }

    if (entry.payoutId !== null && entry.payoutId !== undefined) {
      const pId = String(entry.payoutId);
      const list = ledgerByPayout.get(pId) ?? [];
      list.push(entry);
      ledgerByPayout.set(pId, list);
    }
  }

  for (const [bankId, ids] of openingCountByBank.entries()) {
    if (ids.length > 1) {
      inconsistencies.push({
        code: "DUPLICATE_RECORD",
        severity: "WARNING",
        table: "ledgerEntry",
        recordId: ids.join(","),
        description: `Conta bancária ${bankId} possui múltiplos lançamentos de abertura (OPENING): ${ids.join(", ")}.`
      });
    }
  }

  for (const acc of bankRows) {
    const accId = String(acc.id ?? "sem-id");
    const recorded = BigInt(String(acc.balanceCents ?? "0"));
    const computed = ledgerByBank.get(accId) ?? 0n;
    if (recorded !== computed) {
      inconsistencies.push({
        code: "BANK_LEDGER_DIVERGENCE",
        severity: "CRITICAL",
        table: "bankAccount",
        recordId: accId,
        description: `Saldo da conta ${String(acc.name ?? accId)} (${recorded.toString()}) diverge da soma do razão (${computed.toString()}).`
      });
    }
  }

  // 3. Títulos financeiros: valores inválidos, consistência de pagamentos, recebimentos e estornos
  const titleMap = new Map<string, Record<string, unknown>>();
  for (const title of titleRows) {
    const tId = String(title.id ?? "sem-id");
    titleMap.set(tId, title);
    const kind = String(title.kind ?? "");
    const status = String(title.status ?? "");
    let amount = 0n;
    try {
      amount = BigInt(String(title.amountCents ?? "0"));
    } catch {
      amount = -1n;
    }
    if (amount <= 0n) {
      inconsistencies.push({
        code: "INVALID_AMOUNT",
        severity: "CRITICAL",
        table: "financialTitle",
        recordId: tId,
        description: `Título financeiro com valor inválido (${String(title.amountCents)}).`
      });
    }

    const linkedEntries = ledgerByTitle.get(tId) ?? [];
    const expectedDir = kind === "RECEIVABLE" ? "CREDIT" : "DEBIT";
    const reverseDir = kind === "RECEIVABLE" ? "DEBIT" : "CREDIT";
    const activeSettlements = linkedEntries.filter((e) => e.direction === expectedDir);
    const reversals = linkedEntries.filter((e) => e.direction === reverseDir);
    const netSettledEntries = activeSettlements.length - reversals.length;

    if (status === "SETTLED") {
      if (!title.settledAt || netSettledEntries <= 0) {
        inconsistencies.push({
          code: "PAYMENT_RECEIPT_MISMATCH",
          severity: "CRITICAL",
          table: "financialTitle",
          recordId: tId,
          description: `Título ${tId} consta como SETTLED, mas não possui data de baixa ou lançamento ativo correspondente no razão.`
        });
      } else if (netSettledEntries > 1) {
        inconsistencies.push({
          code: "DUPLICATE_RECORD",
          severity: "CRITICAL",
          table: "financialTitle",
          recordId: tId,
          description: `Título ${tId} possui ${netSettledEntries} baixas ativas simultâneas no razão (possível duplicidade).`
        });
      } else {
        const netAmount =
          activeSettlements.reduce((s, e) => s + BigInt(String(e.amountCents ?? "0")), 0n) -
          reversals.reduce((s, e) => s + BigInt(String(e.amountCents ?? "0")), 0n);
        if (netAmount !== amount) {
          inconsistencies.push({
            code: "PAYMENT_RECEIPT_MISMATCH",
            severity: "CRITICAL",
            table: "financialTitle",
            recordId: tId,
            description: `Valor liquidado no razão (${netAmount.toString()}) para o título ${tId} diverge do valor do título (${amount.toString()}).`
          });
        }
      }
    } else if (netSettledEntries > 0) {
      inconsistencies.push({
        code: "PAYMENT_RECEIPT_MISMATCH",
        severity: "CRITICAL",
        table: "financialTitle",
        recordId: tId,
        description: `Título ${tId} está com status ${status}, mas possui movimentação de liquidação não estornada no razão.`
      });
    }
  }

  // 4. Vendas financeiras: duplicidade de externalReference e consistência com título recebível
  const seenSaleRefs = new Map<string, string>();
  for (const sale of saleRows) {
    const sId = String(sale.id ?? "sem-id");
    const extRef = String(sale.externalReference ?? "");
    if (extRef) {
      const prev = seenSaleRefs.get(extRef);
      if (prev) {
        inconsistencies.push({
          code: "DUPLICATE_RECORD",
          severity: "CRITICAL",
          table: "financialSale",
          recordId: sId,
          description: `Referência externa de venda duplicada (${extRef}) entre ${prev} e ${sId}.`
        });
      } else {
        seenSaleRefs.set(extRef, sId);
      }
    }
    const gross = BigInt(String(sale.grossCents ?? "0"));
    const netSettlement = BigInt(String(sale.netSettlementCents ?? "0"));
    if (gross <= 0n || netSettlement < 0n) {
      inconsistencies.push({
        code: "INVALID_AMOUNT",
        severity: "CRITICAL",
        table: "financialSale",
        recordId: sId,
        description: `Venda ${sId} possui valores inválidos (gross=${gross.toString()}, netSettlement=${netSettlement.toString()}).`
      });
    }
    const title = titleMap.get(String(sale.receivableTitleId ?? ""));
    if (title) {
      const titleAmount = BigInt(String(title.amountCents ?? "0"));
      if (titleAmount !== netSettlement) {
        inconsistencies.push({
          code: "PAYMENT_RECEIPT_MISMATCH",
          severity: "CRITICAL",
          table: "financialSale",
          recordId: sId,
          description: `Venda ${sId} possui líquido de liquidação (${netSettlement.toString()}) divergente do título recebível (${titleAmount.toString()}).`
        });
      }
    }
  }

  // 5. Repasses (payoutRequest): valor inválido e consistência com baixa no razão
  for (const payout of payoutRows) {
    const pId = String(payout.id ?? "sem-id");
    const status = String(payout.status ?? "");
    const amount = BigInt(String(payout.amountCents ?? "0"));
    if (amount <= 0n) {
      inconsistencies.push({
        code: "INVALID_AMOUNT",
        severity: "CRITICAL",
        table: "payoutRequest",
        recordId: pId,
        description: `Solicitação de repasse ${pId} com valor inválido (${amount.toString()}).`
      });
    }
    const pEntries = ledgerByPayout.get(pId) ?? [];
    if (status === "PAID" && pEntries.length === 0) {
      inconsistencies.push({
        code: "PAYMENT_RECEIPT_MISMATCH",
        severity: "CRITICAL",
        table: "payoutRequest",
        recordId: pId,
        description: `Repasse ${pId} consta como PAID, mas não possui lançamento de débito vinculado no razão.`
      });
    }
  }

  return {
    valid: inconsistencies.length === 0,
    checkedAt: new Date().toISOString(),
    totalInconsistencies: inconsistencies.length,
    inconsistencies
  };
}

// ============================================================================
// Pacote 10 — Compatibilidade entre versões e migração de dumps legados
// ============================================================================

export const SUPPORTED_BACKUP_FORMATS = [1, 2] as const;
export const SUPPORTED_SCHEMA_VERSIONS = [
  "SOUL-v4.1",
  "SOUL-v5.0",
  "SOUL-v5.1",
  "SOUL-v5.2",
  "SOUL-v5.2.0",
  "SOUL-v5.2.1"
] as const;
export const CURRENT_SCHEMA_VERSION = "SOUL-v5.2.1";
export const REQUIRED_SYSTEM_VERSION = "5.2.1";

export type BackupCompatibilityReport = {
  compatible: boolean;
  migrationRequired: boolean;
  sourceFormat: number;
  sourceVersion: string;
  targetVersion: string;
  requiredSystemVersion: string;
  missingModelsFilled: string[];
  unknownModels: string[];
  message: string;
};

export function checkBackupCompatibility(rawDump: unknown, format = 1): BackupCompatibilityReport {
  if (!SUPPORTED_BACKUP_FORMATS.includes(format as 1 | 2)) {
    return {
      compatible: false,
      migrationRequired: false,
      sourceFormat: format,
      sourceVersion: "unknown",
      targetVersion: CURRENT_SCHEMA_VERSION,
      requiredSystemVersion: REQUIRED_SYSTEM_VERSION,
      missingModelsFilled: [],
      unknownModels: [],
      message: `Formato de backup incompatível (format=${format}). Formatos suportados: ${SUPPORTED_BACKUP_FORMATS.join(", ")}.`
    };
  }
  if (!rawDump || typeof rawDump !== "object") {
    return {
      compatible: false,
      migrationRequired: false,
      sourceFormat: format,
      sourceVersion: "unknown",
      targetVersion: CURRENT_SCHEMA_VERSION,
      requiredSystemVersion: REQUIRED_SYSTEM_VERSION,
      missingModelsFilled: [],
      unknownModels: [],
      message: "Estrutura de dump ausente ou inválida."
    };
  }

  const candidate = rawDump as Partial<DatabaseDump>;
  const sourceVersion = String(candidate.version ?? "SOUL-v5.0");
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(sourceVersion as (typeof SUPPORTED_SCHEMA_VERSIONS)[number])) {
    return {
      compatible: false,
      migrationRequired: false,
      sourceFormat: format,
      sourceVersion,
      targetVersion: CURRENT_SCHEMA_VERSION,
      requiredSystemVersion: REQUIRED_SYSTEM_VERSION,
      missingModelsFilled: [],
      unknownModels: [],
      message: `Versão de backup incompatível (${sourceVersion}). Utilize o sistema na versão compatível ou migre a partir de: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`
    };
  }

  const tables = candidate.tables;
  if (!tables || typeof tables !== "object") {
    return {
      compatible: false,
      migrationRequired: false,
      sourceFormat: format,
      sourceVersion,
      targetVersion: CURRENT_SCHEMA_VERSION,
      requiredSystemVersion: REQUIRED_SYSTEM_VERSION,
      missingModelsFilled: [],
      unknownModels: [],
      message: "Mapa de tabelas ausente no backup."
    };
  }

  const knownKeys = Prisma.dmmf.datamodel.models.map((m) => modelKey(m.name));
  const knownSet = new Set(knownKeys);
  const presentKeys = Object.keys(tables);
  const unknownModels = presentKeys.filter((k) => !knownSet.has(k));
  const missingModelsFilled = knownKeys.filter((k) => !presentKeys.includes(k));

  if (unknownModels.length > 0) {
    return {
      compatible: false,
      migrationRequired: false,
      sourceFormat: format,
      sourceVersion,
      targetVersion: CURRENT_SCHEMA_VERSION,
      requiredSystemVersion: REQUIRED_SYSTEM_VERSION,
      missingModelsFilled,
      unknownModels,
      message: `Backup contém modelos desconhecidos para o sistema atual (${unknownModels.join(", ")}). Atualize o sistema antes de restaurar.`
    };
  }

  const migrationRequired = sourceVersion !== CURRENT_SCHEMA_VERSION || missingModelsFilled.length > 0;
  return {
    compatible: true,
    migrationRequired,
    sourceFormat: format,
    sourceVersion,
    targetVersion: CURRENT_SCHEMA_VERSION,
    requiredSystemVersion: REQUIRED_SYSTEM_VERSION,
    missingModelsFilled,
    unknownModels: [],
    message: migrationRequired
      ? `Compatível com migração automática de ${sourceVersion} para ${CURRENT_SCHEMA_VERSION} (${missingModelsFilled.length} tabela(s) nova(s) inicializada(s)).`
      : `Compatível nativamente com ${CURRENT_SCHEMA_VERSION}.`
  };
}

export function migrateLegacyDump(rawDump: unknown, format = 1): { dump: DatabaseDump; compatibility: BackupCompatibilityReport } {
  const compatibility = checkBackupCompatibility(rawDump, format);
  if (!compatibility.compatible) {
    throw new Error(compatibility.message);
  }
  const source = rawDump as DatabaseDump;
  const migratedTables: DatabaseDump["tables"] = {};
  let totalRows = 0;

  for (const model of Prisma.dmmf.datamodel.models) {
    const key = modelKey(model.name);
    const existing = source.tables[key];
    const rows = Array.isArray(existing?.rows)
      ? existing.rows.map((r) => {
          const copy = { ...r };
          if (key === "auditLog" && !("requestId" in copy)) {
            copy.requestId = null;
          }
          return copy;
        })
      : [];
    migratedTables[key] = { count: rows.length, rows };
    totalRows += rows.length;
  }

  return {
    dump: {
      exportedAt: source.exportedAt || new Date().toISOString(),
      version: CURRENT_SCHEMA_VERSION,
      modelCount: Prisma.dmmf.datamodel.models.length,
      totalRows,
      tables: migratedTables
    },
    compatibility
  };
}


