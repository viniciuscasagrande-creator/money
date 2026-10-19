import test from "node:test";
import assert from "node:assert/strict";
import {summarizeFinancials,totals,encodeReportCsv,type ReportSale,type ReportPayout} from "../src/lib/report-math";
const sale:ReportSale={producerId:"p1",eventId:"e1",createdAt:new Date("2026-10-10T12:00:00Z"),grossCents:10000n,feeCents:1000n,mdrCents:250n,producerNetCents:8750n,diskNetCents:1000n,status:"SETTLED"};
const payout:ReportPayout={producerId:"p1",eventId:"e1",createdAt:new Date("2026-10-11T12:00:00Z"),type:"REPASSE",status:"SETTLED",amountCents:5000n};
test("agrupamento contábil em centavos mantém totais",()=>{
 const row=summarizeFinancials([sale],[payout],"EVENT")[0];assert.equal(row.grossCents,10000n);
 assert.equal(row.producerCents,8750n);assert.equal(row.diskCents,1000n);assert.equal(row.paidCents,5000n);
 assert.equal(totals([row]).grossCents,10000n);
});
test("agrupamento mensal reflete data de registro",()=>{
 const g=summarizeFinancials([sale],[payout],"MONTH");assert.equal(g.length,1);
 assert.equal(g[0].key,"2026-10");assert.equal(g[0].paidCents,5000n);
});
test("CSV neutraliza fórmulas e escapa aspas",()=>{
 const csv=encodeReportCsv([["Evento", "Valor"],["=1+1","100"],["A\"B", "200"]]);
 assert.ok(csv.startsWith("\uFEFF"));assert.ok(csv.includes('"\'=1+1"'));
 assert.ok(csv.includes('"A""B"'));
});
