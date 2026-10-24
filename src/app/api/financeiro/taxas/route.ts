import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { nonnegativeCents, ruleError } from "@/lib/operations";
export const runtime = "nodejs";
const schema = z.object({
  eventId: z.string().min(1),
  mode: z.enum(["PERCENT_BPS", "FIXED_PER_TICKET"]),
  value: z.string().regex(/^\d{1,16}$/),
  extraFixedCents: z.string().regex(/^\d{1,16}$/).optional(),
  producerPaysMdr: z.boolean()
}).strict();
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try {
    const input = schema.parse(await request.json());
    const value = nonnegativeCents(input.value);
    const extraFixed = input.extraFixedCents ? nonnegativeCents(input.extraFixedCents) : 0n;
    if (input.mode === "PERCENT_BPS" && value > 10000n) return fail("Taxa percentual não pode exceder 100%.");
    const fee = await prisma.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: input.eventId } });
      if (!event || event.status === "CLOSED") return ruleError("Evento inexistente ou encerrado.");
      const f = await tx.eventFeePolicy.upsert({ where: { eventId: input.eventId },
        create: { eventId: input.eventId, mode: input.mode, value, producerPaysMdr: input.producerPaysMdr },
        update: { mode: input.mode, value, producerPaysMdr: input.producerPaysMdr, active: true } });
      const settingKey = `fee_fixed_extra:${input.eventId}`;
      await tx.financeSetting.upsert({
        where: { key: settingKey },
        create: { key: settingKey, value: (input.mode === "PERCENT_BPS" ? extraFixed : 0n).toString() },
        update: { value: (input.mode === "PERCENT_BPS" ? extraFixed : 0n).toString() }
      });
      await tx.auditLog.create({ data: { actorId: user.id, action: "EVENT_FEE_SAVED", entity: "EventFeePolicy", entityId: f.id,
        summary: "Taxa da Disk configurada por evento. Informação confidencial, restrita ao Financeiro Interno." } });
      return f;
    });
    return NextResponse.json({ id: fee.id });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const POST=withMonitoring("/api/financeiro/taxas",POSTHandler);
