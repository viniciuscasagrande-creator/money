"use client";
import { type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { parseBRLToCents } from "@/lib/money";
import { Field } from "@/components/financeiro/shared";
export type GatewayItem = { id: string; name: string; active: boolean };
export type RuleItem = { id: string; gatewayId: string; gatewayName: string; brandId: string; brandName: string;
  installments: number; rateBps: number; fixedCents: string; active: boolean };
export type FeeItem = { id: string; eventId: string; eventName: string; producerName: string; mode: "PERCENT_BPS" | "FIXED_PER_TICKET";
  value: string; extraFixedCents?: string; producerPaysMdr: boolean; active: boolean };
export type Catalog = { gateways: GatewayItem[]; brands: GatewayItem[]; rules: RuleItem[]; fees: FeeItem[];
  events: { id: string; name: string; producerName: string; producerId: string; status: string }[] };
export const inputClass = "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
export function SelectField({ label, value, onChange, children, required = true }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; required?: boolean }) {
  return <Field label={label}><select required={required} className={inputClass} value={value} onChange={e => onChange(e.target.value)}>{children}</select></Field>;
}
export function FormCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</Card>;
}
export function percentToBps(s: string): number {
  if (!/^\d{1,3}(?:[,.]\d{1,2})?$/.test(s)) throw new Error("Informe um percentual de 0 a 100 com até duas casas decimais.");
  const normalized = s.replace(",", ".");
  const [whole, decimal=""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number((decimal + "00").slice(0,2));
  if (bps > 10000) throw new Error("O percentual não pode superar 100%.");
  return bps;
}
export function nonnegativeBRLInput(s: string): string {
  if (/^0+(?:,0{1,2})?$/.test(s.trim())) return "0";
  return parseBRLToCents(s);
}
export const bpsToPercent = (bps: number) => `${Math.floor(bps/100)},${String(bps%100).padStart(2,"0")}%`;
