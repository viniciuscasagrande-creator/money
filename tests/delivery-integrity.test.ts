import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
test("manifesto detecta alteração, ausência, repetição e caminhos fora da entrega",async()=>{
  const {createManifest,verifyManifest}=await import("../scripts/lib/delivery-integrity.mjs");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"money-integrity-")),file=path.join(dir,"sample.zip");
  try{
    fs.writeFileSync(file,"original");const manifest=await createManifest([file]);
    assert.deepEqual(await verifyManifest(manifest,dir),{status:"VERIFIED",files:1});
    fs.writeFileSync(file,"modified");await assert.rejects(()=>verifyManifest(manifest,dir),/divergente/);
    for(const name of ["../escape.zip","..\\escape.zip","/absolute.zip","C:escape.zip","sample.zip:stream"]){await assert.rejects(()=>verifyManifest({...manifest,items:[{...manifest.items[0],name}]},dir),/inválida/);}
    await assert.rejects(()=>verifyManifest({...manifest,items:[manifest.items[0],manifest.items[0]]},dir));
    await assert.rejects(()=>createManifest([file,file]),/repetido/);
    fs.unlinkSync(file);await assert.rejects(()=>verifyManifest(manifest,dir));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
