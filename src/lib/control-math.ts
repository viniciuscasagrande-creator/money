/** Regras puras e testáveis, todos os valores monetários são centavos bigint. */
export function adjustedAvailability(input: {
  total: bigint; settled: bigint; committed: bigint; openExposure: bigint; confirmedExposure: bigint
}) {
  const settledRight = input.settled - input.confirmedExposure;
  const totalRight = input.total - input.confirmedExposure;
  const unavailable = input.committed + input.openExposure;
  return {
    totalCents: totalRight > 0n ? totalRight : 0n,
    settledCents: settledRight > 0n ? settledRight : 0n,
    committedCents: input.committed,
    blockedCents: input.openExposure,
    confirmedLossCents: input.confirmedExposure,
    repasseCents: settledRight > unavailable ? settledRight - unavailable : 0n,
    antecipacaoCents: totalRight > unavailable ? totalRight - unavailable : 0n
  };
}
export function ledgerMatchesStatement(ledger: {bankAccountId:string; direction:string; amountCents:bigint}, line: {
  bankAccountId:string; direction:string; amountCents:bigint
}) { return ledger.bankAccountId === line.bankAccountId && ledger.direction === line.direction && ledger.amountCents === line.amountCents; }
export function accountingAccounts(origin: "OPENING"|"RECEIVABLE"|"PAYABLE"|"PAYOUT", direction: "CREDIT"|"DEBIT") {
  if (origin === "OPENING") return { debit: "Banco", credit: "Saldo de abertura / contrapartida a classificar" };
  if (origin === "RECEIVABLE" && direction === "CREDIT") return { debit: "Banco", credit: "Recebíveis / liquidação a classificar" };
  if (origin === "PAYOUT" && direction === "DEBIT") return { debit: "Obrigações com produtores (revisar)", credit: "Banco" };
  return direction === "DEBIT"
    ? { debit: "Despesas / contrapartida a classificar", credit: "Banco" }
    : { debit: "Banco", credit: "Receitas / contrapartida a classificar" };
}
export function csvCell(value:string) { return '"' + value.replace(/^[\t\r\n ]*[=+@-]/, prefix => "'" + prefix) .replaceAll('"','""') + '"'; }
