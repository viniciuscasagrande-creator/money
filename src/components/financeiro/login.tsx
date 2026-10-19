"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CircleDollarSign, LockKeyhole, ShieldCheck, Building2, Ticket, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const [portalMode, setPortalMode] = useState<"ADMIN" | "PRODUCER">("ADMIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, portalMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível entrar.");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de autenticação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-[#EBEBED] lg:grid-cols-[1.08fr_0.92fr]">
      {/* Painel Esquerdo BankOS Grafite #0F1113 */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0F1113] p-14 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#E03629]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-12 left-12 h-64 w-64 rounded-full bg-[#47505A]/20 blur-3xl" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E03629] text-white shadow-[0_8px_24px_rgba(224,54,41,0.4)]">
              <CircleDollarSign size={25} />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">BankOS · Financeiro ERP</span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BBBFC5]">
                17 Menus · 172 Submenus · Pacotes 01–04
              </p>
            </div>
          </div>
          <span className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs font-semibold text-[#BBBFC5]">
            Fintech Premium UI
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E03629]/40 bg-[#E03629]/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
            <span className="h-2 w-2 rounded-full bg-[#E03629]" />
            Núcleo Financeiro Centralizado
          </div>
          <h1 className="text-5xl font-bold leading-[1.12] tracking-tight">
            Controle financeiro com <span className="text-[#E03629]">precisão</span>, alçadas e
            rastreabilidade.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-[#BBBFC5]">
            Razão financeiro único em centavos inteiros, split de ingressos e MDR, repasses e
            antecipações com dupla assinatura, conciliação bancária, controle de estornos e
            governança executiva.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3.5">
            {[
              "Pacote 01 · Fundação, Contas e Razão",
              "Pacote 02 · Gateways, MDR, Split e Repasses",
              "Pacote 03 · Conciliação, Riscos e Contábil",
              "Pacote 04 · BI, Alertas e Alçadas",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-white"
              >
                <CheckCircle2 size={15} className="shrink-0 text-[#E03629]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-[#BBBFC5]">
          <span>Paleta BankOS (#0F1113 · #47505A · #BBBFC5 · #EBEBED · #E03629)</span>
          <span>Zero dados fictícios · Prisma ORM</span>
        </div>
      </div>

      {/* Painel Direito — Seletor de 2 Telas de Login (Administrador vs Produtor) */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E03629] text-white">
              <CircleDollarSign size={22} />
            </div>
            <span className="text-lg font-bold text-[#0F1113]">BankOS · Financeiro ERP</span>
          </div>

          {/* Seletor das Duas Telas de Login */}
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[#BBBFC5]/70 bg-white p-1.5 shadow-xs">
            <button
              type="button"
              onClick={() => setPortalMode("ADMIN")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                portalMode === "ADMIN"
                  ? "bg-[#0F1113] text-white shadow-sm"
                  : "text-[#47505A] hover:text-[#0F1113]"
              }`}
            >
              <Building2 size={15} className={portalMode === "ADMIN" ? "text-[#E03629]" : ""} />
              1. Login Administrador
            </button>
            <button
              type="button"
              onClick={() => setPortalMode("PRODUCER")}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
                portalMode === "PRODUCER"
                  ? "bg-[#0F1113] text-white shadow-sm"
                  : "text-[#47505A] hover:text-[#0F1113]"
              }`}
            >
              <Ticket size={15} className={portalMode === "PRODUCER" ? "text-[#E03629]" : ""} />
              2. Login Produtor
            </button>
          </div>

          <div className="mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-[#0F1113] p-3 text-white">
              <LockKeyhole size={22} className="text-[#E03629]" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-[#0F1113]">
              {portalMode === "ADMIN"
                ? "Acesso Interno & Governança"
                : "Portal Financeiro do Produtor"}
            </h2>
            <p className="mt-1.5 text-sm text-[#47505A]">
              {portalMode === "ADMIN"
                ? "Exclusivo para Administrador, Financeiro Interno e Tesouraria (17 menus)."
                : "Acesso restrito aos eventos, saldos apurados, solicitações de repasse e aceite do produtor."}
            </p>
          </div>

          <Card>
            <CardContent className="p-7">
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <Label htmlFor="email">E-mail corporativo</Label>
                  <Input
                    required
                    id="email"
                    autoComplete="username"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      portalMode === "ADMIN"
                        ? "admin@financeiro.local"
                        : "produtor@evento.com.br"
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    required
                    id="password"
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-[#E03629]/30 bg-[#E03629]/10 p-3 text-sm font-medium text-[#E03629]"
                  >
                    {error}
                  </p>
                )}

                <Button disabled={loading} type="submit" className="w-full">
                  {loading
                    ? "Verificando credenciais..."
                    : portalMode === "ADMIN"
                    ? "Entrar no ERP Financeiro"
                    : "Entrar como Produtor"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-[#47505A]">
            <ShieldCheck size={16} className="text-[#E03629]" /> Sessão HttpOnly com segregação de
            escopo na API e no banco
          </p>
        </div>
      </div>
    </div>
  );
}
