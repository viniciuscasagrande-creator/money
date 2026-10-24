import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
test("vendas, repasses e transferências consultam todas as páginas com totais exatos e escopo seguro",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"money-operational-lists-")),file=path.join(dir,"lists.db"),url=`file:${file.replaceAll("\\","/")}`;
  const previous=process.env.DATABASE_URL;process.env.DATABASE_URL=url;
  fs.writeFileSync(file,"",{flag:"wx"});const db=new PrismaClient({datasources:{db:{url}}});
  try{
    execFileSync(process.execPath,["node_modules/prisma/build/index.js","db","push","--skip-generate"],{env:{...process.env,DATABASE_URL:url},stdio:"pipe"});
    const {operationalListScenarios}=await import("./helpers/operational-list-scenarios");
    await operationalListScenarios(db);
  }finally{await db.$disconnect();if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
