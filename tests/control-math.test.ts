import {test} from "node:test";
import {strict as assert} from "node:assert";
import {
  adjustedAvailability,
  ledgerMatchesStatement,
  accountingAccounts,
  csvCell,
  PAYOUT_LOCK_CATALOG,
  DEFAULT_PROGRESSIVE_TIERS,
  evaluatePayoutLocksAndCeiling,
  evaluateEventTransferEligibility,
  applyInternalEventTransfers
} from "../src/lib/control-math";
test("saldo retém exposição aberta sem mover recebimento já ocorrido",()=>{
 const a=adjustedAvailability({total:10000n,settled:7000n,committed:1000n,openExposure:2000n,confirmedExposure:500n});
 assert.equal(a.repasseCents,3500n);assert.equal(a.antecipacaoCents,6500n);
 assert.equal(a.blockedCents,2000n);assert.equal(a.confirmedLossCents,500n);
});
test("não disponibiliza saldo negativo",()=>{
 const a=adjustedAvailability({total:1000n,settled:1000n,committed:1000n,openExposure:1000n,confirmedExposure:500n});
 assert.equal(a.repasseCents,0n);assert.equal(a.antecipacaoCents,0n);
});
test("conciliador exige conta, sentido e valor idênticos",()=>{
 const bank={bankAccountId:"a",direction:"CREDIT",amountCents:500n};
 assert.equal(ledgerMatchesStatement(bank,{...bank}),true);
 assert.equal(ledgerMatchesStatement(bank,{...bank,bankAccountId:"b"}),false);
 assert.equal(ledgerMatchesStatement(bank,{...bank,direction:"DEBIT"}),false);
 assert.equal(ledgerMatchesStatement(bank,{...bank,amountCents:501n}),false);
});
test("exportação contábil sugere contrapartida e não grava no razão",()=>{
 const a=accountingAccounts("PAYOUT","DEBIT");assert.match(a.debit,/produtores/i);assert.equal(a.credit,"Banco");
});
test("exportação CSV neutraliza fórmula de planilha",()=>{
 assert.equal(csvCell('=1+1'),"\"'=1+1\"");
 assert.equal(csvCell('casa"nova'), '"casa""nova"');
});
test("catálogo de 20 travas e 7 faixas progressivas completos",()=>{
 assert.equal(PAYOUT_LOCK_CATALOG.length,20);
 assert.equal(DEFAULT_PROGRESSIVE_TIERS.length,7);
});
test("regra de 50% de vendas e 20% de liberação sobre líquido após retenções obrigatórias (R$ 50k - R$ 12k = R$ 38k -> R$ 7.600,00)",()=>{
 const res=evaluatePayoutLocksAndCeiling({
  settledProducerCents:5000000n,
  mandatoryRetentionsCents:1200000n,
  openRiskCents:0n,
  previousPayoutsCents:0n,
  soldPercentBps:5000,
  salesTriggerBps:5000,
  calculationBase:"PRODUCER_NET_AFTER_RETENTIONS"
 });
 assert.equal(res.balanceAfterReservesCents,3800000n);
 assert.equal(res.releaseLimitBps,2000);
 assert.equal(res.maxNewRequestCents,760000n);
 assert.equal(res.eligible,true);
});
test("simulador de travas com 55% vendido, R$ 67k liquidado, R$ 12k retenções e R$ 3k repasses anteriores resulta em R$ 8.000,00",()=>{
 const res=evaluatePayoutLocksAndCeiling({
  settledProducerCents:6700000n,
  mandatoryRetentionsCents:1200000n,
  openRiskCents:0n,
  previousPayoutsCents:300000n,
  soldPercentBps:5500,
  salesTriggerBps:3000,
  calculationBase:"PRODUCER_NET_AFTER_RETENTIONS"
 });
 assert.equal(res.balanceAfterReservesCents,5500000n);
 assert.equal(res.cumulativeCommercialCeilingCents,1100000n);
 assert.equal(res.maxNewRequestCents,800000n);
});
test("travas impeditivas (contrato não assinado ou bloqueio manual) zeram limite de nova solicitação",()=>{
 const res=evaluatePayoutLocksAndCeiling({
  settledProducerCents:5000000n,
  mandatoryRetentionsCents:0n,
  openRiskCents:0n,
  previousPayoutsCents:0n,
  soldPercentBps:8000,
  contractSigned:false
 });
 assert.equal(res.eligible,false);
 assert.equal(res.maxNewRequestCents,0n);
});
test("transferência atômica entre eventos do mesmo produtor conserva total (R$ 80k -> R$ 60k e R$ 5k -> R$ 25k)",()=>{
 const tr=applyInternalEventTransfers({
  sourceBalanceCents:8000000n,
  targetBalanceCents:500000n,
  transferAmountCents:2000000n
 });
 assert.equal(tr.newSourceBalanceCents,6000000n);
 assert.equal(tr.newTargetBalanceCents,2500000n);
 assert.equal(tr.consolidatedTotalCents,8500000n);
});
test("transferência entre eventos exige mesmo produtor, permissão habilitada pelo Financeiro SOUL e saldo elegível",()=>{
 const crossProd=evaluateEventTransferEligibility({
  sourceProducerId:"p1",targetProducerId:"p2",sourceEventId:"e1",targetEventId:"e2",
  amountCents:1000n,sourceFinancialAvailableCents:5000n,sourceLockBlockingReasons:[],allowEventTransfers:true
 });
 assert.equal(crossProd.allowed,false);
 const disabledPerm=evaluateEventTransferEligibility({
  sourceProducerId:"p1",targetProducerId:"p1",sourceEventId:"e1",targetEventId:"e2",
  amountCents:1000n,sourceFinancialAvailableCents:5000n,sourceLockBlockingReasons:[],allowEventTransfers:false
 });
 assert.equal(disabledPerm.allowed,false);
 const valid=evaluateEventTransferEligibility({
  sourceProducerId:"p1",targetProducerId:"p1",sourceEventId:"e1",targetEventId:"e2",
  amountCents:2000n,sourceFinancialAvailableCents:5000n,sourceLockBlockingReasons:[],allowEventTransfers:true
 });
 assert.equal(valid.allowed,true);
});


