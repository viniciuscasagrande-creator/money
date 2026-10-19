import { NextRequest, NextResponse } from "next/server";
import { endSession, originAllowed, fail } from "@/lib/auth";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail("Origem não autorizada.", 403);
  await endSession();
  return NextResponse.json({ ok: true });
}
