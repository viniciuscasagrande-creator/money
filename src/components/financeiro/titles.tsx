"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, CheckCircle2, ReceiptText, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListSearch } from "@/components/financeiro/list-search";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RecordDetailModal, DetailsButton } from "@/components/financeiro/record-detail-modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, Empty, ErrorNotice, Field, Loading, PageHeading, StatusBadge, displayDate, useApi, type Account, type Event, type Producer, type Title } from "@/components/financeiro/shared";
import { fmtBRL, parseBRLToCents } from "@/lib/money";

type TitleList={items:Title[];count:number;page:number;size:number;pages:number;summary:{total:number;open:number;settled:number;canceled:number;openCents:string;settledCents:string}};

type Kind = "RECEIVABLE" | "PAYABLE";
type Props = { kind: Kind; role: "ADMIN" | "FINANCE_DISK" | "PRODUCER" };

export function TitlesPage({ kind, role }: Props) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "SETTLED" | "CANCELED">("ALL");
  const internal = role !== "PRODUCER";
  const endpoint = kind === "RECEIVABLE" ? "/api/recebimentos" : "/api/pagamentos";
  const [page,setPage]=useState(1),[search,setSearch]=useState("");
  useEffect(()=>{if(query.trim()===search)return;const timer=setTimeout(()=>{setSearch(query.trim());setPage(1);},300);return()=>clearTimeout(timer);},[query,search]);
  const params=new URLSearchParams({pagina:String(page),limite:"25",q:search,status:statusFilter});
  const {data,error,loading,reload}=useApi<TitleList>(`${endpoint}?${params}`);
  const searching=query.trim()!==search;
  useEffect(()=>{if(data&&page>data.pages)setPage(data.pages);},[data,page]);
  const [referenceLoading,setReferenceLoading]=useState(false);
  const [producers, setProducers] = useState<Producer[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]);
  const [formOpen, setFormOpen] = useState(false),
    [settle, setSettle] = useState<Title | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [dueDate, setDueDate] = useState(""),
    [producerId, setProducerId] = useState(""),
    [eventId, setEventId] = useState(""),
    [accountId, setAccountId] = useState("");

  useEffect(()=>{
    if(!internal||(!formOpen&&!settle))return;
    const controller=new AbortController();setReferenceLoading(true);
    const options={signal:controller.signal};
    const load=formOpen?Promise.all([api<{items:Producer[]}>("/api/admin/produtores",options),api<{items:Event[]}>("/api/admin/eventos",options)]).then(([p,e])=>{if(!controller.signal.aborted){setProducers(p.items);setEvents(e.items);}}):api<{items:Account[]}>("/api/contas?resumo=1",options).then(a=>{if(!controller.signal.aborted)setAccounts(a.items);});
    load.catch(e=>{if(!controller.signal.aborted)setMessage(e instanceof Error?e.message:"Falha ao carregar opções.");}).finally(()=>{if(!controller.signal.aborted)setReferenceLoading(false);});
    return()=>controller.abort();
  },[internal,formOpen,settle]);

  const filteredEvents = useMemo(
    () => (producerId ? events.filter((e) => e.producerId === producerId) : events),
    [events, producerId]
  );

  const items = data?.items ?? [];
  const summary=loading||searching?undefined:data?.summary;
  const openTotalCents=summary?.openCents??"0",settledTotalCents=summary?.settledCents??"0";
  const shown=items;

  const label = kind === "RECEIVABLE" ? "Recebimentos" : "Contas a Pagar";
  const singular = kind === "RECEIVABLE" ? "recebível" : "pagamento";

  function reset() {
    setDescription("");
    setAmount("");
    setDueDate("");
    setProducerId("");
    setEventId("");
    setMessage("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify({
          description,
          amountCents: parseBRLToCents(amount),
          dueDate: dueDate || null,
          producerId: producerId || null,
          eventId: eventId || null,
        }),
      });
      setFormOpen(false);
      reset();
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setBusy(false);
    }
  }

  async function liquidate(e: FormEvent) {
    e.preventDefault();
    if (!settle || !accountId) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/titulos/${settle.id}/liquidar`, {
        method: "POST",
        body: JSON.stringify({ bankAccountId: accountId }),
      });
      setSettle(null);
      setAccountId("");
      reload();
      const updated = await api<{ items: Account[] }>("/api/contas?resumo=1");
      setAccounts(updated.items.filter((x) => x.active));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível liquidar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Operações financeiras"
        title={label}
        subtitle={
          internal
            ? "Cadastre títulos, acompanhe vencimentos e liquide operações em contas bancárias autorizadas com registro imediato no razão."
            : "Consulte títulos associados aos seus eventos. Esta visão não calcula valores disponíveis para repasse."
        }
        action={
          internal ? (
            <Button
              onClick={() => {
                reset();
                setFormOpen(true);
              }}
            >
              <Plus size={17} />
              Novo {singular}
            </Button>
          ) : (
            <Badge tone="blue">Somente consulta</Badge>
          )
        }
      />

      {!internal && (
        <div className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <CircleAlert className="mr-2 inline" size={17} />
          Os registros exibidos não constituem um saldo de repasse confirmado.
        </div>
      )}

      {message && <ErrorNotice message={message} />}
      {error && <ErrorNotice message={error} retry={reload} />}

      {/* Indicadores próprios do módulo de Recebimentos / Pagamentos */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {kind === "RECEIVABLE" ? "A receber em aberto" : "A pagar em aberto"}
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-800">{!summary||loading||searching?"—":fmtBRL(openTotalCents)}</p>
          <p className="mt-1 text-[11px] text-slate-400">{summary?.open??"—"} título(s) aguardando liquidação</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">
            {kind === "RECEIVABLE" ? "Total recebido (liquidado)" : "Total pago (liquidado)"}
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{!summary||loading||searching?"—":fmtBRL(settledTotalCents)}</p>
          <p className="mt-1 text-[11px] text-slate-400">{summary?.settled??"—"} título(s) liquidado(s) no razão</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total de títulos no módulo</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary?.total??"—"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Persistidos em centavos inteiros</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Baixa bancária</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{internal ? "Conta autorizada" : "—"}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {internal ? "Selecione a conta ao liquidar" : "Uso exclusivo interno"}
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ALL", `Todos (${summary?.total??"—"})`],
              ["OPEN", `Em aberto (${summary?.open??"—"})`],
              ["SETTLED", `Liquidados (${summary?.settled??"—"})`],
              ["CANCELED", `Cancelados (${summary?.canceled??"—"})`],
            ] as const
          ).map(([key, txt]) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              onClick={() => {setStatusFilter(key);setPage(1);}}
            >
              {txt}
            </Button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">Busca em todos os títulos autorizados. Os indicadores incluem todos os status da busca.</p>
      <ListSearch value={query} onChange={setQuery} count={shown.length} label="Buscar descrição, produtor, evento ou valor exato em centavos" />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div className="flex items-center gap-2 font-semibold">
            <ReceiptText size={19} className="text-slate-500" />
            Listagem de títulos ({label})
          </div>
          <Badge>{shown.length} exibido(s)</Badge>
        </div>
        {loading||searching ? (
          <Loading />
        ) : error ? <p className="p-6 text-sm text-slate-600">Listagem indisponível. Use a opção de tentar novamente acima.</p> : shown.length ? (
          <div className="overflow-x-auto">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Produtor / evento</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Detalhes</th>
                  {internal && <th>Ação</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id}>
                    <td className="min-w-[200px]">
                      <p className="font-semibold">{t.description}</p>
                      <span className="text-xs text-slate-400">{displayDate(t.createdAt)}</span>
                    </td>
                    <td className="min-w-[170px]">
                      <span className="block">{t.producerName}</span>
                      <span className="text-xs text-slate-400">{t.eventName}</span>
                    </td>
                    <td className="whitespace-nowrap font-semibold">{fmtBRL(t.amountCents)}</td>
                    <td>{displayDate(t.dueDate)}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <DetailsButton onClick={() => setDetailId(t.id)} />
                    </td>
                    {internal && (
                      <td>
                        {t.status === "OPEN" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMessage("");
                              setAccountId("");
                              setSettle(t);
                            }}
                          >
                            <CheckCircle2 size={15} />
                            Liquidar
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">{t.status==="CANCELED"?"Cancelado":"Concluído"}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <Empty text={`Nenhum ${singular} cadastrado ou encontrado para o filtro selecionado.`} />
            {internal && (
              <Button
                onClick={() => {
                  reset();
                  setFormOpen(true);
                }}
              >
                <Plus size={16} />
                Cadastrar primeiro {singular}
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="my-4 flex flex-wrap items-center justify-between gap-3" aria-label="Paginação de títulos">
        <p role="status" className="text-sm text-slate-600">{loading||searching?"Atualizando resultados...":error?"Consulta indisponível.":`Página ${data?.page??page} de ${data?.pages??1} · ${data?.count??0} resultado(s). Totais consideram toda a busca, em todos os status.`}</p>
        <div className="flex gap-2"><Button variant="outline" disabled={loading||searching||page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><Button variant="outline" disabled={loading||searching||!data||page>=data.pages} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Novo {singular}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-500">
            O cadastro registra a obrigação/direito em aberto e só altera o saldo bancário após a liquidação.
          </DialogDescription>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Descrição">
              <Input
                aria-label="Descrição"
                required
                minLength={3}
                maxLength={180}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição da operação"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor (R$)">
                <Input
                  aria-label="Valor (R$)"
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Vencimento">
                <Input aria-label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Produtor (opcional)">
              <Select
                value={producerId || "none"}
                onValueChange={(v) => {
                  setProducerId(v === "none" ? "" : v);
                  setEventId("");
                }}
              >
                <SelectTrigger aria-label="Produtor (opcional)">
                  <SelectValue placeholder="Sem vinculação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vinculação</SelectItem>
                  {producers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Evento (opcional)">
              <Select value={eventId || "none"} onValueChange={(v) => setEventId(v === "none" ? "" : v)}>
                <SelectTrigger aria-label="Evento (opcional)">
                  <SelectValue placeholder="Sem vinculação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vinculação</SelectItem>
                  {filteredEvents.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.name} · {ev.producerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {message && <ErrorNotice message={message} />}
            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy||referenceLoading}>
                {busy ? "Salvando..." : "Cadastrar título"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!settle}
        onOpenChange={(open) => {
          if (!open) setSettle(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Confirmar liquidação</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
            {settle?.description} · <strong>{fmtBRL(settle?.amountCents || "0")}</strong>. A operação atualizará o
            saldo registrado, gravará lançamento no razão e registrará auditoria. Não executa PIX nem transferência no
            banco.
          </DialogDescription>
          <form onSubmit={liquidate} className="mt-6 space-y-4">
            <Field label="Conta bancária">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger aria-label="Conta bancária">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((x) => x.active)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} · {fmtBRL(a.balanceCents)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            {!accounts.length&&!referenceLoading && (
              <p className="text-sm text-amber-700">Nenhuma conta ativa disponível. Confira Tesouraria e bancos.</p>
            )}
            {message && <ErrorNotice message={message} />}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSettle(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!accountId || busy || referenceLoading}>
                {busy ? "Liquidando..." : "Confirmar liquidação"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <RecordDetailModal
        record={detailId ? { type: "titulo", id: detailId } : null}
        onClose={() => setDetailId(null)}
      />
    </>
  );
}
