import test from "node:test";
import assert from "node:assert/strict";
import {createTestSchema,postgresTestUrl,assertOwnedSchema} from "../scripts/lib/postgres-isolation.mjs";

test("homologação PostgreSQL exige destino explícito e schema exclusivo",()=>{
  const schema=createTestSchema();
  const url=postgresTestUrl("postgresql://user:test@localhost:5432/money_test?schema=public",schema);
  assert.equal(new URL(url).searchParams.get("schema"),schema);assert.equal(assertOwnedSchema(url,schema),schema);
  assert.notEqual(createTestSchema(),schema);
  for(const value of ["", "file:./local.db", "postgresql://u:p@remote.invalid/db", "postgresql://u:p@host-pooler.invalid/db"])
    assert.throws(()=>postgresTestUrl(value,schema));
  assert.throws(()=>assertOwnedSchema(url,"public"));
  assert.throws(()=>assertOwnedSchema(url,createTestSchema()));
});
