"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  CircleDollarSign,
  LockKeyhole,
  ShieldCheck,
  Building2,
  UserCheck,
  Clock,
  KeyRound,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TOTAL_MAIN_MENUS, TOTAL_SUBMENUS } from "@/config/navigation";

export function LoginForm() {
  const router = useRouter();
  const [loginMode, setLoginMode] = useState<"INTERNAL" | "PRODUCER">("INTERNAL");
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
        body: JSON.stringify({ email, password }),
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
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left Institutional Panel */}
      <div className="hidden flex-col justify-between bg-slate-900 p-14 text-white lg:flex">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CircleDollarSign size={29} className="text-sky-400" />
            <div>
              <span className="text-lg font-bold block leading-none">Financeiro ERP</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {TOTAL_MAIN_MENUS} Menus · {TOTAL_SUBMENUS} Submenus
              </span>
            </div>
          </div>
          <Badge tone="blue">Pacote 01 · Fundação</Badge>
        </div>

        {loginMode === "INTERNAL" ? (
          <div>
            <div className="mb-7 h-1 w-20 rounded bg-sky-400" />
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-300 mb-4">
              <Building2 size={14} />
              Tela de Login 01 · Administrador e Financeiro Interno
            </span>
            <h1 className="max-w-lg text-4xl font-semibold leading-[1.15]">
              Controle financeiro com <span className="text-sky-300">segurança</span>, razão em centavos e rastreabilidade.
            </h1>
            <p className="mt-5 max-w-md text-slate-300 text-sm leading-relaxed">
              Gestão de recebimentos, contas a pagar, tesouraria, saldos conciliados no razão financeiro
              (BigInt) e estrutura completa de {TOTAL_MAIN_MENUS} menus e {TOTAL_SUBMENUS} submenus.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-7 h-1 w-20 rounded bg-amber-400" />
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300 mb-4">
              <Clock size={14} />
              Tela de Login 02 · Portal do Produtor (Etapa Pós-Financeiro)
            </span>
            <h1 className="max-w-lg text-4xl font-semibold leading-[1.15]">
              Acesso exclusivo do <span className="text-amber-300">Produtor e Organizador</span> de eventos.
            </h1>
            <p className="mt-5 max-w-md text-slate-300 text-sm leading-relaxed">
              O Portal completo do Produtor (borderôs, solicitações de repasse, antecipações e acerto de
              evento) será montado logo após a conclusão do Financeiro Interno. Produtores já cadastrados
              pelo Administrador podem autenticar-se aqui para consulta restrita aos seus eventos.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-4">
          <span>Pacote 01 · Fundação Financeira (Prisma + SQLite/PostgreSQL)</span>
          <span>API de Ingressos Configurada</span>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="flex items-center justify-center px-5 py-12 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Dual Login Mode Selector */}
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-200/80 p-1">
            <button
              type="button"
              onClick={() => {
                setLoginMode("INTERNAL");
                setError("");
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition ${
                loginMode === "INTERNAL"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 size={15} />
              <span>1. Login Administrador</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginMode("PRODUCER");
                setError("");
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-xs font-bold transition ${
                loginMode === "PRODUCER"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck size={15} />
              <span>2. Login Produtor</span>
            </button>
          </div>

          <div className="mb-6">
            <div className="mb-3 inline-flex rounded-xl bg-blue-50 p-3 text-blue-800">
              <LockKeyhole size={24} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              {loginMode === "INTERNAL"
                ? "Acesso Administrativo / Interno"
                : "Acesso do Produtor / Parceiro"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {loginMode === "INTERNAL"
                ? "Entre com as credenciais de Administrador ou Financeiro Interno."
                : "Área exclusiva para produtores vinculados a eventos (montagem completa após o módulo interno)."}
            </p>
          </div>

          <Card>
            <CardContent className="p-7">
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <Label htmlFor="email">
                    {loginMode === "INTERNAL" ? "E-mail corporativo" : "E-mail do produtor"}
                  </Label>
                  <Input
                    required
                    id="email"
                    autoComplete="username"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      loginMode === "INTERNAL"
                        ? "admin@seudominio.com.br"
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
                  <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}
                <Button disabled={loading} type="submit" className="w-full">
                  {loading
                    ? "Verificando acesso..."
                    : loginMode === "INTERNAL"
                    ? "Entrar no Financeiro Interno"
                    : "Entrar no Portal do Produtor"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-5 space-y-2 text-center text-xs text-slate-500">
            <p className="flex items-center justify-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              Sessão HttpOnly + bcrypt · Sem saldos ou usuários fictícios
            </p>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <KeyRound size={13} />
              Chave de API externa de ingressos configurada no ambiente (.env)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
