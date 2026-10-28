import assert from "node:assert/strict";
import {type DatabaseDump, summarizeDatabaseDump, verifyDumpRelationalIntegrity} from "./backup-data";

export function compareRestoredDump(original:DatabaseDump,restored:DatabaseDump,includeSessions=false){
  assert.equal(restored.version,original.version,"Versão de schema divergente na restauração.");
  assert.equal(restored.modelCount,original.modelCount,"Quantidade de modelos divergente na restauração.");
  let rowsCompared=0;
  for(const [key,table]of Object.entries(original.tables)){
    const expectedRows=key==="session"&&!includeSessions?[]:table.rows;
    assert.equal(restored.tables[key]?.count,expectedRows.length,`Contagem: ${key}`);
    const fields=new Set(table.rows.flatMap(Object.keys));
    const canonical=(rows:Record<string,unknown>[])=>rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>fields.has(k)).sort(([a],[b])=>a.localeCompare(b))))).sort();
    assert.deepEqual(canonical(restored.tables[key].rows),canonical(expectedRows),`Conteúdo: ${key}`);
    rowsCompared+=expectedRows.length;
  }
  const balances=new Map<unknown,bigint>();
  for(const entry of restored.tables.ledgerEntry.rows){
    assert.ok(entry.direction==="CREDIT"||entry.direction==="DEBIT","Direção inválida no razão.");
    const amount=BigInt(String(entry.amountCents));
    assert.ok(amount>0n,"Valor inválido no razão.");
    balances.set(entry.bankAccountId,(balances.get(entry.bankAccountId)??0n)+(entry.direction==="CREDIT"?amount:-amount));
  }
  for(const account of restored.tables.bankAccount.rows){
    const ledger=balances.get(account.id)??0n;
    assert.equal(ledger,BigInt(String(account.balanceCents)),`Saldo bancário divergente: ${account.id}`);
  }
  const relational=verifyDumpRelationalIntegrity(restored);
  assert.equal(relational.valid,true,"Integridade referencial reprovada após restauração.");
  const summary=summarizeDatabaseDump(restored);
  assert.equal(summary.financialTotals.bankLedgerReconciled,true,"Conciliação do razão bancário reprovada.");
  return {
    modelsCompared:original.modelCount,
    rowsCompared,
    referentialLinksChecked:relational.referentialLinksChecked,
    schemaVersion:restored.version,
    sessions:includeSessions?"preservadas somente no ensaio isolado":"invalidadas",
    bankLedger:"reconciliado",
    financialTotals:summary.financialTotals
  };
}
