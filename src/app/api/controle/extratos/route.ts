import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { authorize,fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importStatement } from "@/lib/control";
import { apiCatch } from "@/lib/validation";
export const runtime="nodejs";
const schema=z.object({bankAccountId:z.string().min(1),externalId:z.string().trim().min(4).max(100),
  date:z.string().date(),description:z.string().trim().min(3).max(200),direction:z.enum(["CREDIT","DEBIT"]),
  amountCents:z.string().regex(/^\d{1,16}$/)}).strict();
export async function GET(req:NextRequest){
  const {error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error)return error;
  const [statements,ledger]=await Promise.all([
    prisma.bankStatementLine.findMany({take:150,orderBy:{createdAt:"desc"},include:{bankAccount:{select:{name:true}},allocations:{select:{amountCents:true}},issues:{where:{status:"OPEN"},select:{id:true}}}}),
    prisma.ledgerEntry.findMany({take:300,orderBy:{createdAt:"desc"},select:{id:true,bankAccountId:true,description:true,direction:true,amountCents:true,createdAt:true,
      origin:true,allocations:{select:{amountCents:true}},statementLine:{select:{id:true}}}})
  ]);
  return NextResponse.json({statements:statements.map(s=>({id:s.id,bankAccountId:s.bankAccountId,accountName:s.bankAccount.name,
    externalId:s.externalId,postedAt:s.postedAt.toISOString(),description:s.description,amountCents:s.amountCents.toString(),
    openIssues:s.issues.length,remainingCents:(s.amountCents-s.allocations.reduce((n,a)=>n+a.amountCents,0n)).toString(),direction:s.direction,status:s.status,ledgerEntryId:s.ledgerEntryId})),
    ledger:ledger.filter(e=>e.origin!=="OPENING"&&e.amountCents>e.allocations.reduce((n,a)=>n+a.amountCents,0n)).map(e=>({id:e.id,bankAccountId:e.bankAccountId,description:e.description,
      remainingCents:(e.amountCents-e.allocations.reduce((n,a)=>n+a.amountCents,0n)).toString(),
      direction:e.direction,amountCents:e.amountCents.toString(),createdAt:e.createdAt.toISOString()}))});
}
export async function POST(req:NextRequest){
  const {user,error}=await authorize(req,["ADMIN","FINANCE_DISK"]);if(error||!user)return error!;
  try{const id=await importStatement(schema.parse(await req.json()),user);return NextResponse.json({id},{status:201});}
  catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
