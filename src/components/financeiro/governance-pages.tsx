"use client";
import { useState } from "react";
import { ShieldCheck, SlidersHorizontal, Users, RefreshCcw, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeading, useApi, api, Loading, ErrorNotice, Empty, displayDateTime } from "@/components/financeiro/shared";
import { currency } from "@/components/financeiro/intelligence";
import {OperationalMonitor} from "./operational-monitor";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FINANCE_DISK" | "PRODUCER";
  active: boolean;
  permissionOverrides: { permission: string; allowed: boolean }[];
};
type Granted = {
  id: string;
  userId: string;
  userName: string;
  type: "REPASSE" | "ANTECIPACAO";
  maxCents: string;
  active: boolean;
  updatedAt: string;
};
const permissionNames: Record<string, string> = {
  REPORT_VIEW: "Relatórios",
  ALERT_VIEW: "Alertas",
  PAYOUT_APPROVE: "Aprovação financeira",
  PAYOUT_SETTLE: "Baixa financeira",
  AUDIT_VIEW: "Auditoria",
  CONFIG_VIEW: "Parâmetros",
};
const applicable = (role: UserRow["role"], p: string) =>
  role === "ADMIN" ? true : role === "FINANCE_DISK" ? p !== "AUDIT_VIEW" : p === "REPORT_VIEW";

export function GovernancePage() {
  const users = useApi<{ items: UserRow[]; permissions: string[] }>("/api/governanca/usuarios");
  const grants = useApi<{ items: Granted[] }>("/api/governanca/alcadas");
  const [approvalModal, setApprovalModal] = useState(false),
    [pendingPermission, setPendingPermission] = useState<{
      subject: UserRow;
      permission: string;
      allowed: boolean;
    } | null>(null);
  const [selected, setSelected] = useState(""),
    [type, setType] = useState<"REPASSE" | "ANTECIPACAO">("REPASSE"),
    [limit, setLimit] = useState("0,00"),
    [active, setActive] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");

  async function setPermission(subject: UserRow, permission: string, allowed: boolean) {
    setBusy(true);
    setNotice("");
    try {
      await api("/api/governanca/usuarios", {
        method: "POST",
        body: JSON.stringify({ userId: subject.id, permission, allowed }),
      });
      users.reload();
      setPendingPermission(null);
      setNotice("Permissão atualizada e auditada.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro na permissão.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAuthority() {
    setBusy(true);
    setNotice("");
    try {
      const cents = toCents(limit);
      await api("/api/governanca/alcadas", {
        method: "POST",
        body: JSON.stringify({ userId: selected, type, maxCents: cents, active }),
      });
      grants.reload();
      setApprovalModal(false);
      setNotice("Alçada atualizada e auditada.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Erro ao definir alçada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Governança administrativa"
        title="Permissões e Alçadas Financeiras"
        subtitle="Perfis definem o limite máximo de acesso. As permissões individuais apenas restringem a autorização dentro do próprio perfil."
      />
      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          {notice}
        </p>
      )}
      {users.error && <ErrorNotice message={users.error} retry={users.reload} />}
      {users.loading ? (
        <Loading />
      ) : (
        <Card className="mb-5 overflow-x-auto">
          <div className="flex items-center gap-2 border-b border-slate-100 p-5 font-semibold">
            <Users size={18} />
            Matriz por usuário ({users.data?.items.length ?? 0})
          </div>
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                {users.data?.permissions.map((p) => (
                  <th key={p}>{permissionNames[p] ?? p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.data?.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.name}</b>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td>
                    {u.role === "ADMIN"
                      ? "Administrador"
                      : u.role === "FINANCE_DISK"
                      ? "Financeiro Interno"
                      : "Produtor"}
                  </td>
                  {users.data?.permissions.map((p) => {
                    const usable = applicable(u.role, p);
                    const over = u.permissionOverrides.find((v) => v.permission === p);
                    const checked = usable && over?.allowed !== false;
                    return (
                      <td key={p}>
                        <input
                          aria-label={`${permissionNames[p]} - ${u.name}`}
                          type="checkbox"
                          checked={checked}
                          disabled={!usable || u.role === "ADMIN" || busy || !u.active}
                          onChange={(e) =>
                            setPendingPermission({
                              subject: u,
                              permission: p,
                              allowed: e.target.checked,
                            })
                          }
                          className="h-4 w-4 accent-slate-900"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card className="mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <ShieldCheck size={18} />
          Alçadas financeiras por usuário
        </div>
        <p className="mb-5 text-sm text-slate-500">
          Sem uma alçada ativa, o Financeiro Interno não pode aprovar repasses ou antecipações. O Administrador mantém autorização administrativa, sujeita a auditoria.
        </p>
        <div className="grid gap-4 md:grid-cols-5">
          <label className="text-sm">
            Usuário financeiro
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full rounded-lg border p-2"
            >
              <option value="">Selecionar</option>
              {users.data?.items
                .filter((u) => u.role === "FINANCE_DISK" && u.active)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm">
            Operação
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "REPASSE" | "ANTECIPACAO")}
              className="mt-1 w-full rounded-lg border p-2"
            >
              <option value="REPASSE">Repasse</option>
              <option value="ANTECIPACAO">Antecipação</option>
            </select>
          </label>
          <label className="text-sm">
            Limite (R$)
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" />
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />{" "}
            Alçada ativa
          </label>
          <div className="flex items-end">
            <Button
              disabled={!selected || busy}
              onClick={() => {
                try {
                  toCents(limit);
                  setApprovalModal(true);
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "Valor inválido.");
                }
              }}
            >
              Salvar alçada
            </Button>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Operação</th>
                <th>Limite</th>
                <th>Ativa</th>
                <th>Atualização</th>
              </tr>
            </thead>
            <tbody>
              {grants.data?.items.map((g) => (
                <tr key={g.id}>
                  <td>{g.userName}</td>
                  <td>{g.type}</td>
                  <td>{currency(g.maxCents)}</td>
                  <td>{g.active ? "Sim" : "Não"}</td>
                  <td>{displayDateTime(g.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {grants.error && <ErrorNotice message={grants.error} retry={grants.reload} />}
      </Card>
      <p className="text-xs text-slate-500">
        Todas as alterações são auditadas. Aprovações já registradas não são apagadas por mudanças posteriores de alçada.
      </p>
      <Dialog
        open={!!pendingPermission}
        onOpenChange={(o) => {
          if (!o) setPendingPermission(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Confirmar alteração de acesso</DialogTitle>
          <DialogDescription>
            Esta operação será registrada na trilha de auditoria. O perfil original continua limitando as permissões.
          </DialogDescription>
          <p className="my-5 text-sm text-[#50474d]">
            {pendingPermission?.subject.name} ·{" "}
            {pendingPermission
              ? permissionNames[pendingPermission.permission] ?? pendingPermission.permission
              : ""}{" "}
            · <strong>{pendingPermission?.allowed ? "Permitir" : "Restringir"}</strong>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingPermission(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                pendingPermission &&
                setPermission(
                  pendingPermission.subject,
                  pendingPermission.permission,
                  pendingPermission.allowed
                )
              }
            >
              {busy ? "Salvando..." : "Confirmar permissão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={approvalModal} onOpenChange={setApprovalModal}>
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Confirmar alçada financeira</DialogTitle>
          <DialogDescription>
            O limite cadastrado controlará a autorização de futuras solicitações e será auditado.
          </DialogDescription>
          <div className="my-5 space-y-2 rounded-xl bg-[#faf6f5] p-4 text-sm">
            <p>
              <strong>Usuário:</strong>{" "}
              {users.data?.items.find((u) => u.id === selected)?.name ?? "—"}
            </p>
            <p>
              <strong>Operação:</strong> {type === "REPASSE" ? "Repasse" : "Antecipação"}
            </p>
            <p>
              <strong>Limite:</strong> R$ {limit}
            </p>
            <p>
              <strong>Ativa:</strong> {active ? "Sim" : "Não"}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setApprovalModal(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !selected} onClick={saveAuthority}>
              {busy ? "Salvando..." : "Confirmar alçada"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toCents(value: string) {
  const raw = value.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw))
    throw new Error("Informe valor em reais com até duas casas decimais.");
  const [whole, decimal = ""] = raw.split(".");
  const result = BigInt(whole) * 100n + BigInt((decimal + "00").slice(0, 2));
  if (result > 999999999999999n) throw new Error("Limite acima do permitido.");
  return result.toString();
}

const settingLabels: Record<string, string> = {
  overdueDays: "Atraso em títulos (dias)",
  payoutPendingDays: "Repasses pendentes (dias)",
  unmatchedDays: "Conciliações pendentes (dias)",
  openRiskDays: "Riscos sem decisão (dias)",
};

export function SettingsPage() {
  const { data, error, loading, reload } = useApi<{
    settings: Record<string, number>;
    description: string;
  }>("/api/governanca/configuracoes");
  const [message, setMessage] = useState(""),
    [saving, setSaving] = useState("");
  async function change(key: string, val: number) {
    setSaving(key);
    setMessage("");
    try {
      await api("/api/governanca/configuracoes", {
        method: "POST",
        body: JSON.stringify({ key, value: val }),
      });
      setMessage("Parâmetro atualizado com trilha de auditoria.");
      reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Administração"
        title="Configurações Financeiras"
        subtitle="Parâmetros auditáveis de monitoramento. Não alteram regras de divisão de receita, contratos ou saldos bancários."
      />
      {error && <ErrorNotice message={error} retry={reload} />}
      {loading ? (
        <Loading />
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <SlidersHorizontal size={18} />
            Limiares de alertas operacionais
          </div>
          {Object.entries(data?.settings ?? {}).map(([key, value]) => (
            <SettingRow
              key={key}
              settingKey={key}
              value={value}
              disabled={saving === key}
              onSave={change}
            />
          ))}
        </Card>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-slate-700">
          {message}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">{data?.description}</p>
    </>
  );
}

function SettingRow({
  settingKey,
  value,
  onSave,
  disabled,
}: {
  settingKey: string;
  value: number;
  onSave: (key: string, val: number) => void;
  disabled: boolean;
}) {
  const [current, setCurrent] = useState(value);
  return (
    <div className="flex flex-wrap items-end gap-4 border-b py-3">
      <label className="min-w-64 text-sm font-medium text-slate-700">
        {settingLabels[settingKey] ?? settingKey}
        <Input
          type="number"
          min="0"
          max="90"
          value={current}
          onChange={(e) => setCurrent(Number(e.target.value))}
        />
      </label>
      <Button
        size="sm"
        disabled={disabled || !Number.isSafeInteger(current) || current < 0 || current > 90}
        onClick={() => onSave(settingKey, current)}
      >
        Salvar
      </Button>
    </div>
  );
}

type AuditRow = {
  id: string;
  requestId: string|null;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  actor: string;
  actorEmail: string;
  actorRole: string;
};

export function AdvancedAuditPage() {
  const [requestId,setRequestId]=useState("");
  const [filter, setFilter] = useState(""),
    [action, setAction] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const [query, setQuery] = useState("pagina=1&limite=30");
  const { data, error, loading, reload } = useApi<{
    items: AuditRow[];
    count: number;
    page: number;
    size: number;
  }>(`/api/governanca/auditoria?${query}`);

  function apply(next = 1, nextAction = action, nextEntity = filter) {
    setAction(nextAction);
    setFilter(nextEntity);
    const p = new URLSearchParams({ pagina: String(next), limite: "30" });
    if (nextEntity) p.set("entidade", nextEntity);
    if (nextAction) p.set("acao", nextAction);
    if (start) p.set("inicio", start);
    if (end) p.set("fim", end);
    if (requestId.trim()) p.set("requestId",requestId.trim());
    setPage(next);
    setQuery(p.toString());
  }

  return (
    <>
      <PageHeading
        eyebrow="Auditoria e governança"
        title="Log de Atividades e Trilha de Auditoria"
        subtitle="Consulta paginada e imutável de todas as ações operacionais, cadastros, aprovações, liquidações e lançamentos contábeis realizados no sistema."
        action={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/governanca/auditoria?${query}&formato=csv`}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download size={15} />
              Exportar CSV
            </a>
            <Button variant="outline" onClick={reload}>
              <RefreshCcw size={15} />
              Atualizar
            </Button>
          </div>
        }
      />

      {/* Indicadores próprios de Auditoria e Log de Atividades */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total de eventos auditados</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{data?.count ?? 0}</p>
          <p className="mt-1 text-[11px] text-slate-400">Registros imutáveis gravados no banco</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Exibidos nesta página</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{data?.items.length ?? 0}</p>
          <p className="mt-1 text-[11px] text-slate-400">Página {page} (até 30 por página)</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Filtro de ação ativo</p>
          <p className="mt-2 text-lg font-bold text-sky-800">
            {action || filter ? `${action || "Todas"} · ${filter || "Todas"}` : "Todas as operações"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Rastreabilidade por operador e entidade</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["", "", "Todos os logs"],
            ["ACCOUNT", "", "Contas Bancárias"],
            ["TITLE", "", "Recebimentos / Pagamentos"],
            ["PAYOUT", "", "Repasses e Travas"],
            ["SALE", "", "Vendas e MDR"],
            ["ACCOUNTING", "", "Motor Contábil"],
            ["RISK", "", "Cancelamentos / Riscos"],
          ] as const
        ).map(([actCode, entCode, label]) => (
          <Button
            key={label}
            size="sm"
            variant={action === actCode && filter === entCode ? "default" : "outline"}
            onClick={() => apply(1, actCode, entCode)}
          >
            {label}
          </Button>
        ))}
      </div>

      <OperationalMonitor/>
      <Card className="mb-5 flex flex-wrap items-end gap-3 p-5">
        <label className="text-xs font-medium">Requisição<Input placeholder="Identificador de referência" value={requestId} onChange={e=>setRequestId(e.target.value)}/></label>
        <label className="text-xs font-medium">
          Ação
          <Input
            placeholder="Ex.: PAYOUT, ACCOUNT, SALE"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium">
          Entidade
          <Input
            placeholder="Ex.: BankAccount, PayoutRequest"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium">
          Início
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="text-xs font-medium">
          Fim
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <Button onClick={() => apply(1)}>Filtrar</Button>
      </Card>

      {error && <ErrorNotice message={error} retry={reload} />}
      {loading ? (
        <Loading />
      ) : (
        <Card className="overflow-x-auto">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Descrição</th>
                <th>Responsável</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{displayDateTime(a.createdAt)}</td>
                  <td>
                    <Badge tone="blue">{a.action}</Badge>
                  </td>
                  <td>
                    <strong>{a.entity}</strong>
                    <p className="max-w-36 truncate font-mono text-xs text-slate-400" title={a.entityId}>
                      {a.entityId}
                    </p>
                  </td>
                  <td>{a.summary}</td>
                  <td>
                    {a.actor}
                    <p className="text-xs text-slate-400">{a.actorEmail}</p>
                  </td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => setSelectedRow(a)}>
                      Inspecionar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.items.length && <Empty />}
          <div className="flex items-center justify-between p-4 text-xs">
            <p>
              Total: {data?.count ?? 0} registros · Página {page}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => apply(page - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page * 30 >= (data?.count ?? 0)}
                onClick={() => apply(page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog
        open={!!selectedRow}
        onOpenChange={(o) => {
          if (!o) setSelectedRow(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-bold">Detalhes do Evento de Auditoria</DialogTitle>
          <DialogDescription>Registro imutável gravado na trilha de auditoria.</DialogDescription>
          {selectedRow && (
            <div className="mt-4 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <p>
                <strong>ID do Log:</strong> <span className="font-mono">{selectedRow.id}</span>
              </p>
              <p><strong>Requisição:</strong> <span className="break-all font-mono">{selectedRow.requestId??"Registro anterior ou rotina sem contexto"}</span></p>
              <p>
                <strong>Data/Hora:</strong> {displayDateTime(selectedRow.createdAt)}
              </p>
              <p>
                <strong>Ação Executada:</strong> <span className="font-mono font-bold">{selectedRow.action}</span>
              </p>
              <p>
                <strong>Entidade / ID:</strong> {selectedRow.entity} ({selectedRow.entityId})
              </p>
              <p>
                <strong>Operador:</strong> {selectedRow.actor} ({selectedRow.actorEmail} · {selectedRow.actorRole})
              </p>
              <p>
                <strong>Resumo Auditado:</strong> {selectedRow.summary}
              </p>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setSelectedRow(null)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
