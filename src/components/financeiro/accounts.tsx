"use client";
import { useState } from "react";
import { Landmark, Plus, Wallet, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateBankAccountDialog } from "@/components/financeiro/create-bank-account-dialog";
import { Empty, ErrorNotice, Loading, PageHeading, useApi, type Account } from "@/components/financeiro/shared";
import { fmtBRL } from "@/lib/money";

export function AccountsPage() {
  const { data, error, loading, reload } = useApi<{ items: Account[] }>("/api/contas");
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="Tesouraria e bancos"
        title="Contas Bancárias"
        subtitle="Controle os saldos reais informados e os lançamentos financeiros de cada conta."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            Nova conta bancária
          </Button>
        }
      />
      {error && <ErrorNotice message={error} retry={reload} />} {loading && <Loading />}
      {data &&
        (data.items.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-4 p-10 text-center">
              <Empty text="Nenhuma conta cadastrada. Cadastre uma conta para registrar liquidações." />
              <Button onClick={() => setOpen(true)}>
                <Plus size={17} />
                Cadastrar primeira conta
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <span className="rounded-xl bg-sky-50 p-3 text-sky-700">
                      <Landmark size={21} />
                    </span>
                    <Badge tone={a.active ? "green" : "neutral"}>{a.active ? "Ativa" : "Inativa"}</Badge>
                  </div>
                  <h3 className="mt-6 font-bold">{a.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {a.institution}
                    {a.lastFour ? ` · Final ${a.lastFour}` : ""}
                  </p>
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <Wallet size={14} /> Saldo atual
                    </p>
                    <p className="mt-2 text-[27px] font-bold tracking-tight">{fmtBRL(a.balanceCents)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
      <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
        <CheckCircle2 size={16} />
        Saldos registrados em centavos e movimentações persistidas no banco de dados.
      </div>
      <CreateBankAccountDialog open={open} onOpenChange={setOpen} onCreated={reload} />
    </>
  );
}
