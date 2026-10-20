import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import {randomBytes,randomUUID} from "node:crypto";
import {execFileSync,spawn} from "node:child_process";
const name=`homologacao-${randomUUID()}.db`,file=path.resolve("prisma",name);
const serverSocket=net.createServer();await new Promise(r=>serverSocket.listen(0,"127.0.0.1",r));
const port=serverSocket.address().port;await new Promise(r=>serverSocket.close(r));
const secret=randomBytes(32).toString("base64url");
const env={...process.env,DATABASE_URL:`file:./${name}`,ISOLATED_HOMOLOGATION:"SIM",HOMOLOG_BASE_URL:`http://127.0.0.1:${port}`,
  HOMOLOG_ADMIN_EMAIL:"admin@homolog.invalid",HOMOLOG_ADMIN_PASSWORD:secret,HOMOLOG_PRODUCER_PASSWORD:randomBytes(32).toString("base64url"),
  BOOTSTRAP_ADMIN_EMAIL:"admin@homolog.invalid",BOOTSTRAP_ADMIN_PASSWORD:secret,BOOTSTRAP_ADMIN_NAME:"Administrador homologação"};
fs.writeFileSync(file,"",{flag:"wx"});let server;
try{
  execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env,stdio:"inherit"});
  execFileSync(process.execPath,["node_modules/tsx/dist/cli.mjs","scripts/bootstrap.ts"],{env,stdio:"inherit"});
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port),"-H","127.0.0.1"],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  let log="";server.stdout.on("data",x=>log+=x);server.stderr.on("data",x=>log+=x);
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(env.HOMOLOG_BASE_URL+"/login")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw new Error(`Servidor não respondeu. ${log}`);
  await new Promise((resolve,reject)=>{const test=spawn(process.execPath,["scripts/homologacao-integrada.mjs"],{env,stdio:"inherit",windowsHide:true});test.on("error",reject);test.on("exit",code=>code===0?resolve():reject(new Error(`Homologação retornou ${code}`)));});
}catch(e){console.error(e.message);process.exitCode=1;}
finally{
  if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once("exit",r));}
  for(const suffix of ["","-wal","-shm","-journal"]){const target=file+suffix;if(path.dirname(target)!==path.resolve("prisma"))throw new Error("Destino de limpeza inválido.");fs.rmSync(target,{force:true});}
}
