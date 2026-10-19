"use client";
import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ErrorNotice, Field } from "@/components/financeiro/shared";
import { parseBRLToCents } from "@/lib/money";

/** Cadastro único reutilizado por Tesouraria e Saldos, protegido pela API interna. */
export function CreateBankAccountDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [name, setName] = useState(""),
    [institution, setInstitution] = useState(""),
    [lastFour, setLastFour] = useState(""),
    [initial, setInitial] = useState("0,00");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api("/api/contas", {
        method: "POST",
        body: JSON.stringify({
          name,
          institution,
          lastFour: lastFour || null,
          initialBalanceCents: parseBRLToCents(initial)
        })
      });
      onOpenChange(false);
      setName("");
      setInstitution("");
      setLastFour("");
      setInitial("0,00");
      onCreated();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível cadastrar a conta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-xl font-bold">Cadastrar conta bancária</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-slate-500">
          O saldo inicial é registrado como lançamento de abertura no razão financeiro.
        </DialogDescription>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Nome de identificação">
            <Input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Conta operacional"
            />
          </Field>
          <Field label="Instituição">
            <Input
              required
              minLength={2}
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Banco ou instituição financeira"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Últimos quatro dígitos">
              <Input
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Saldo inicial (R$)">
              <Input inputMode="decimal" required value={initial} onChange={(e) => setInitial(e.target.value)} />
            </Field>
          </div>
          {message && <ErrorNotice message={message} />}
          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? "Salvando..." : "Criar conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
