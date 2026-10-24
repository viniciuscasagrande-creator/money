import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch } from "@/lib/validation";
import { validateTiers } from "@/lib/release-policy-math";
import { releaseLimit } from "@/lib/release-policy";

export const runtime = "nodejs";

const input = z
  .object({
    eventId: z.string().min(1),
    capacityTickets: z.number().int().positive().max(10000000),
    active: z.boolean(),
    tiers: z
      .array(
        z
          .object({
            minSoldBps: z.number().int().min(0).max(10000),
            releaseBps: z.number().int().min(0).max(10000)
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict();

async function GETHandler(req: NextRequest) {
  const { user, error } = await authorize(req, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  const items = await prisma.eventReleasePolicy.findMany({
    include: {
      tiers: { orderBy: { minSoldBps: "asc" } },
      event: { select: { name: true, producer: { select: { name: true } } } }
    },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({
    items: await Promise.all(
      items.map(async p => {
        const lim = await releaseLimit(prisma, p.eventId);
        return {
          eventId: p.eventId,
          eventName: p.event.name,
          producerName: p.event.producer.name,
          capacityTickets: p.capacityTickets,
          active: p.active,
          version: p.version,
          tiers: p.tiers.map(t => ({ minSoldBps: t.minSoldBps, releaseBps: t.releaseBps })),
          soldBps: lim?.soldBps ?? 0,
          releaseBps: lim?.releaseBps ?? 0,
          cumulativeCapCents: (lim?.cumulativeCapCents ?? 0n).toString(),
          availableCents: (lim?.availableCents ?? 0n).toString()
        };
      })
    )
  });
}

async function POSTHandler(req: NextRequest) {
  const { user, error } = await authorize(req, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  try {
    const v = input.parse(await req.json());
    validateTiers(v.tiers);
    const r = await prisma.$transaction(async tx => {
      const event = await tx.event.findUnique({ where: { id: v.eventId } });
      if (!event || event.status === "CLOSED") throw new Error("REGRA:Evento indisponível.");
      const old = await tx.eventReleasePolicy.findUnique({ where: { eventId: v.eventId } });
      const policy = await tx.eventReleasePolicy.upsert({
        where: { eventId: v.eventId },
        create: {
          eventId: v.eventId,
          capacityTickets: v.capacityTickets,
          active: v.active,
          updatedById: user.id,
          tiers: { create: v.tiers }
        },
        update: {
          capacityTickets: v.capacityTickets,
          active: v.active,
          updatedById: user.id,
          version: { increment: 1 }
        }
      });
      if (old) {
        await tx.eventReleaseTier.deleteMany({ where: { policyId: policy.id } });
        await tx.eventReleaseTier.createMany({ data: v.tiers.map(t => ({ ...t, policyId: policy.id })) });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          entity: "EventReleasePolicy",
          entityId: policy.id,
          action: "RELEASE_POLICY_UPDATED",
          summary: `Política de faixas definida para ${v.eventId}, versão ${policy.version}.`
        }
      });
      return policy;
    });
    return NextResponse.json({ id: r.id, version: r.version });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
}

export const GET=withMonitoring("/api/financeiro/politicas-liberacao",GETHandler);
export const POST=withMonitoring("/api/financeiro/politicas-liberacao",POSTHandler);
