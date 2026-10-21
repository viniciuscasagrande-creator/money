import test from "node:test";
import assert from "node:assert/strict";
import {releasePlan,matchingDatabase} from "../scripts/lib/release-plan.mjs";

test("publicação inicia em preview e produção depende da branch e confirmação",()=>{
  assert.equal(releasePlan().target,"preview");
  assert.throws(()=>releasePlan({target:"production"}));
  assert.throws(()=>releasePlan({target:"production",confirmation:"PUBLICAR",ref:"feature"}));
  assert.equal(releasePlan({target:"production",confirmation:"PUBLICAR",ref:"main"}).target,"production");
  assert.throws(()=>releasePlan({target:"other"}));
});
test("migrações só seguem quando o destino coincide com o banco da aplicação",()=>{
  assert.equal(matchingDatabase("postgresql://u:p@ep-test-pooler.example/db","postgresql://u:p@ep-test.example/db"),true);
  assert.throws(()=>matchingDatabase("postgresql://u:p@production.example/db","postgresql://u:p@preview.example/db"));
  assert.throws(()=>matchingDatabase("postgresql://u:p@ep-test.example/other","postgresql://u:p@ep-test.example/db"));
  assert.throws(()=>matchingDatabase("postgresql://u:p@ep-test.example/db?schema=other","postgresql://u:p@ep-test.example/db"));
  assert.throws(()=>matchingDatabase("postgresql://u:p@ep-test-pooler.example/db","postgresql://u:p@ep-test-pooler.example/db"));
});
