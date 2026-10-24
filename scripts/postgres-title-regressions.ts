import fs from "node:fs";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {assertOwnedSchema} from "./lib/postgres-isolation.mjs";
import {listTitles} from "../src/lib/title-list";
assertOwnedSchema(process.env.DATABASE_URL??"",process.env.HOMOLOG_SCHEMA??"");
const db=new PrismaClient();
async function main(){
  const producer=await db.producer.create({data:{name:"Produtor Álvaro fixture"}}),other=await db.producer.create({data:{name:"Outro produtor fixture"}});
  const admin=await db.user.create({data:{name:"Admin fixture",email:"titles-admin@synthetic.invalid",passwordHash:"synthetic",role:"ADMIN"}});
  const owner=await db.user.create({data:{name:"Produtor fixture",email:"titles-owner@synthetic.invalid",passwordHash:"synthetic",role:"PRODUCER",producerId:producer.id}});
  await db.financialTitle.createMany({data:Array.from({length:130},(_,i)=>({id:`pg-title-${String(i).padStart(3,"0")}`,kind:"RECEIVABLE",description:i===0?"BUSCA ANTIGA ÁRVORE":"Recebível fixture "+i,amountCents:i<2?8000000000000000n:100n,producerId:producer.id,createdById:admin.id,createdAt:new Date("2000-01-01T00:00:00Z")}))});
  await db.financialTitle.create({data:{kind:"RECEIVABLE",description:"Outro produtor confidencial",amountCents:999n,producerId:other.id,createdById:admin.id}});
  const first=await listTitles(db,owner,"RECEIVABLE",new URLSearchParams("limite=25"));
  assert.equal(first.count,130);assert.equal(first.items.length,25);assert.equal(first.summary.openCents,(16000000000000000n+12800n).toString());
  const pages=[];for(let page=1;page<=6;page++)pages.push(...(await listTitles(db,owner,"RECEIVABLE",new URLSearchParams(`limite=25&pagina=${page}`))).items.map(t=>t.id));
  assert.equal(pages.length,130);assert.equal(new Set(pages).size,130);
  const search=await listTitles(db,owner,"RECEIVABLE",new URLSearchParams({q:"busca antiga árvore"}));assert.equal(search.count,1);assert.equal(search.items[0].id,"pg-title-000");
  assert.equal((await listTitles(db,owner,"RECEIVABLE",new URLSearchParams({q:"confidencial"}))).count,0);
  assert.equal((await listTitles(db,admin,"RECEIVABLE",new URLSearchParams())).count,131);
  assert.ok(first.items.every(t=>!("bankAccountId" in t)));
  const report={status:"APROVADO",completedAt:new Date().toISOString(),provider:"postgresql",scope:"paginação, ordem estável, totais BigInt, busca insensível a caixa e isolamento por produtor",rows:131,pages:6};
  fs.mkdirSync("homologacao-resultados",{recursive:true});fs.writeFileSync("homologacao-resultados/pacote8-postgresql.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(()=>{console.error("Regressão de títulos PostgreSQL REPROVADA; detalhes de conexão omitidos.");process.exitCode=1;}).finally(()=>db.$disconnect());
