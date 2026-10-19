"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, FileX2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
export type Title = { id: string; kind: "RECEIVABLE" | "PAYABLE"; description: string; amountCents: string; status: "OPEN" | "SETTLED" | "CANCELED"; createdAt: string; dueDate: string | null; settledAt: string | null; producerName: string; eventName: string; producerId: string | null; eventId: string | null; bankAccountName?: string };
export type Producer = { id: string; name: string; document?: string };
export type Event = { id: string; name: string; producerId: string; producerName: string; status: string };
export type Account = { id: string; name: string; institution: string; balanceCents: string; lastFour: string | null; active: boolean; createdAt: string };
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json" }, ...options });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `A solicitação falhou (${r.status}).`);
  return body as T;
}
export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => { let active = true;
    api<T>(url).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url, revision]);
  function reload() { setLoading(true); setError(""); setRevision(v=>v+1); }
  return { data, error, loading, reload };
}
export function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#e4655b]"><span className="h-1.5 w-1.5 rounded-full bg-[#e4655b]"/>{eyebrow}</p><h1 className="text-[29px] font-bold tracking-[-.05em] text-[#29262b] md:text-[34px]">{title}</h1><p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#8f898e]">{subtitle}</p></div>{action}</div>;
}
export function Loading({ label = "Carregando informações..." }: { label?: string }) { return <div className="flex min-h-[180px] items-center justify-center gap-3 text-sm text-slate-500"><RefreshCw size={17} className="animate-spin"/>{label}</div>; }
export function Empty({ text = "Ainda não existem registros." }: { text?: string }) { return <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-slate-500"><FileX2 size={25} className="text-slate-300"/>{text}</div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div role="alert" className="my-4 flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"><span className="flex items-center gap-2"><AlertCircle size={17}/>{message}</span>{retry && <Button variant="outline" size="sm" onClick={retry}>Tentar novamente</Button>}</div>; }
export function StatusBadge({ status }: { status: Title["status"] }) { const map = { OPEN: ["Em aberto", "amber"], SETTLED: ["Liquidado", "green"], CANCELED: ["Cancelado", "red"] } as const; const item = map[status]; return <Badge tone={item[1]}>{item[0]}</Badge>; }
export function displayDate(iso: string | null) { return iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(iso)) : "—"; }
export function displayDateTime(iso: string | null) { return iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—"; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <div><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</div>; }
