import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";

test("listagem pagina além de cem títulos e agrega a busca completa sem misturar produtores ou tipos",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"money-title-list-")),file=path.join(dir,"list.db"),url=`file:${file.replaceAll("\\","/")}`;
  const previous=process.env.DATABASE_URL;process.env.DATABASE_URL=url;
  fs.writeFileSync(file,"",{flag:"wx"});
  const db=new PrismaClient({datasources:{db:{url}}});
  try{
    execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
    const {listTitles,titleListQuery}=await import("../src/lib/title-list");
    const admin=await db.user.create({data:{name:"Admin fixture",email:"list-admin@synthetic.invalid",passwordHash:"synthetic",role:"ADMIN"}});
    const producer=await db.producer.create({data:{name:"Produtor A"}}),other=await db.producer.create({data:{name:"Produtor B"}});
    const owner=await db.user.create({data:{name:"Produtor fixture",email:"list-owner@synthetic.invalid",passwordHash:"synthetic",role:"PRODUCER",producerId:producer.id}});
    const rows=Array.from({length:130},(_,i)=>({id:`list-${String(i).padStart(3,"0")}`,kind:"RECEIVABLE" as const,status:(["OPEN","SETTLED","CANCELED"] as const)[i%3],description:i===0?"Alvo antigo fora dos cem":"Título fixture "+i,amountCents:i===0||i===3?8000000000000000n:100n,producerId:producer.id,createdById:admin.id,createdAt:new Date("2000-01-01T00:00:00Z")}));
    await db.financialTitle.createMany({data:rows});
    await db.financialTitle.createMany({data:[{kind:"RECEIVABLE",description:"SEGREDO OUTRO PRODUTOR",amountCents:999n,producerId:other.id,createdById:admin.id},{kind:"PAYABLE",description:"Pagamento separado",amountCents:300n,producerId:producer.id,createdById:admin.id}]});
    const q=(v:string)=>new URLSearchParams(v);
    const first=await listTitles(db,owner,"RECEIVABLE",q(""));
    assert.equal(first.items.length,25);assert.equal(first.count,130);assert.equal(first.summary.total,130);assert.equal(first.pages,6);
    const open=rows.filter(r=>r.status==="OPEN");assert.equal(first.summary.openCents,open.reduce((n,r)=>n+r.amountCents,0n).toString());assert.ok(BigInt(first.summary.openCents)>BigInt(Number.MAX_SAFE_INTEGER));
    assert.ok(first.items.every(i=>i.producerId===producer.id&&!('bankAccountId' in i)&&!('bankAccountName' in i)));
    const all:string[]=[];for(let page=1;page<=6;page++)all.push(...(await listTitles(db,owner,"RECEIVABLE",q(`pagina=${page}`))).items.map(i=>i.id));
    assert.equal(all.length,130);assert.equal(new Set(all).size,130);assert.deepEqual(all,[...all].sort().reverse());
    const target=await listTitles(db,owner,"RECEIVABLE",q("q=Alvo antigo"));assert.equal(target.count,1);assert.equal(target.items[0].id,"list-000");
    const canceled=await listTitles(db,owner,"RECEIVABLE",q("status=CANCELED"));assert.equal(canceled.count,rows.filter(r=>r.status==="CANCELED").length);assert.equal(canceled.summary.total,130);
    const forbidden=await listTitles(db,owner,"RECEIVABLE",q("q=SEGREDO"));assert.equal(forbidden.count,0);assert.equal(forbidden.summary.openCents,"0");
    const internal=await listTitles(db,admin,"RECEIVABLE",q(""));assert.equal(internal.count,131);
    assert.equal((await listTitles(db,owner,"PAYABLE",q(""))).count,1);
    for(const invalid of ["pagina=0","pagina=-1","limite=101","status=ERRO",`q=${"x".repeat(101)}`])assert.throws(()=>titleListQuery(q(invalid)));
    const oldBytes=Buffer.byteLength(JSON.stringify((await listTitles(db,owner,"RECEIVABLE",q("limite=100"))).items));
    const newBytes=Buffer.byteLength(JSON.stringify(first.items));
    console.log(JSON.stringify({fixtureRows:130,previousPageItems:100,currentPageItems:first.items.length,previousItemsBytes:oldBytes,currentItemsBytes:newBytes,scope:"volume de itens serializados; não mede latência de produção"}));
  }finally{await db.$disconnect();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
