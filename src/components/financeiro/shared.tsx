"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, FileX2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type Title = {
  id: string;
  kind: "RECEIVABLE" | "PAYABLE";
  description: string;
  amountCents: string;
  status: "OPEN" | "SETTLED" | "CANCELED";
  createdAt: string;
  dueDate: string | null;
  settledAt: string | null;
  producerName: string;
  eventName: string;
  producerId: string | null;
  eventId: string | null;
  bankAccountName?: string;
};
export type Producer = { id: string; name: string; document?: string };
export type Event = { id: string; name: string; producerId: string; producerName: string; status: string };
export type Account = {
  id: string;
  name: string;
  institution: string;
  balanceCents: string;
  lastFour: string | null;
  active: boolean;
  createdAt: string;
};

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `A solicitação falhou (${r.status}).`);
  return body as T;
}

export function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<T>(url)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  function reload() {
    setLoading(true);
    setError("");
    setRevision((v) => v + 1);
  }
  return { data, error, loading, reload };
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[#BBBFC5]/45 pb-5">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#0F1113] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
          <span className="h-2 w-2 rounded-full bg-[#E03629]" />
          {eyebrow}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-[#0F1113] md:text-[33px]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-[#47505A]">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function Loading({ label = "Carregando informações..." }: { label?: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center gap-3 text-sm font-medium text-[#47505A]">
      <RefreshCw size={17} className="animate-spin text-[#E03629]" />
      {label}
    </div>
  );
}

export function Empty({ text = "Ainda não existem registros." }: { text?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-[#47505A]">
      <div className="rounded-2xl bg-[#EBEBED] p-3.5 text-[#47505A]">
        <FileX2 size={24} />
      </div>
      {text}
    </div>
  );
}

export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="my-4 flex items-center justify-between gap-3 rounded-2xl border border-[#E03629]/30 bg-[#E03629]/10 p-4 text-sm font-medium text-[#0F1113]"
    >
      <span className="flex items-center gap-2.5">
        <AlertCircle size={18} className="shrink-0 text-[#E03629]" />
        {message}
      </span>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: Title["status"] }) {
  const map = {
    OPEN: ["Em aberto", "amber"],
    SETTLED: ["Liquidado", "green"],
    CANCELED: ["Cancelado", "red"],
  } as const;
  const item = map[status];
  return <Badge tone={item[1]}>{item[0]}</Badge>;
}

export function displayDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(iso)) : "—";
}

export function displayDateTime(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso))
    : "—";
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#47505A]">
        {label}
      </span>
      {children}
    </div>
  );
}
