import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { authorize, fail, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";

function verifyApiKey(provided: string | null): boolean {
  const configured = (process.env.EXTERNAL_TICKETING_API_KEY || "").trim();
  if (!configured || !provided) return false;
  const bufA = Buffer.from(configured);
  const bufB = Buffer.from(provided.trim());
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
  if (auth.error) return auth.error;

  const configuredKey = (process.env.EXTERNAL_TICKETING_API_KEY || "").trim();
  const maskedKey =
    configuredKey.length > 12
      ? `${configuredKey.slice(0, 8)}••••••••••••••••••••••••••${configuredKey.slice(-6)}`
      : null;

  const [producersCount, eventsCount, receivablesCount] = await Promise.all([
    prisma.producer.count(),
    prisma.event.count(),
    prisma.financialTitle.count({ where: { kind: "RECEIVABLE" } }),
  ]);

  return NextResponse.json({
    configured: configuredKey.length > 0,
    maskedKey,
    keyLength: configuredKey.length,
    stats: {
      producersCount,
      eventsCount,
      receivablesCount,
    },
  });
}

export async function POST(request: NextRequest) {
  const headerKey = request.headers.get("x-api-key");
  const isWebhookKeyValid = verifyApiKey(headerKey);

  let actorId: string | null = null;

  if (!isWebhookKeyValid) {
    const auth = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
    if (auth.error) return auth.error;
    if (!isInternal(auth.user.role)) return fail("Acesso negado.", 403);
    actorId = auth.user.id;
  } else {
    const adminUser = await prisma.user.findFirst({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });
    if (!adminUser) {
      return fail("Nenhum administrador ativo para vincular auditoria da API.", 400);
    }
    actorId = adminUser.id;
  }

  const configuredKey = (process.env.EXTERNAL_TICKETING_API_KEY || "").trim();
  if (!configuredKey) {
    return fail("EXTERNAL_TICKETING_API_KEY não configurada no servidor.", 500);
  }

  try {
    const body = await request.json();
    const producerName = String(body.producerName || "").trim();
    const producerDocument = body.producerDocument ? String(body.producerDocument).trim() : null;
    const eventName = String(body.eventName || "").trim();
    const description = String(body.description || "").trim();
    const amountCents = parseCents(body.amountCents);
    const dueDate = body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;

    if (producerName.length < 2 || eventName.length < 2 || description.length < 3) {
      return fail("Informe produtor, evento e descrição válidos para sincronização.", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      let producer = producerDocument
        ? await tx.producer.findUnique({ where: { document: producerDocument } })
        : await tx.producer.findFirst({ where: { name: producerName } });

      if (!producer) {
        producer = await tx.producer.create({
          data: {
            name: producerName,
            document: producerDocument,
            active: true,
          },
        });
      }

      let event = await tx.event.findFirst({
        where: { name: eventName, producerId: producer.id },
      });

      if (!event) {
        event = await tx.event.create({
          data: {
            name: eventName,
            producerId: producer.id,
            status: "ACTIVE",
          },
        });
      }

      const title = await tx.financialTitle.create({
        data: {
          kind: "RECEIVABLE",
          status: "OPEN",
          description,
          amountCents,
          dueDate,
          producerId: producer.id,
          eventId: event.id,
          createdById: actorId!,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorId!,
          action: "API_INGRESSOS_SYNC",
          entity: "FinancialTitle",
          entityId: title.id,
          summary: `Recebível sincronizado via API Externa de Ingressos (${event.name} · ${producer.name}).`,
        },
      });

      return { producer, event, titleId: title.id };
    });

    return NextResponse.json({
      ok: true,
      titleId: result.titleId,
      producerName: result.producer.name,
      eventName: result.event.name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^REGRA:/, "") : "Erro na integração de API.";
    return fail(msg, 400);
  }
}
