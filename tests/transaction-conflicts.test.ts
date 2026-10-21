import test from "node:test";
import assert from "node:assert/strict";
import {Prisma} from "@prisma/client";
import {apiCatch} from "../src/lib/validation";

test("conflito serializável retorna resposta de conflito sem divulgar detalhes internos",()=>{
  const error=new Prisma.PrismaClientKnownRequestError("internal details",{code:"P2034",clientVersion:"6.19.3"});
  const response=apiCatch(error);assert.equal(response.status,409);assert.ok(!response.message.includes("internal details"));
});
