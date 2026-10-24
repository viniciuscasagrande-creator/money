import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { actOnPayout } from "@/lib/operations";
import { apiCatch } from "@/lib/validation";
export const runtime = "nodejs";
const schema = z.object({ action: z.enum(["APPROVE", "REJECT", "PRODUCER_ACCEPT", "FINANCE_SIGN", "SETTLE"]),
  reason: z.string().trim().max(500).optional(), bankAccountId: z.string().optional(), settlementReference: z.string().trim().max(100).optional() }).strict();
async function POSTHandler(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  try { const { id } = await ctx.params; const { action, ...params } = schema.parse(await request.json());
    const result = await actOnPayout(id, action, user, params);
    return NextResponse.json(result);
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const POST=withMonitoring("/api/repasses/[id]/acoes",POSTHandler);
