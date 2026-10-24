import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { apiCatch } from "@/lib/validation";
import { settleTitle } from "@/lib/finance";
export const runtime = "nodejs";
const inputSchema = z.object({ bankAccountId: z.string().min(1) }).strict();
async function POSTHandler(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try { const { id } = await ctx.params; const { bankAccountId } = inputSchema.parse(await request.json());
    return NextResponse.json(await settleTitle(id, bankAccountId, user));
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const POST=withMonitoring("/api/titulos/[id]/liquidar",POSTHandler);
