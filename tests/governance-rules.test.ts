import test from "node:test";
import assert from "node:assert/strict";
import {roleAllows,resolveCapability,approvalWithinLimit} from "../src/lib/governance-rules";
test("produtor não recebe privilégios internos mesmo com override habilitado",()=>{
 assert.equal(roleAllows("PRODUCER","PAYOUT_APPROVE"),false);
 assert.equal(resolveCapability("PRODUCER","PAYOUT_APPROVE",true),false);
 assert.equal(resolveCapability("PRODUCER","REPORT_VIEW",true),true);
});
test("financeiro pode perder permissão, mas não adquirir auditoria administrativa",()=>{
 assert.equal(resolveCapability("FINANCE_DISK","PAYOUT_SETTLE",false),false);
 assert.equal(resolveCapability("FINANCE_DISK","AUDIT_VIEW",true),false);
 assert.equal(resolveCapability("FINANCE_DISK","CONFIG_VIEW",true),false);
 assert.equal(resolveCapability("ADMIN","AUDIT_VIEW",false),true);
});
test("alçada financeira ausente é bloqueada para Financeiro Interno",()=>{
 assert.equal(approvalWithinLimit("FINANCE_DISK",100n),false);
 assert.equal(approvalWithinLimit("FINANCE_DISK",100n,99n,true),false);
 assert.equal(approvalWithinLimit("FINANCE_DISK",100n,100n,true),true);
 assert.equal(approvalWithinLimit("FINANCE_DISK",100n,100n,false),false);
 assert.equal(approvalWithinLimit("PRODUCER",1n,10000n,true),false);
});
