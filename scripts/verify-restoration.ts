import fs from "node:fs";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import {exportDatabaseDump,type DatabaseDump} from "../src/lib/backup-data";
import assert from "node:assert/strict";
async function main(){
  const [dumpFile,target]=process.argv.slice(2);
  if(!dumpFile||!target||!/^restore-[\w-]+\.db$/.test(path.basename(target)))throw new Error("Informe dump e banco isolado restore-NOME.db.");
  const original=JSON.parse(fs.readFileSync(dumpFile,"utf8"))as DatabaseDump;
  const db=new PrismaClient({datasources:{db:{url:`file:${path.resolve(target).replaceAll("\\","/")}`}}});
  try{
    const restored=await exportDatabaseDump(db);let checked=0;
    for(const [key,table]of Object.entries(original.tables)){
      assert.equal(restored.tables[key].count,table.count,`Contagem: ${key}`);
      const expected=table.rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort();
      const fields=new Set(table.rows.flatMap(Object.keys));
      const actual=restored.tables[key].rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>fields.has(k)).sort(([a],[b])=>a.localeCompare(b))))).sort();
      assert.deepEqual(actual,expected,`Conteúdo: ${key}`);checked+=table.count;
    }
    const entries=await db.ledgerEntry.findMany();
    for(const account of await db.bankAccount.findMany()){
      const ledger=entries.filter(e=>e.bankAccountId===account.id).reduce((total,e)=>total+(e.direction==="CREDIT"?e.amountCents:-e.amountCents),0n);
      assert.equal(ledger,account.balanceCents,"Saldo bancário e razão divergentes.");
    }
    console.log(JSON.stringify({status:"APROVADO",modelsCompared:original.modelCount,rowsCompared:checked,content:"campos originais, valores, datas, referências e hashes preservados",bankLedger:"reconciliado"},null,2));
  }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
