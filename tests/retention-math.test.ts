import test from "node:test";
import assert from "node:assert/strict";
import {repasseAvailable} from "../src/lib/retention-math";
test("retencoes protegem saldo",()=>assert.equal(repasseAvailable({settled:100000n,committed:10000n,riskBlocked:5000n,reserve:25000n,transferReserved:10000n,transferExecuted:5000n}),45000n));
test("nao autoriza saldo negativo",()=>assert.equal(repasseAvailable({settled:1000n,committed:0n,riskBlocked:0n,reserve:5000n,transferReserved:0n,transferExecuted:0n}),0n));
test("limite comercial prevalece",()=>assert.equal(repasseAvailable({settled:10000n,committed:0n,riskBlocked:0n,reserve:0n,transferReserved:0n,transferExecuted:0n,policyCeiling:2000n}),2000n));
