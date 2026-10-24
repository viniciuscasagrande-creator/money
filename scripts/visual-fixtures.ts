import fs from "node:fs";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import bcrypt from "bcryptjs";
const url=process.env.DATABASE_URL??"";
if(process.env.ISOLATED_HOMOLOGATION!=="SIM"||!/^file:\.\/visual-[a-f\d-]{36}\.db$/.test(url))throw new Error("Fixture exige banco visual isolado.");
const db=new PrismaClient();
async function main(){
  const password=process.env.VISUAL_PASSWORD!;if(!password||password.length<20)throw new Error("Credencial temporária ausente.");
  const passwordHash=await bcrypt.hash(password,12);
  const producer=await db.producer.create({data:{name:"Produtor visual A"}}),other=await db.producer.create({data:{name:"Produtor visual B"}});
  const admin=await db.user.create({data:{email:"admin@visual.invalid",name:"Administrador visual",role:"ADMIN",passwordHash}});
  await db.user.createMany({data:[{email:"finance@visual.invalid",name:"Financeiro visual",role:"FINANCE_DISK",passwordHash},{email:"producer@visual.invalid",name:"Produtor visual",role:"PRODUCER",producerId:producer.id,passwordHash}]});
  const event=await db.event.create({data:{name:"Evento visual A",producerId:producer.id,status:"ACTIVE"}});
  await db.bankAccount.create({data:{name:"Banco sintético",institution:"Homologação",balanceCents:0n}});
  await db.financialTitle.createMany({data:Array.from({length:135},(_,i)=>({id:`visual-title-${String(i).padStart(3,"0")}`,kind:"RECEIVABLE",description:i===0?"Busca fora dos primeiros cem":"Recebível sintético "+i,amountCents:BigInt(1000+i),producerId:producer.id,eventId:event.id,createdById:admin.id,createdAt:new Date(Date.UTC(2026,0,1,0,i)),status:i===3?"CANCELED":"OPEN"}))});
  await db.financialTitle.create({data:{kind:"RECEIVABLE",description:"EXCLUSIVO PRODUTOR B",amountCents:999999n,producerId:other.id,createdById:admin.id}});
  fs.mkdirSync("homologacao-resultados",{recursive:true});
  fs.writeFileSync(path.resolve("homologacao-resultados/visual-session.json"),JSON.stringify({baseUrl:process.env.VISUAL_BASE_URL,password,users:["admin@visual.invalid","finance@visual.invalid","producer@visual.invalid"],scope:"Dados sintéticos e senha efêmera; remover após ensaio."}),{mode:0o600});
  console.log("Fixture visual preparada: 136 títulos, três perfis, dados exclusivamente sintéticos.");
}
main().catch(()=>{console.error("Falha ao preparar fixture visual isolada.");process.exitCode=1;}).finally(()=>db.$disconnect());
