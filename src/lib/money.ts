/** Valores monetários sempre em centavos inteiros, sem cálculos de ponto flutuante. */
export function parseCents(input: string): bigint {
  if (!/^\d{1,16}$/.test(input)) throw new Error("Valor em centavos inválido.");
  const cents = BigInt(input);
  if (cents <= 0n || cents > 9999999999999999n) throw new Error("Valor deve ser maior que zero.");
  return cents;
}

export function parseBRLToCents(input: string): string {
  const clean = input.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(clean)) throw new Error("Informe um valor como 150,00.");
  const normalized = clean.replace(/\./g, "");
  const [whole, decimals = ""] = normalized.split(",");
  const cents = BigInt(whole) * 100n + BigInt((decimals + "00").slice(0, 2));
  if (cents <= 0n || cents > 9999999999999999n) throw new Error("Valor fora do limite permitido.");
  return cents.toString();
}

export function fmtBRL(cents: string | bigint | number): string {
  const value = BigInt(cents);
  const sign = value < 0n ? "−" : "";
  const absolute = value < 0n ? -value : value;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}R$ ${whole},${(absolute % 100n).toString().padStart(2, "0")}`;
}
