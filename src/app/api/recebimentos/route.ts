import { NextRequest, NextResponse } from "next/server";
import { authorize, fail, isInternal } from "@/lib/auth";
import { apiCatch } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { createTitle, titleDTO, titleInclude, titleWhereFor } from "@/lib/finance";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  const titles = await prisma.financialTitle.findMany({ where: titleWhereFor(user, "RECEIVABLE"), include: titleInclude, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ items: titles.map(t => titleDTO(t, isInternal(user.role))) });
}
export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try { const title = await createTitle("RECEIVABLE", await request.json(), user); return NextResponse.json({ id: title.id }, { status: 201 }); }
  catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}
