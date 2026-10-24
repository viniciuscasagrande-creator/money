import {withMonitoring} from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPayout, eventAvailability, eventAvailabilityDTO, payoutDTO } from "@/lib/operations";
import { apiCatch } from "@/lib/validation";
import {listPayouts} from "@/lib/operational-lists";
import { releaseLimit } from "@/lib/release-policy";
export const runtime = "nodejs";
const schema = z.object({ eventId: z.string().min(1), type: z.enum(["REPASSE", "ANTECIPACAO"]),
  amountCents: z.string().regex(/^\d{1,16}$/) }).strict();
async function GETHandler(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  try {
  const internal = isInternal(user.role);
  if(request.nextUrl.searchParams.get("somenteLista")==="1")return NextResponse.json({...await listPayouts(prisma,user,request.nextUrl.searchParams),role:user.role},{headers:{"Cache-Control":"no-store, private"}});
  const [listing, events] = await Promise.all([
    listPayouts(prisma,user,request.nextUrl.searchParams),
    prisma.event.findMany({ where: internal ? {} : { producerId: user.producerId! },
      orderBy: { name: "asc" }, select: { id: true, name: true, producerId: true, producer: { select: { name: true } } } })
  ]);
  const balances = await Promise.all(events.map(async e => {
    const availability = await eventAvailability(prisma, e.id);
    const policy = await releaseLimit(prisma, e.id, availability);
    return {
      ...eventAvailabilityDTO(e.id, e.name, availability),
      producerId: e.producerId,
      producerName: e.producer.name,
      repasseCents: (policy?.availableCents ?? availability.repasseCents).toString()
    };
  }));
  return NextResponse.json({ ...listing, events: balances, role: user.role },{headers:{"Cache-Control":"no-store, private"}});
  }catch(e){const x=apiCatch(e);return fail(x.message,x.status);}
}
async function POSTHandler(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  try { const input = schema.parse(await request.json()); const payout = await createPayout(input, user);
    return NextResponse.json({ id: payout.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}

export const GET=withMonitoring("/api/repasses",GETHandler);
export const POST=withMonitoring("/api/repasses",POSTHandler);
