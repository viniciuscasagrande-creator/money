/** Testa a lógica matemática pura mesmo quando npm install não pode rodar.
 * Requer TypeScript disponível globalmente (não substitui compilação ou testes Prisma).
 */
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let ts;
for (const module of ['typescript','/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript','/usr/local/lib/node_modules/typescript']) {
  try {ts=require(module);break;}catch{}
}
if (!ts) { console.error('TypeScript não encontrado. Instale as dependências e rode npm test.');process.exit(2); }
const root=resolve('.');const dir=mkdtempSync(join(tmpdir(),'financeiro-p04-tests-'));
const sources=[...['money','split-calculation','control-math','governance-rules','report-math','dashboard-trend'].map(x=>`src/lib/${x}.ts`),
  ...['money','split-calculation','control-math','governance-rules','report-math','dashboard-trend'].map(x=>`tests/${x}.test.ts`)];
try {
 for(const file of sources){const input=readFileSync(join(root,file),'utf8');
  const output=ts.transpileModule(input,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const target=join(dir,file.replace(/\.ts$/,'.js'));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,output);
 }
 const result=spawnSync(process.execPath,['--test',...sources.filter(x=>x.startsWith('tests/')).map(x=>join(dir,x.replace(/\.ts$/,'.js')))],{stdio:'inherit'});
 process.exitCode=result.status??1;
}finally{rmSync(dir,{recursive:true,force:true});}
