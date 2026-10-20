import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { authorize, fail, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCents } from "@/lib/money";
import { extendedSaleBreakdown } from "@/lib/split-calculation";
import { loadEventFeeExtension } from "@/lib/payout-locks";
import { emitAccountingBusinessEvent } from "@/lib/accounting-integration";

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
  const keyFingerprint = configuredKey
    ? `sha256:${createHash("sha256").update(configuredKey).digest("hex").slice(0, 16)}`
    : null;

  const [producersCount, eventsCount, receivablesCount, salesCount] = await Promise.all([
    prisma.producer.count(),
    prisma.event.count(),
    prisma.financialTitle.count({ where: { kind: "RECEIVABLE" } }),
    prisma.financialSale.count()
  ]);

  return NextResponse.json({
    configured: configuredKey.length > 0,
    maskedKey: keyFingerprint,
    keyFingerprint,
    keyLength: configuredKey.length,
    stats: {
      producersCount,
      eventsCount,
      receivablesCount,
      salesCount
    }
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
      select: { id: true }
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
    const quantity = body.quantity ? Math.max(1, Number(body.quantity)) : 1;
    const dueDate = body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;
    const rawExtRef = String(
      body.externalReference || request.headers.get("idempotency-key") || ""
    ).trim();
    const externalReference =
      rawExtRef ||
      `ING-${createHash("sha256")
        .update(`${producerName}|${eventName}|${description}|${amountCents.toString()}|${body.dueDate || ""}`)
        .digest("hex")
        .slice(0, 20)
        .toUpperCase()}`;

    if (producerName.length < 2 || eventName.length < 2 || description.length < 3) {
      return fail("Informe produtor, evento e descrição válidos para sincronização.", 400);
    }

    const result = await prisma.$transaction(
      async tx => {
        // Idempotência 1: verifica se já existe FinancialSale com esta referência externa
        const existingSale = await tx.financialSale.findUnique({
          where: { externalReference },
          include: { producer: { select: { name: true } }, event: { select: { name: true } } }
        });
        if (existingSale) {
          return {
            idempotent: true,
            titleId: existingSale.receivableTitleId,
            saleId: existingSale.id,
            producerName: existingSale.producer.name,
            eventName: existingSale.event.name
          };
        }

        const taggedDescription = `[REF:${externalReference}] ${description}`;
        // Idempotência 2: verifica se já existe FinancialTitle sincronizado com esta referência
        const existingTitle = await tx.financialTitle.findFirst({
          where: { description: taggedDescription, kind: "RECEIVABLE" },
          include: { producer: { select: { name: true } }, event: { select: { name: true } } }
        });
        if (existingTitle) {
          return {
            idempotent: true,
            titleId: existingTitle.id,
            saleId: null,
            producerName: existingTitle.producer?.name ?? producerName,
            eventName: existingTitle.event?.name ?? eventName
          };
        }

        let producer = producerDocument
          ? await tx.producer.findUnique({ where: { document: producerDocument } })
          : await tx.producer.findFirst({ where: { name: producerName } });

        if (!producer) {
          producer = await tx.producer.create({
            data: {
              name: producerName,
              document: producerDocument,
              active: true
            }
          });
        }

        let event = await tx.event.findFirst({
          where: { name: eventName, producerId: producer.id }
        });

        if (!event) {
          event = await tx.event.create({
            data: {
              name: eventName,
              producerId: producer.id,
              status: "ACTIVE"
            }
          });
        }

        const [feePolicy, mdrRule, extraFixedSetting, feeExt] = await Promise.all([
          tx.eventFeePolicy.findUnique({ where: { eventId: event.id } }),
          body.mdrRuleId
            ? tx.mdrRule.findUnique({ where: { id: String(body.mdrRuleId) }, include: { gateway: true, brand: true } })
            : tx.mdrRule.findFirst({
                where: { active: true, gateway: { active: true }, brand: { active: true } },
                include: { gateway: true, brand: true },
                orderBy: { installments: "asc" }
              }),
          tx.financeSetting.findUnique({ where: { key: `fee_fixed_extra:${event.id}` } }),
          loadEventFeeExtension(tx, event.id)
        ]);

        // Se o evento possui política de taxa ativa e há regra MDR válida, gera FinancialSale + Split + Evento Contábil
        if (feePolicy?.active && mdrRule?.active && mdrRule.gateway.active && mdrRule.brand.active) {
          const unitPriceCents = amountCents / BigInt(quantity);
          const extraFixedCents =
            extraFixedSetting?.value && /^\d+$/.test(extraFixedSetting.value) ? BigInt(extraFixedSetting.value) : 0n;
          const parts = extendedSaleBreakdown({
            unitPriceCents,
            quantity,
            feeMode: feePolicy.mode,
            feeValue: feePolicy.value,
            feeExtraFixedCents: extraFixedCents,
            mdrRateBps: mdrRule.rateBps,
            mdrFixedCents: mdrRule.fixedCents,
            producerPaysMdr: feePolicy.producerPaysMdr,
            channel: feeExt.channel,
            installments: mdrRule.installments,
            installmentInterestBps: feeExt.installmentInterestBps,
            costBearer: feeExt.costBearer,
            spreadBps: feeExt.spreadBps,
            advancedBps: feeExt.advancedBps,
            rebateBps: feeExt.rebateBps
          });
          const title = await tx.financialTitle.create({
            data: {
              kind: "RECEIVABLE",
              status: "OPEN",
              description: taggedDescription,
              amountCents: parts.netSettlement,
              dueDate,
              producerId: producer.id,
              eventId: event.id,
              createdById: actorId!
            }
          });
          const sale = await tx.financialSale.create({
            data: {
              externalReference,
              producerId: producer.id,
              eventId: event.id,
              gatewayId: mdrRule.gatewayId,
              brandId: mdrRule.brandId,
              mdrRuleId: mdrRule.id,
              feePolicyId: feePolicy.id,
              quantity,
              unitPriceCents,
              grossCents: parts.gross,
              feeModeAtSale: feePolicy.mode,
              feeValueAtSale: feePolicy.value,
              producerPaysMdrAtSale: feePolicy.producerPaysMdr,
              mdrRateBpsAtSale: mdrRule.rateBps,
              mdrFixedCentsAtSale: mdrRule.fixedCents,
              feeCents: parts.fee,
              mdrCents: parts.mdr,
              netSettlementCents: parts.netSettlement,
              producerNetCents: parts.producerNet,
              diskNetCents: parts.diskNet,
              receivableTitleId: title.id,
              createdById: actorId!
            }
          });
          await emitAccountingBusinessEvent(
            {
              externalKey: `sale:${sale.id}`,
              type: "TICKET_SALE_CAPTURED",
              source: feeExt.channel === "BILHETERIA" ? "BOX_OFFICE" : feeExt.channel,
              sourceId: sale.id,
              eventId: event.id,
              producerId: producer.id,
              amountCents: parts.gross,
              payload: parts.memory
            },
            tx
          );
          await tx.auditLog.create({
            data: {
              actorId: actorId!,
              action: "API_INGRESSOS_SALE_SYNC",
              entity: "FinancialSale",
              entityId: sale.id,
              summary: `Venda e recebível sincronizados via API Externa de Ingressos (${event.name} · ref ${externalReference}).`
            }
          });
          return {
            idempotent: false,
            titleId: title.id,
            saleId: sale.id,
            producerName: producer.name,
            eventName: event.name
          };
        }

        const title = await tx.financialTitle.create({
          data: {
            kind: "RECEIVABLE",
            status: "OPEN",
            description: taggedDescription,
            amountCents,
            dueDate,
            producerId: producer.id,
            eventId: event.id,
            createdById: actorId!
          }
        });

        await tx.auditLog.create({
          data: {
            actorId: actorId!,
            action: "API_INGRESSOS_SYNC",
            entity: "FinancialTitle",
            entityId: title.id,
            summary: `Recebível avulso sincronizado via API Externa de Ingressos (${event.name} · ref ${externalReference}).`
          }
        });

        return {
          idempotent: false,
          titleId: title.id,
          saleId: null,
          producerName: producer.name,
          eventName: event.name
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      externalReference,
      titleId: result.titleId,
      saleId: result.saleId,
      producerName: result.producerName,
      eventName: result.eventName
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^REGRA:/, "") : "Erro na integração de API.";
    return fail(msg, 400);
  }
}
