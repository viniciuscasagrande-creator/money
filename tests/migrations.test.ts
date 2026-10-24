import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {DatabaseSync} from "node:sqlite";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";

test("migração versionada preserva reservas e transferências existentes",async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"money-migration-")),file=path.join(folder,"existing.db");
  const sqlite=new DatabaseSync(file);
  sqlite.exec(fs.readFileSync("prisma/migrations/202610200001_baseline_v52/migration.sql","utf8"));
  sqlite.exec(`INSERT INTO Producer(id,name)VALUES('p','Produtor migração');
    INSERT INTO User(id,name,email,passwordHash,role)VALUES('migration_user','Usuário anterior','migration@synthetic.invalid','hash-sintetico','ADMIN');
    INSERT INTO AuditLog(id,action,entity,entityId,summary,actorId)VALUES('migration_audit','LEGACY_ACTION','Producer','p','Registro anterior preservado','migration_user');
    INSERT INTO Event(id,name,producerId,status)VALUES('a','Origem','p','ACTIVE'),('b','Destino','p','ACTIVE');
    INSERT INTO EventReserve(id,eventId,purpose,amountCents,createdById)VALUES('r','a','Reserva existente',123,'actor');
    INSERT INTO EventTransfer(id,producerId,originEventId,destinationEventId,amountCents,reason,requestedById)VALUES('t','p','a','b',45,'Transferência existente','actor');
    INSERT INTO BankAccount(id,name,institution,balanceCents)VALUES('migration_bank','Banco anterior','Teste',321);
    INSERT INTO LedgerEntry(id,direction,origin,amountCents,description,bankAccountId)VALUES('migration_ledger','CREDIT','RECEIVABLE',321,'Conciliado anterior','migration_bank');
    INSERT INTO BankStatementLine(id,bankAccountId,externalId,postedAt,description,direction,amountCents,status,ledgerEntryId)VALUES('migration_statement','migration_bank','legacy-match',CURRENT_TIMESTAMP,'Conciliado anterior','CREDIT',321,'MATCHED','migration_ledger');
    INSERT INTO AccountingAccount(id,code,name,type)VALUES('migration_deduction','3.2.01','Impostos sobre receita e cancelamentos','EXPENSE');`);
  sqlite.close();
  const url=`file:${file.replaceAll("\\","/")}`,env={...process.env,DATABASE_URL:url};
  const cli=(args:string[])=>execFileSync(process.execPath,["node_modules/prisma/build/index.js",...args],{env,stdio:"pipe"});
  const db=new PrismaClient({datasources:{db:{url}}});
  try{
    cli(["migrate","resolve","--applied","202610200001_baseline_v52"]);cli(["migrate","deploy"]);
    const reserve=await db.eventReserve.findUniqueOrThrow({where:{id:"r"}}),transfer=await db.eventTransfer.findUniqueOrThrow({where:{id:"t"}});
    assert.equal(reserve.amountCents,123n);assert.equal(reserve.category,"OUTRAS_DESPESAS");assert.ok(reserve.updatedAt instanceof Date);
    assert.equal(transfer.amountCents,45n);assert.equal(transfer.status,"REQUESTED");assert.equal(transfer.producerAcceptedById,null);
    const allocated=await db.reconciliationAllocation.findUniqueOrThrow({where:{requestKey:"legacy:migration_statement"}});
    assert.equal(allocated.amountCents,321n);assert.equal(allocated.ledgerEntryId,"migration_ledger");assert.equal(allocated.actorId,null);
    assert.equal((await db.accountingAccount.findUniqueOrThrow({where:{id:"migration_deduction"}})).type,"DEDUCTION");
    const oldAudit=await db.auditLog.findUniqueOrThrow({where:{id:"migration_audit"}});assert.equal(oldAudit.requestId,null);assert.equal(oldAudit.summary,"Registro anterior preservado");
    assert.equal(await db.integrationDelivery.count(),0);assert.equal(await db.integrationJob.count(),0);assert.equal(await db.operationalNotification.count(),0);cli(["migrate","status"]);
  }finally{await db.$disconnect();fs.rmSync(folder,{recursive:true,force:true});}
});
