import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
export async function fingerprint(file){
  const hash=createHash("sha256");
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  return {bytes:fs.statSync(file).size,sha256:hash.digest("hex")};
}
function safeName(name){return typeof name==="string"&&name!=="."&&name!==".."&&!/[\\/:\x00-\x1f]/.test(name)&&name.length>0&&path.basename(name)===name;}
export async function createManifest(files){
  if(!files.length)throw new Error("Informe arquivos de entrega.");
  const seen=new Set(),items=[];
  for(const file of files){const name=path.basename(file);if(!safeName(name)||seen.has(name)||!fs.lstatSync(file).isFile())throw new Error("Arquivo de entrega inválido ou repetido.");seen.add(name);items.push({name,...await fingerprint(file)});}
  return {version:1,algorithm:"SHA-256",createdAt:new Date().toISOString(),items};
}
export async function verifyManifest(manifest,directory){
  if(manifest?.version!==1||manifest.algorithm!=="SHA-256"||!Array.isArray(manifest.items)||!manifest.items.length)throw new Error("Manifesto inválido.");
  const root=fs.realpathSync(directory),seen=new Set();
  for(const item of manifest.items){
    if(!safeName(item.name)||seen.has(item.name)||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error("Entrada inválida.");
    seen.add(item.name);const file=path.join(root,item.name);
    if(!fs.lstatSync(file).isFile()||path.dirname(fs.realpathSync(file))!==root)throw new Error("Arquivo fora da entrega.");
    const actual=await fingerprint(file);
    if(actual.bytes!==item.bytes||actual.sha256!==item.sha256)throw new Error(`Integridade divergente: ${item.name}`);
  }
  return {status:"VERIFIED",files:manifest.items.length};
}
