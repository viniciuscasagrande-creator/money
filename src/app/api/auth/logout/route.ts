import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { endSession, originAllowed, fail } from "@/lib/auth";
export const runtime = "nodejs";
async function POSTHandler(request: NextRequest) {
  if (!originAllowed(request)) return fail("Origem não autorizada.", 403);
  await endSession();
  return NextResponse.json({ ok: true });
}

export const POST=withMonitoring("/api/auth/logout",POSTHandler);
