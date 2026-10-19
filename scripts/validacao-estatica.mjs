/** Validação estrutural sem instalação de Next/Prisma: NÃO substitui `prisma validate` nem `next build`. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch {
  for (const location of ['/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript']) {
    try { ts = require(location); break; } catch { /* global TS optional */ }
  }
}
if (!ts) { console.error('Instale TypeScript para validar a sintaxe.'); process.exit(2); }
function scan(folder) {
  const out = [];
  for (const dirent of fs.readdirSync(folder, { withFileTypes: true })) {
    const p = path.join(folder, dirent.name);
    if (dirent.isDirectory()) { if (!['node_modules','.next'].includes(dirent.name)) out.push(...scan(p)); }
    else if (/\.(ts|tsx)$/.test(dirent.name)) out.push(p);
  }
  return out;
}
const source = scan(path.resolve('src')).concat(scan(path.resolve('scripts')), scan(path.resolve('tests')));
let errors = 0;
for (const file of source) {
  const content = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(content, { fileName: file, reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve
  } });
  for (const d of result.diagnostics || []) {
    if (d.category !== ts.DiagnosticCategory.Error) continue;
    errors++;
    console.error(`${file}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  }
}
const sqlite = fs.readFileSync('prisma/schema.prisma','utf8');
const pg = fs.readFileSync('prisma/postgresql/schema.prisma','utf8');
function headings(x, kind) { return [...x.matchAll(new RegExp(`^${kind}\\s+(\\w+)\\s*\\{`, 'gm'))].map(m => m[1]).sort(); }
for (const kind of ['model','enum']) {
  const a = headings(sqlite, kind), b = headings(pg, kind);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`Diferença nos nomes de ${kind} entre SQLite e PostgreSQL.`); errors++;
  }
}
if (sqlite.replace('provider = "sqlite"','provider = "postgresql"') !== pg) {
  console.error('Os schemas diferem além do provider do banco.'); errors++;
}
console.log(JSON.stringify({ tsTsxArquivos: source.length,
  prismaModelos: headings(sqlite,'model').length, prismaEnums: headings(sqlite,'enum').length,
  estruturaSQLitePostgres: 'nomes de modelos e enum comparados; sem validação Prisma real',
  errosSintaticos: errors }, null, 2));
process.exitCode = errors ? 1 : 0;
