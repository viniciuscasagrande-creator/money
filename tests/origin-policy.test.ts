import test from "node:test";
import assert from "node:assert/strict";
import {sameRequestOrigin} from "../src/lib/origin-policy";
test("origem aceita destino efetivo com porta e mantém bloqueio entre sites e protocolos",()=>{
  assert.equal(sameRequestOrigin("http://127.0.0.1:3210","http:","127.0.0.1:3210"),true);
  assert.equal(sameRequestOrigin("http://localhost:3210","http:","127.0.0.1:3210"),false);
  assert.equal(sameRequestOrigin("https://financeiro.example","https:","financeiro.example:443"),true);
  for(const origin of ["https://atacante.example","http://financeiro.example","https://financeiro.example:444","null","https://financeiro.example/rota","https://user:pass@financeiro.example","https://financeiro.example?x=1"])
    assert.equal(sameRequestOrigin(origin,"https:","financeiro.example"),false,origin);
  assert.equal(sameRequestOrigin("https://financeiro.example","https:","financeiro.example/path"),false);
  assert.equal(sameRequestOrigin(null,"https:","financeiro.example"),true);
});
