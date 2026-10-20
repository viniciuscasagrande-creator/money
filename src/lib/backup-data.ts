import { Prisma, PrismaClient } from "@prisma/client";

export type DatabaseDump={exportedAt:string;version:string;modelCount:number;totalRows:number;tables:Record<string,{count:number;rows:Record<string,unknown>[]}>};
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
