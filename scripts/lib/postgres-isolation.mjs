import {randomBytes} from "node:crypto";

export const testSchemaPattern=/^homolog_v5_[a-f0-9]{24}$/;
export function createTestSchema(){return `homolog_v5_${randomBytes(12).toString("hex")}`;}
export function postgresTestUrl(value, schema, allowRemote=false){
  if(!testSchemaPattern.test(schema))throw new Error("Schema de teste inválido.");
  let url;try{url=new URL(value);}catch{throw new Error("Informe POSTGRES_TEST_URL válido.");}
  if(!["postgres:","postgresql:"].includes(url.protocol))throw new Error("Homologação exige PostgreSQL.");
  if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)&&!allowRemote)throw new Error("URL remota exige POSTGRES_TEST_ALLOW_REMOTE=SIM e banco dedicado à homologação.");
  if(url.hostname.includes("-pooler"))throw new Error("Use conexão direta, sem pooler, nas migrações e no ensaio.");
  if(!url.pathname||url.pathname==="/")throw new Error("Informe o nome do banco de homologação.");
  url.searchParams.set("schema",schema);
  url.searchParams.set("connect_timeout","30");
  url.searchParams.set("pool_timeout","30");
  return url.toString();
}
export function assertOwnedSchema(value,expected){
  const url=new URL(value);
  if(!testSchemaPattern.test(expected)||url.searchParams.get("schema")!==expected)throw new Error("Operação recusada fora do schema descartável esperado.");
  return expected;
}
