import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import {randomBytes,randomUUID} from "node:crypto";
import {spawn,execFileSync} from "node:child_process";
const name=`visual-${randomUUID()}.db`,file=path.resolve("prisma",name);
const socket=net.createServer();await new Promise(r=>socket.listen(0,"127.0.0.1",r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const env={...process.env,DATABASE_URL:`file:./${name}`,ISOLATED_HOMOLOGATION:"SIM",VISUAL_PASSWORD:randomBytes(24).toString("base64url"),VISUAL_BASE_URL:`http://127.0.0.1:${port}`};
fs.writeFileSync(file,"",{flag:"wx"});let server;
try{
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env,stdio:"pipe"});
  execFileSync(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/visual-fixtures.ts"],{env,stdio:"inherit"});
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port),"-H","127.0.0.1"],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  server.stdout.on("data",()=>{});server.stderr.on("data",()=>{});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(env.VISUAL_BASE_URL+"/login")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw new Error("Servidor visual indisponível.");
  console.log(`Ensaio local disponível: ${env.VISUAL_BASE_URL}; encerrar com Ctrl+C. Credenciais efêmeras no arquivo ignorado visual-session.json.`);
  await new Promise(resolve=>{process.once("SIGINT",resolve);process.once("SIGTERM",resolve);server.once("exit",resolve);});
}catch{console.error("Ensaio visual não iniciou.");process.exitCode=1;}
finally{
  if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once("exit",r));}
  for(const suffix of ["","-wal","-shm","-journal"]){if(path.dirname(file)!==path.resolve("prisma"))throw new Error("Limpeza inválida.");fs.rmSync(file+suffix,{force:true});}
  fs.rmSync("homologacao-resultados/visual-session.json",{force:true});
}
