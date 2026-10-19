"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const [loginMode, setLoginMode] = useState<"ADMIN" | "PRODUCER">("ADMIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível entrar.");
      router.replace("/dashboard"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro de autenticação."); }
    finally { setLoading(false); }
  }
  return <div className="grid min-h-screen bg-[#faf8f6] lg:grid-cols-[1.05fr_1fr]">
    <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#29272e] p-10 text-white lg:flex xl:p-16">
      <div className="absolute -right-64 top-12 h-[640px] w-[640px] rounded-full border-[88px] border-[#f36f66]/[.10]"/>
      <div className="absolute -right-44 top-[-130px] h-[560px] w-[560px] rounded-full border border-white/10"/>
      <div className="absolute bottom-[-160px] left-[-90px] h-[380px] w-[380px] rounded-full bg-[#ea6c64]/[.12] blur-[100px]"/>
      <div className="relative z-10 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e66d63] text-white"><svg width="25" height="25" viewBox="0 0 24 24" fill="none"><path d="M3.5 16.5 9 7.5l4.4 6L20.5 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.5 4.5h5v5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span><div><p className="text-xl font-bold tracking-[-.05em]">finance<span className="text-[#ff8b7f]">.</span></p><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/40">ERP FINANCEIRO</p></div></div>
      <div className="relative z-10 max-w-xl"><div className="mb-8 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs text-[#ffc0ba]"><Sparkles size={15}/>Inteligência financeira com controle</div><h1 className="text-[52px] font-bold leading-[1.07] tracking-[-.065em] xl:text-[63px]">Uma nova visão sobre o <span className="text-[#fc8177]">seu financeiro.</span></h1><p className="mt-7 max-w-md text-base leading-7 text-[#bbb5bd]">Operações, saldos, repasses e governança em uma plataforma integrada. Cada perfil acessa apenas as funções autorizadas.</p><div className="mt-10 grid max-w-lg gap-4 sm:grid-cols-2"><div className="flex items-center gap-2.5 text-xs text-[#ddd7db]"><CheckCircle2 size={17} className="text-[#fb8c83]"/>Registros rastreáveis</div><div className="flex items-center gap-2.5 text-xs text-[#ddd7db]"><CheckCircle2 size={17} className="text-[#fb8c83]"/>Acessos segregados</div></div></div>
      <p className="relative z-10 text-xs text-white/35">ERP Financeiro · Fintech Premium · 17 Menus e 172 Submenus</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-14 sm:px-12"><div className="w-full max-w-[438px]">
      <div className="mb-11 flex items-center gap-2 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e66d63] text-white"><Sparkles size={23}/></span><span className="text-lg font-bold tracking-tight">finance.</span></div>
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0ec] text-[#e16b60]">{loginMode === "ADMIN" ? <LockKeyhole size={22}/> : <UserCheck size={22}/>}</span>
      <h2 className="text-[36px] font-bold tracking-[-.055em] text-[#2d292e]">Boas-vindas.</h2>
      <p className="mt-2 text-[14px] leading-6 text-[#979094]">
        {loginMode === "ADMIN"
          ? "Acesso do Administrador e Financeiro Interno aos 17 menus e 172 submenus."
          : "Portal do Produtor com acesso restrito aos saldos, vendas e repasses dos seus eventos."}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-[#e7e1df] bg-[#f3efed] p-1.5" role="tablist" aria-label="Tipo de acesso">
        <button
          type="button"
          role="tab"
          aria-selected={loginMode === "ADMIN"}
          onClick={() => { setLoginMode("ADMIN"); setError(""); }}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
            loginMode === "ADMIN"
              ? "bg-[#29272e] text-white shadow-sm"
              : "text-[#60595f] hover:text-[#29272e]"
          }`}
        >
          <LockKeyhole size={14} className={loginMode === "ADMIN" ? "text-[#ff8b7f]" : ""} />
          1. Administrador
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={loginMode === "PRODUCER"}
          onClick={() => { setLoginMode("PRODUCER"); setError(""); }}
          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
            loginMode === "PRODUCER"
              ? "bg-[#e66d63] text-white shadow-sm"
              : "text-[#60595f] hover:text-[#29272e]"
          }`}
        >
          <UserCheck size={14} />
          2. Produtor
        </button>
      </div>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div><label htmlFor="email" className="mb-2 block text-xs font-bold text-[#60595f]">{loginMode === "ADMIN" ? "E-mail do Administrador / Financeiro" : "E-mail do Produtor"}</label><Input id="email" required autoComplete="username" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={loginMode === "ADMIN" ? "admin@financeiro.local" : "produtor@evento.com.br"} className="h-12 rounded-xl border-[#e7e1df] bg-white px-4"/></div>
        <div><label htmlFor="password" className="mb-2 block text-xs font-bold text-[#60595f]">Senha de acesso</label><Input id="password" required autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} className="h-12 rounded-xl border-[#e7e1df] bg-white px-4"/></div>
        {error && <p role="alert" className="rounded-xl border border-[#f5dbd6] bg-[#fff0ee] p-3 text-xs leading-5 text-[#b3483f]">{error}</p>}
        <Button disabled={loading} type="submit" className="h-12 w-full rounded-xl text-sm shadow-none">{loading ? "Verificando acesso..." : <>Acessar {loginMode === "ADMIN" ? "Painel Administrativo" : "Portal do Produtor"} <ArrowRight size={17}/></>}</Button>
      </form>
      <div className="mt-10 flex items-center justify-center gap-2 border-t border-[#ebe5e2] pt-6 text-[11px] text-[#989196]"><ShieldCheck size={16}/>Sessão segura com permissões por perfil</div>
    </div></section>
  </div>;
}
