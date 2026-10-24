import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {withMonitoring,currentRequestId,operationalLog,validRequestId} from "../src/lib/observability";
import {apiCatch} from "../src/lib/validation";

test("requisições concorrentes têm referência própria, omitem segredos e sanitizam exceções",async()=>{
  const logs:string[]=[],info=console.info,error=console.error;
  console.info=(value)=>logs.push(String(value));console.error=(value)=>logs.push(String(value));
  try{
    const ids:string[]=[];
    const handle=withMonitoring("/api/titulos/[id]/liquidar",async(request:Request)=>{
      const before=currentRequestId()!;
      await new Promise(resolve=>setTimeout(resolve,2));
      assert.equal(currentRequestId(),before);ids.push(before);
      if(request.headers.has("fail"))throw new Error("postgresql://usuario:SENHA-SECRETA@host payload financeiro token privado");
      return Response.json({ok:true});
    });
    const responses=await Promise.all([handle(new Request("https://synthetic.invalid/api/titulos/CPF-PRIVADO/liquidar?token=SECRETO",{method:"POST",headers:{Authorization:"Bearer TOKEN-PRIVADO","X-Request-ID":"id-injetado"}})),handle(new Request("https://synthetic.invalid/api/titulos/outro/liquidar",{method:"POST",headers:{fail:"1"}}))]);
    assert.equal(responses[0].status,200);assert.equal(responses[1].status,500);
    assert.ok(ids.every(validRequestId));assert.notEqual(ids[0],ids[1]);assert.equal(currentRequestId(),undefined);
    for(const response of responses)assert.ok(validRequestId(response.headers.get("X-Request-ID")!));
    assert.ok(!(await responses[1].text()).includes("SENHA-SECRETA"));
    apiCatch(new Error("SENHA-SECRETA"));operationalLog("worker_failed",{code:"TOKEN-PRIVADO\nINVALID"});
    const text=logs.join("\n");
    for(const secret of ["SENHA-SECRETA","TOKEN-PRIVADO","CPF-PRIVADO","id-injetado","postgresql://","payload financeiro"])assert.ok(!text.includes(secret));
    const requests=logs.map(line=>JSON.parse(line)).filter(x=>x.event==="http_request");
    assert.equal(requests.length,2);assert.ok(requests.every(x=>x.route==="/api/titulos/[id]/liquidar"&&x.durationMs>=0));
  }finally{console.info=info;console.error=error;}
});
test("todas as operações HTTP exportadas passam pelo monitor e não usam console bruto",()=>{
  function scan(folder:string){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);if(entry.isDirectory())scan(file);else if(entry.name==="route.ts"){
      const source=fs.readFileSync(file,"utf8");assert.ok(!/export async function (GET|POST|PATCH|DELETE|PUT|HEAD|OPTIONS)/.test(source),file);
      assert.ok(source.includes("withMonitoring("),file);assert.ok(!/console\.(error|log|warn)/.test(source),file);
    }
  }}scan("src/app/api");
});
