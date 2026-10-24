import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { apiCatch } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { createTitle } from "@/lib/finance";
import {listTitles} from "@/lib/title-list";
export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  try{return NextResponse.json(await listTitles(prisma,user,"PAYABLE",request.nextUrl.searchParams),{headers:{"Cache-Control":"no-store, private"}});}
  catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try { const title = await createTitle("PAYABLE", await request.json(), user); return NextResponse.json({ id: title.id }, { status: 201 }); }
  catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const GET=withMonitoring("/api/pagamentos",GETHandler);
export const POST=withMonitoring("/api/pagamentos",POSTHandler);
