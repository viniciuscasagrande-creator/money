import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TAX_PARAMETERS_BPS } from "@/lib/accounting-core";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { error } = await authorize(req, ["ADMIN", "FINANCE_DISK"]);
  if (error) return error;
  const view = req.nextUrl.searchParams.get("visao") || "resumo";

  if (view === "contas") {
    const rows = await prisma.accountingAccount.findMany({ orderBy: { code: "asc" }, take: 500 });
    return NextResponse.json({ items: rows });
  }
  if (view === "periodos") {
    const rows = await prisma.accountingPeriod.findMany({ orderBy: { name: "desc" }, take: 100 });
    return NextResponse.json({ items: rows });
  }
  if (view === "regras") {
    const rows = await prisma.accountingRule.findMany({
      orderBy: [{ eventType: "asc" }, { version: "desc" }],
      take: 200
    });
    return NextResponse.json({ items: rows });
  }
  if (view === "eventos") {
    const rows = await prisma.accountingBusinessEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ items: rows.map((r) => ({ ...r, amountCents: r.amountCents.toString() })) });
  }
  if (view === "razao") {
    const rows = await prisma.accountingJournal.findMany({
      orderBy: { occurredAt: "desc" },
      take: 100,
      include: { postings: { include: { account: { select: { code: true, name: true } } } } }
    });
    return NextResponse.json({
      items: rows.map((r) => ({
        ...r,
        postings: r.postings.map((x) => ({
          ...x,
          debitCents: x.debitCents.toString(),
          creditCents: x.creditCents.toString()
        }))
      }))
    });
  }
  if (view === "balancete") {
    const period = req.nextUrl.searchParams.get("periodo");
    if (!period || !/^[0-9]{4}-[0-9]{2}$/.test(period)) return fail("Informe periodo AAAA-MM.");
    const rows = await prisma.accountingPosting.findMany({
      where: { journal: { period: { name: period } } },
      include: { account: { select: { code: true, name: true, type: true } } },
      take: 10000
    });
    if (rows.length === 10000) return fail("Limite de partidas alcançado: filtre ou exporte por lotes.", 413);
    const totals = new Map<string, { code: string; name: string; type: string; debit: bigint; credit: bigint }>();
    for (const r of rows) {
      let x = totals.get(r.accountId);
      if (!x) {
        x = { ...r.account, debit: 0n, credit: 0n };
        totals.set(r.accountId, x);
      }
      x.debit += r.debitCents;
      x.credit += r.creditCents;
    }
    const totalDebits = [...totals.values()].reduce((a, b) => a + b.debit, 0n);
    const totalCredits = [...totals.values()].reduce((a, b) => a + b.credit, 0n);
    return NextResponse.json({
      items: [...totals.values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((x) => ({
          ...x,
          debitCents: x.debit.toString(),
          creditCents: x.credit.toString(),
          saldoDevedorCents: (x.debit - x.credit).toString(),
          debit: undefined,
          credit: undefined
        })),
      totalDebitsCents: totalDebits.toString(),
      totalCreditsCents: totalCredits.toString(),
      balanced: totalDebits === totalCredits
    });
  }
  if (view === "dre") {
    const rows = await prisma.accountingPosting.findMany({
      include: { account: { select: { code: true, name: true, type: true } } },
      take: 10000
    });
    let receitaBruta = 0n;
    let deducoes = 0n;
    let despesas = 0n;
    for (const r of rows) {
      if (r.account.code.startsWith("3.1") || r.account.code.startsWith("3.3") || r.account.type === "REVENUE") {
        if (r.account.code.startsWith("3.2") || r.account.type === "DEDUCTION") {
          deducoes += r.debitCents - r.creditCents;
        } else {
          receitaBruta += r.creditCents - r.debitCents;
        }
      } else if (r.account.code.startsWith("3.2") || r.account.type === "DEDUCTION") {
        deducoes += r.debitCents - r.creditCents;
      } else if (r.account.code.startsWith("4.") || r.account.type === "EXPENSE") {
        despesas += r.debitCents - r.creditCents;
      }
    }
    const receitaLiquida = receitaBruta - deducoes;
    const resultado = receitaLiquida - despesas;
    return NextResponse.json({
      items: [
        { linha: "1. Receita Operacional Bruta (Taxas, Comissões, Spread)", valorCents: receitaBruta.toString() },
        { linha: "2. (-) Deduções e Tributos sobre Receita (ISS, PIS, COFINS, Reembolsos)", valorCents: (-deducoes).toString() },
        { linha: "3. (=) Receita Operacional Líquida SOUL", valorCents: receitaLiquida.toString() },
        { linha: "4. (-) Despesas Operacionais e Financeiras (MDR, Antecipação, Quebra)", valorCents: (-despesas).toString() },
        { linha: "5. (=) Resultado Contábil Líquido do Período", valorCents: resultado.toString() }
      ],
      receitaBrutaCents: receitaBruta.toString(),
      deducoesCents: deducoes.toString(),
      receitaLiquidaCents: receitaLiquida.toString(),
      despesasCents: despesas.toString(),
      resultadoCents: resultado.toString()
    });
  }
  if (view === "passivos") {
    const rows = await prisma.accountingPosting.findMany({
      where: { account: { type: "LIABILITY" } },
      include: { account: { select: { code: true, name: true } } },
      take: 10000
    });
    const byEvent = new Map<string, { eventId: string; accountCode: string; accountName: string; credit: bigint; debit: bigint }>();
    for (const r of rows) {
      const key = `${r.eventId || "CONSOLIDADO"}::${r.account.code}`;
      let cur = byEvent.get(key);
      if (!cur) {
        cur = {
          eventId: r.eventId || "CONSOLIDADO",
          accountCode: r.account.code,
          accountName: r.account.name,
          credit: 0n,
          debit: 0n
        };
        byEvent.set(key, cur);
      }
      cur.credit += r.creditCents;
      cur.debit += r.debitCents;
    }
    return NextResponse.json({
      items: [...byEvent.values()].map((x) => ({
        eventId: x.eventId,
        accountCode: x.accountCode,
        accountName: x.accountName,
        creditCents: x.credit.toString(),
        debitCents: x.debit.toString(),
        saldoCredorCents: (x.credit - x.debit).toString()
      }))
    });
  }

  const [accounts, periods, events, journals, taxSetting] = await Promise.all([
    prisma.accountingAccount.count(),
    prisma.accountingPeriod.count(),
    prisma.accountingBusinessEvent.count(),
    prisma.accountingJournal.count(),
    prisma.financeSetting.findUnique({ where: { key: "accounting_tax_bps" } })
  ]);
  let taxRatesBps = DEFAULT_TAX_PARAMETERS_BPS;
  if (taxSetting?.value) {
    try {
      taxRatesBps = JSON.parse(taxSetting.value);
    } catch {
      taxRatesBps = DEFAULT_TAX_PARAMETERS_BPS;
    }
  }
  return NextResponse.json({ accounts, periods, events, journals, taxRatesBps });
}
