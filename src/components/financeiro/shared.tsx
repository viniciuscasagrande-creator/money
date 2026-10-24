"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, FileX2, Grid2X2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
export type Title = { id: string; kind: "RECEIVABLE" | "PAYABLE"; description: string; amountCents: string; status: "OPEN" | "SETTLED" | "CANCELED"; createdAt: string; dueDate: string | null; settledAt: string | null; producerName: string; eventName: string; producerId: string | null; eventId: string | null; bankAccountName?: string };
export type Producer = { id: string; name: string; document?: string };
export type Event = { id: string; name: string; producerId: string; producerName: string; status: string };
export type Account = { id: string; name: string; institution: string; balanceCents: string; lastFour: string | null; active: boolean; createdAt: string };
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json" }, ...options });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const requestId=r.headers.get("X-Request-ID");
    const reference=r.status>=500&&requestId&&/^[a-f0-9-]{36}$/i.test(requestId)?` Referência: ${requestId}.`:"";
    throw new Error((body.error || `A solicitação falhou (${r.status}).`)+reference);
  }
  return body as T;
}
export function useApi<T>(url: string) {
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{url:string;revision:number;data:T|null;error:string;loading:boolean}>({url,revision:0,data:null,error:"",loading:Boolean(url)});
  useEffect(() => {
    if (!url) {
      setState({url:"",revision,data:null,error:"",loading:false});
      return;
    }
    const controller=new AbortController();
    setState({url,revision,data:null,error:"",loading:true});
    api<T>(url,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({url,revision,data,error:"",loading:false});}).catch(e=>{if(!controller.signal.aborted)setState({url,revision,data:null,error:e instanceof Error?e.message:"Falha na consulta.",loading:false});});
    return () => controller.abort();
  }, [url, revision]);
  const reload=useCallback(()=>setRevision(v=>v+1),[]);
  const current=state.url===url&&state.revision===revision;
  return {data:current?state.data:null,error:current?state.error:"",loading:Boolean(url)&&(!current||state.loading),reload};
}
export function PageHeading({ eyebrow, title, subtitle, action, hideBackLinks = false }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode; hideBackLinks?: boolean }) {
  return (
    <div className="mb-7 space-y-3">
      {!hideBackLinks && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e7e2e0] bg-white px-3 py-1.5 text-xs font-semibold text-[#3f3c42] shadow-sm transition hover:border-[#e3574f] hover:bg-[#fff8f6] hover:text-[#c94e46]"
          >
            <ArrowLeft size={14} />
            <span>Voltar ao menu</span>
          </Link>
          <Link
            href="/modulos"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#ece8e6] bg-[#faf8f7] px-3 py-1.5 text-xs font-medium text-[#6f6a6e] transition hover:bg-[#f2eeec] hover:text-[#29262b]"
          >
            <Grid2X2 size={13} />
            <span>Central de módulos</span>
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.17em] text-[#e4655b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e4655b]" />
            {eyebrow}
          </p>
          <h1 className="text-[29px] font-bold tracking-[-.05em] text-[#29262b] md:text-[34px]">{title}</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#8f898e]">{subtitle}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
export function Loading({ label = "Carregando informações..." }: { label?: string }) { return <div className="flex min-h-[180px] items-center justify-center gap-3 text-sm text-slate-500"><RefreshCw size={17} className="animate-spin"/>{label}</div>; }
export function Empty({ text = "Ainda não existem registros." }: { text?: string }) { return <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-slate-500"><FileX2 size={25} className="text-slate-300"/>{text}</div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div role="alert" className="my-4 flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"><span className="flex items-center gap-2"><AlertCircle size={17}/>{message}</span>{retry && <Button variant="outline" size="sm" onClick={retry}>Tentar novamente</Button>}</div>; }
export function StatusBadge({ status }: { status: Title["status"] }) { const map = { OPEN: ["Em aberto", "amber"], SETTLED: ["Liquidado", "green"], CANCELED: ["Cancelado", "red"] } as const; const item = map[status]; return <Badge tone={item[1]}>{item[0]}</Badge>; }
export function displayDate(iso: string | null) { return iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(iso)) : "—"; }
export function displayDateTime(iso: string | null) { return iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—"; }
export function Field({ label, children }: { label: string; children: ReactNode }) { return <div><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</div>; }
