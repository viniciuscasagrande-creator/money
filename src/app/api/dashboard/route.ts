import { NextRequest, NextResponse } from "next/server";
import { authorize, isInternal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { titleWhereFor, titleDTO, titleInclude } from "@/lib/finance";
import { eventAvailability } from "@/lib/operations";
import { buildSixMonthTrend, sixMonthStart } from "@/lib/dashboard-trend";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const { user, error } = await authorize(request); if (error || !user) return error!;
  const where = titleWhereFor(user);
  // Agregação temporal com valores efetivamente liquidados, sem dados simulados.
  const currentDate = new Date();
  const monthStart = sixMonthStart(currentDate);
  const [accounts, pendingIn, pendingOut, settledIn, settledOut, latest, events, timelineTitles] = await Promise.all([
    isInternal(user.role) ? prisma.bankAccount.aggregate({ _sum: { balanceCents: true }, _count: true, where: { active: true } }) : null,
    prisma.financialTitle.aggregate({ _sum: { amountCents: true }, _count: true, where: { ...where, kind: "RECEIVABLE", status: "OPEN" } }),
    prisma.financialTitle.aggregate({ _sum: { amountCents: true }, _count: true, where: { ...where, kind: "PAYABLE", status: "OPEN" } }),
    prisma.financialTitle.aggregate({ _sum: { amountCents: true }, _count: true, where: { ...where, kind: "RECEIVABLE", status: "SETTLED" } }),
    prisma.financialTitle.aggregate({ _sum: { amountCents: true }, _count: true, where: { ...where, kind: "PAYABLE", status: "SETTLED" } }),
    prisma.financialTitle.findMany({ where, include: titleInclude, take: 8, orderBy: { createdAt: "desc" } }),
    prisma.event.count({ where: user.role === "PRODUCER" ? { producerId: user.producerId! } : {} }),
    prisma.financialTitle.findMany({
      where: { ...where, status: "SETTLED", settledAt: { gte: monthStart } },
      select: { kind: true, amountCents: true, settledAt: true }
    })
  ]);
  const eventPositions = user.role === "PRODUCER"
    ? await prisma.event.findMany({ where: { producerId: user.producerId! }, select: { id: true } })
    : [];
  const positions = await Promise.all(eventPositions.map(e => eventAvailability(prisma, e.id)));
  const sum = (key: "totalCents" | "settledCents" | "committedCents" | "repasseCents") =>
    positions.reduce((value, item) => value + item[key], 0n).toString();
  return NextResponse.json({
    trend: buildSixMonthTrend(timelineTitles, currentDate),
    metrics: {
      saldoBancarioCents: accounts?._sum.balanceCents?.toString() ?? null,
      contasBancarias: accounts?._count ?? null,
      receberPendenteCents: (pendingIn._sum.amountCents ?? 0n).toString(),
      pagarPendenteCents: (pendingOut._sum.amountCents ?? 0n).toString(),
      recebimentosLiquidadosCents: (settledIn._sum.amountCents ?? 0n).toString(),
      pagamentosLiquidadosCents: (settledOut._sum.amountCents ?? 0n).toString(),
      eventos: events, titulosEmAberto: pendingIn._count + pendingOut._count,
      ...(user.role === "PRODUCER" ? { direitosProdutorCents: sum("totalCents"),
        recebidoProdutorCents: sum("settledCents"), comprometidoProdutorCents: sum("committedCents"),
        repasseDisponivelCents: sum("repasseCents") } : {})
    },
    latest: latest.map(t => titleDTO(t, isInternal(user.role))),
    informationalOnly: user.role === "PRODUCER"
  });
}
