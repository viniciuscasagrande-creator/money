"use client";
import { Search,X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function ListSearch({value,onChange,label="Buscar nesta lista...",count}:{value:string;onChange:(v:string)=>void;label?:string;count?:number}){
 return <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#ece7e6] bg-white p-3 sm:p-4">
  <div className="relative min-w-[210px] flex-1"><Search size={16} className="absolute left-3 top-3 text-[#aaa2a5]"/><Input aria-label={label} className="pl-10" value={value} onChange={e=>onChange(e.target.value)} placeholder={label}/></div>
  {count!==undefined&&<span className="whitespace-nowrap text-xs text-[#968f93]">{count} {count===1?"registro exibido":"registros exibidos"}</span>}
  {!!value&&<Button type="button" size="sm" variant="outline" onClick={()=>onChange("")}><X size={14}/>Limpar</Button>}
 </div>;
}
/** Filtro local sobre registros já retornados pela API. Não é busca na base completa. */
export function searchRows<T>(rows:readonly T[]|undefined,query:string,fields:(row:T)=>readonly unknown[]):T[]{
 if(!rows)return[];const q=query.trim().toLocaleLowerCase("pt-BR");if(!q)return [...rows];
 return rows.filter(r=>fields(r).some(v=>String(v??"").toLocaleLowerCase("pt-BR").includes(q)));
}
