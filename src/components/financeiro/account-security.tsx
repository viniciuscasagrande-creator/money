"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Grid2X2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Session = {id:string;current:boolean;createdAt:string;expiresAt:string};
export function AccountSecurityPage() {
  const router=useRouter();
  const [sessions,setSessions]=useState<Session[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [current,setCurrent]=useState(""),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState("");
  const [message,setMessage]=useState(""),[error,setError]=useState("");
  async function load(){
    setLoading(true);
    try{const response=await fetch("/api/auth/security",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao consultar sessões.");setSessions(data.items);}
    catch(e){setError(e instanceof Error?e.message:"Falha ao consultar sessões.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();await update("CHANGE_PASSWORD");}
  async function update(action:"CHANGE_PASSWORD"|"REVOKE_OTHERS"){
    setError("");setMessage("");
    if(!current){setError("Informe sua senha atual.");return;}
    if(action==="CHANGE_PASSWORD"&&password!==confirmation){setError("A confirmação da nova senha não confere.");return;}
    setBusy(true);
    try{
      const response=await fetch("/api/auth/security",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,currentPassword:current,...(action==="CHANGE_PASSWORD"?{newPassword:password}:{})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao atualizar segurança.");
      setCurrent("");setPassword("");setConfirmation("");
      if(data.requiresLogin){router.replace("/login");router.refresh();return;}
      setMessage(`${data.revoked} outras sessões encerradas.`);await load();
    }catch(e){setError(e instanceof Error?e.message:"Falha ao atualizar segurança.");}
    finally{setBusy(false);}
  }
  const date=(value:string)=>new Date(value).toLocaleString("pt-BR");
  return <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
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
    <div><h1 className="text-2xl font-bold">Segurança da minha conta</h1><p className="mt-2 text-sm text-muted-foreground">Atualize sua senha e encerre acessos de outros dispositivos.</p></div>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message&&<p role="status" className="rounded-xl border p-3 text-sm">{message}</p>}
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-5">
      <h2 className="font-semibold">Trocar senha</h2>
      <p className="text-sm text-muted-foreground">Use ao menos 12 caracteres. Ao salvar, todas as suas sessões serão encerradas e você deverá entrar novamente.</p>
      <div><label htmlFor="current-password" className="mb-1 block text-sm">Senha atual</label><Input id="current-password" type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e=>setCurrent(e.target.value)}/></div>
      <div><label htmlFor="new-password" className="mb-1 block text-sm">Nova senha</label><Input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)}/></div>
      <div><label htmlFor="confirm-password" className="mb-1 block text-sm">Confirmar nova senha</label><Input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div>
      <Button type="submit" disabled={busy}>{busy?"Processando...":"Salvar nova senha"}</Button>
      <div className="border-t pt-4"><p className="mb-3 text-sm text-muted-foreground">Para encerrar os outros acessos sem trocar a senha, preencha apenas a senha atual.</p><Button type="button" variant="outline" disabled={busy||loading} onClick={()=>void update("REVOKE_OTHERS")}>Encerrar outras sessões</Button></div>
    </form>
    <section className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">Sessões ativas</h2>
      {loading?<p role="status">Carregando sessões...</p>:<ul className="divide-y">{sessions.map(session=><li key={session.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{session.current?"Sessão atual":"Outro acesso"}</p><p>Início: {date(session.createdAt)}</p><p className="text-muted-foreground">Expira em: {date(session.expiresAt)}</p></li>)}</ul>}
    </section>
  </div>;
}
