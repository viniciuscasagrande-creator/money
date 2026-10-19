import Link from "next/link";
import {findCurrentUser,isInternal} from "@/lib/auth";
import {redirect} from "next/navigation";
import {AccountingPage} from "@/components/financeiro/control-pages";
export const dynamic="force-dynamic";
export default async function Page(){const user=await findCurrentUser();if(!user)redirect("/login");if(!isInternal(user.role))redirect("/dashboard");return <><div className="mb-4"><Link className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white" href="/contabilidade/livros">Abrir livros contábeis e balancete</Link></div><AccountingPage/></>;}
