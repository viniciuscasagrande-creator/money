import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export type BankBalanceCheck = {
  bankAccountId: string;
  bankAccountName: string;
  recordedBalanceCents: string;
  ledgerComputedCents: string;
  divergenceCents: string;
  consistent: boolean;
};

export type SaleTitleCheck = {
  saleId: string;
  externalReference: string;
  titleId: string;
  saleStatus: string;
  titleStatus: string;
  saleNetSettlementCents: string;
  titleAmountCents: string;
  consistent: boolean;
  reason: string | null;
};

export type IntegrationIncidentRecord = {
  id: string;
  provider: string;
  externalReference: string | null;
  reason: string;
  occurredAt: string;
  resolved: boolean;
};

export async function recordIntegrationIncident(
  db: Db,
  input: { provider: string; externalReference?: string | null; reason: string; actorId?: string | null }
) {
  const id = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  const key = `incident_integration:${id}`;
  const record: IntegrationIncidentRecord = {
    id,
    provider: input.provider,
    externalReference: input.externalReference ?? null,
    reason: input.reason,
    occurredAt: new Date().toISOString(),
    resolved: false
  };
  await db.financeSetting.create({
    data: {
      key,
      value: JSON.stringify(record),
      changedById: input.actorId ?? null
    }
  });
  return record;
}

export async function checkOperationalHealth(db: Db) {
  const [accounts, entries, sales, businessEvents, journals, incidentSettings] = await Promise.all([
    db.bankAccount.findMany({ orderBy: { name: "asc" } }),
    db.ledgerEntry.groupBy({
      by: ["bankAccountId", "direction"],
      _sum: { amountCents: true }
    }),
    db.financialSale.findMany({
      include: {
        receivableTitle: {
          select: { id: true, status: true, amountCents: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 500
    }),
    db.accountingBusinessEvent.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amountCents: true }
    }),
    db.accountingJournal.findMany({
      include: { postings: { select: { debitCents: true, creditCents: true } } },
      orderBy: { createdAt: "desc" },
      take: 500
    }),
    db.financeSetting.findMany({
      where: { key: { startsWith: "incident_integration:" } },
      orderBy: { updatedAt: "desc" },
      take: 100
    })
  ]);

  const bankChecks: BankBalanceCheck[] = accounts.map((acc) => {
    const credits =
      entries.find((e) => e.bankAccountId === acc.id && e.direction === "CREDIT")?._sum.amountCents ?? 0n;
    const debits =
      entries.find((e) => e.bankAccountId === acc.id && e.direction === "DEBIT")?._sum.amountCents ?? 0n;
    const computed = credits - debits;
    const diff = acc.balanceCents - computed;
    return {
      bankAccountId: acc.id,
      bankAccountName: acc.name,
      recordedBalanceCents: acc.balanceCents.toString(),
      ledgerComputedCents: computed.toString(),
      divergenceCents: diff.toString(),
      consistent: diff === 0n
    };
  });

  const saleTitleChecks: SaleTitleCheck[] = sales.map((s) => {
    const title = s.receivableTitle;
    const statusMatch =
      (s.status === "SETTLED" && title.status === "SETTLED") ||
      (s.status === "AWAITING_SETTLEMENT" && title.status !== "SETTLED");
    const amountMatch = s.netSettlementCents === title.amountCents;
    const consistent = statusMatch && amountMatch;
    let reason: string | null = null;
    if (!statusMatch) reason = `Status divergente (Venda=${s.status}, Título=${title.status})`;
    else if (!amountMatch) reason = `Valor líquido divergente (Venda=${s.netSettlementCents}, Título=${title.amountCents})`;
    return {
      saleId: s.id,
      externalReference: s.externalReference,
      titleId: title.id,
      saleStatus: s.status,
      titleStatus: title.status,
      saleNetSettlementCents: s.netSettlementCents.toString(),
      titleAmountCents: title.amountCents.toString(),
      consistent,
      reason
    };
  });

  const unbalancedJournals = journals.filter((j) => {
    const debit = j.postings.reduce((acc, p) => acc + p.debitCents, 0n);
    const credit = j.postings.reduce((acc, p) => acc + p.creditCents, 0n);
    return debit !== credit || debit <= 0n;
  });

  const pendingEvt = businessEvents.find((b) => b.status === "PENDING");
  const postedEvt = businessEvents.find((b) => b.status === "POSTED");
  const errorEvt = businessEvents.find((b) => b.status === "ERROR");

  const incidents: IntegrationIncidentRecord[] = [];
  for (const row of incidentSettings) {
    try {
      incidents.push(JSON.parse(row.value) as IntegrationIncidentRecord);
    } catch {
      // ignora registro malformado
    }
  }

  const bankDivergences = bankChecks.filter((b) => !b.consistent);
  const saleTitleDivergences = saleTitleChecks.filter((s) => !s.consistent);
  const unresolvedIncidents = incidents.filter((i) => !i.resolved);

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      healthy:
        bankDivergences.length === 0 &&
        saleTitleDivergences.length === 0 &&
        unbalancedJournals.length === 0 &&
        (errorEvt?._count._all ?? 0) === 0 &&
        unresolvedIncidents.length === 0,
      bankAccountsChecked: bankChecks.length,
      bankDivergencesCount: bankDivergences.length,
      salesChecked: saleTitleChecks.length,
      saleTitleDivergencesCount: saleTitleDivergences.length,
      unbalancedJournalsCount: unbalancedJournals.length,
      pendingAccountingEventsCount: pendingEvt?._count._all ?? 0,
      postedAccountingEventsCount: postedEvt?._count._all ?? 0,
      errorAccountingEventsCount: errorEvt?._count._all ?? 0,
      unresolvedIntegrationIncidentsCount: unresolvedIncidents.length
    },
    bankChecks,
    bankDivergences,
    saleTitleDivergences,
    unbalancedJournals: unbalancedJournals.map((j) => ({ id: j.id, businessEventId: j.businessEventId })),
    integrationIncidents: incidents
  };
}
