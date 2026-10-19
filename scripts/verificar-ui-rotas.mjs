/** Verificação estrutural: não substitui autorização real nem build Next/Prisma. */
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;
for(const mod of ['typescript','/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript','/usr/local/lib/node_modules/typescript']){try{ts=require(mod);break;}catch{}}
if(!ts)throw new Error('TypeScript é obrigatório para inspecionar catálogo.');
const file='src/lib/financeiro/constants.ts';
const content=readFileSync(file,'utf8');
const transpiled=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const ex={};new Function('exports',transpiled)(ex);
const problems=[];
for(const m of ex.FINANCE_MODULES){
 if(!existsSync(`src/app/(workspace)${m.href}/page.tsx`))problems.push(`Tela não encontrada: ${m.href}`);
 if(!existsSync(`src/app${m.endpoint}/route.ts`))problems.push(`API não encontrada: ${m.endpoint}`);
}
for(const type of ex.RECORD_TYPES){
 if(!existsSync('src/app/api/registros/[tipo]/[id]/route.ts'))problems.push('Falta endpoint de consulta detalhada');
}
for(const f of ['titles','payouts','sales','control-pages']){
 if(!readFileSync(`src/components/financeiro/${f}.tsx`,'utf8').includes('RecordDetailModal'))problems.push(`Falta consulta individual em ${f}`);
}
const schema=readFileSync('prisma/schema.prisma','utf8');
if(schema!==readFileSync('prisma/postgresql/schema.prisma','utf8').replace('provider = "postgresql"','provider = "sqlite"'))problems.push('Schema SQLite/PostgreSQL difere');
console.log(JSON.stringify({modulos:ex.FINANCE_MODULES.length,pacotes:[1,2,3,4].map(n=>({numero:n,telas:ex.FINANCE_MODULES.filter(m=>m.package===n).length})),endpointsDeDetalhes:ex.RECORD_TYPES.length,problemas:problems},null,2));
if(problems.length)process.exitCode=1;
