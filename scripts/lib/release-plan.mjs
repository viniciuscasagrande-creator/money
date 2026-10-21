export function releasePlan({target="preview",confirmation="",ref=""}={}){
  if(!["preview","production"].includes(target))throw new Error("Ambiente de publicação inválido.");
  if(target==="production"&&(confirmation!=="PUBLICAR"||ref!=="main"))throw new Error("Produção exige branch main e confirmação PUBLICAR.");
  return {target,steps:["Conferir variáveis e destino", "Obter configuração do projeto Vercel", "Compilar artefato antes de alterar o banco",
    "Conferir correspondência entre banco da aplicação e banco da migração", "Aplicar migrações versionadas", "Migrar configurações financeiras legadas", "Publicar o artefato pré-compilado"]};
}
export function matchingDatabase(runtimeValue,directValue){
  let runtime,direct;try{runtime=new URL(runtimeValue);direct=new URL(directValue);}catch{throw new Error("Conexões PostgreSQL da publicação inválidas.");}
  if(!["postgresql:","postgres:"].includes(runtime.protocol)||!["postgresql:","postgres:"].includes(direct.protocol))throw new Error("Publicação exige PostgreSQL.");
  if(direct.hostname.includes("-pooler"))throw new Error("Migração exige conexão direta.");
  const host=url=>url.hostname.replace(/-pooler(?=\.)/,"");
  const schema=url=>url.searchParams.get("schema")??"public";
  if(host(runtime)!==host(direct)||runtime.pathname!==direct.pathname||schema(runtime)!==schema(direct))throw new Error("Banco da aplicação difere do destino das migrações. Publicação bloqueada.");
  return true;
}
