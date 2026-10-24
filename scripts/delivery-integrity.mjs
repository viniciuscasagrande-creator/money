import fs from "node:fs";
import path from "node:path";
import {createManifest,verifyManifest} from "./lib/delivery-integrity.mjs";
try{
  const [action,manifestFile,...files]=process.argv.slice(2);
  if(!manifestFile||!['--create','--verify'].includes(action))throw new Error("Use --create manifesto.json arquivo.zip arquivo.patch ou --verify manifesto.json.");
  if(action==="--create"){
    const directory=fs.realpathSync(path.dirname(path.resolve(manifestFile)));
    if(files.some(file=>path.dirname(fs.realpathSync(file))!==directory))throw new Error("Manifesto e arquivos devem estar no mesmo diretório.");
    fs.writeFileSync(manifestFile,JSON.stringify(await createManifest(files),null,2),{flag:"wx"});
    console.log("Manifesto criado; SHA-256 verifica integridade, não autentica o autor.");
  }else{
    if(files.length)throw new Error("Argumentos excedentes.");
    console.log(JSON.stringify(await verifyManifest(JSON.parse(fs.readFileSync(manifestFile,"utf8")),path.dirname(path.resolve(manifestFile)))));
  }
}catch(e){console.error(e.message);process.exitCode=1;}
