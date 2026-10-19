import {test} from "node:test";
import {strict as assert} from "node:assert";
import {adjustedAvailability,ledgerMatchesStatement,accountingAccounts,csvCell} from "../src/lib/control-math";
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
