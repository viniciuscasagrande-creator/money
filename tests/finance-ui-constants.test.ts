import test from "node:test";
import assert from "node:assert/strict";
import { FINANCE_MODULES,PACKAGE_LABELS,RECORD_TYPES,isRecordType,visibleFinanceModules } from "../src/lib/financeiro/constants";

test("todos os quatro pacotes estão representados por telas reais",()=>{
 assert.deepEqual([...new Set(FINANCE_MODULES.map(m=>m.package))].sort(),[1,2,3,4]);
 assert.equal(Object.keys(PACKAGE_LABELS).length,4);
 assert.equal(FINANCE_MODULES.length,20);
 assert.equal(new Set(FINANCE_MODULES.map(m=>m.key)).size,FINANCE_MODULES.length);
 assert.equal(new Set(FINANCE_MODULES.map(m=>m.href)).size,FINANCE_MODULES.length);
 assert.ok(FINANCE_MODULES.every(m=>m.href.startsWith("/")&&m.endpoint.startsWith("/api/")));
});
test("produtor vê apenas módulos não internos e não administrativos",()=>{
 const list=visibleFinanceModules("PRODUCER",["REPORT_VIEW","ALERT_VIEW","PAYOUT_APPROVE"]);
 assert.ok(list.length>0);
 assert.ok(list.every(m=>!m.internal&&!m.admin));
 assert.ok(!list.some(m=>["/gateways","/taxas","/vendas","/contas","/auditoria","/governanca"].includes(m.href)));
 assert.ok(list.some(m=>m.href==="/repasses"));
 assert.ok(list.some(m=>m.href==="/relatorios"));
});
test("financeiro interno não recebe cadastros administrativos e governança exclusiva",()=>{
 const list=visibleFinanceModules("FINANCE_DISK",["REPORT_VIEW","ALERT_VIEW"]);
 assert.ok(list.some(m=>m.href==="/taxas"));
 assert.ok(!list.some(m=>m.admin));
 assert.ok(!list.some(m=>m.href==="/auditoria"));
});
test("capacidade de relatórios/alertas tem efeito no catálogo",()=>{
 const before=visibleFinanceModules("FINANCE_DISK",[]);
 const after=visibleFinanceModules("FINANCE_DISK",["REPORT_VIEW","ALERT_VIEW"]);
 assert.equal(after.length-before.length,2);
 assert.ok(!before.some(m=>m.href==="/relatorios"||m.href==="/alertas"));
});
test("administrador possui catálogo completo sem exceções",()=>{
 const modules=visibleFinanceModules("ADMIN",["REPORT_VIEW","ALERT_VIEW"]);
 assert.equal(modules.length,FINANCE_MODULES.length);
});
test("tipos de detalhe não permitem tipos arbitrários",()=>{
 assert.equal(RECORD_TYPES.length,7);
 for(const type of RECORD_TYPES)assert.ok(isRecordType(type));
 for(const type of ["usuario","credenciais","../../users","taxas","","ledger"])assert.equal(isRecordType(type),false);
});
