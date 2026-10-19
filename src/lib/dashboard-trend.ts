/** Agrega liquidações reais por mês, sem interpolação e sem dados de demonstração. */
export type SettledTimelineTitle = {
  kind: "RECEIVABLE" | "PAYABLE";
  amountCents: bigint;
  settledAt: Date | null;
};
export type TimelineMonth = { label: string; receivedCents: string; paidCents: string };

export function sixMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
}

export function buildSixMonthTrend(titles: readonly SettledTimelineTitle[], now: Date): TimelineMonth[] {
  const start = sixMonthStart(now);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""),
      received: 0n,
      paid: 0n
    };
  });
  const byMonth = new Map(months.map(month => [month.key, month]));
  for (const title of titles) {
    if (!title.settledAt || title.amountCents < 0n) continue;
    const month = byMonth.get(title.settledAt.toISOString().slice(0, 7));
    if (!month) continue;
    if (title.kind === "RECEIVABLE") month.received += title.amountCents;
    else month.paid += title.amountCents;
  }
  return months.map(month => ({ label: month.label, receivedCents: month.received.toString(), paidCents: month.paid.toString() }));
}
