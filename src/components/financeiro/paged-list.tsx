"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {ListSearch} from "./list-search";
export type PageMeta={count:number;page:number;size:number;pages:number};
export function useListQuery(){
  const [query,setQuery]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[status,setStatus]=useState("ALL");
  useEffect(()=>{if(query.trim()===search)return;const timer=setTimeout(()=>{setSearch(query.trim());setPage(1);},300);return()=>clearTimeout(timer);},[query,search]);
  return {query,setQuery,page,setPage,status,setStatus:(value:string)=>{setStatus(value);setPage(1);},params:new URLSearchParams({pagina:String(page),limite:"25",q:search,status}).toString()};
}
type ListState=ReturnType<typeof useListQuery>;
export function ListFilters({state,count,statuses,label}:{state:ListState;count?:number;statuses:ReadonlyArray<readonly [string,string]>;label:string}){
  return <div className="my-4 space-y-3"><ListSearch value={state.query} onChange={state.setQuery} label={label}/>{count!==undefined&&<p className="text-xs text-slate-500">{count} resultado(s) no conjunto completo.</p>}<label className="block text-sm">Situação<select aria-label="Filtrar situação" className="ml-2 rounded-lg border bg-white p-2" value={state.status} onChange={e=>state.setStatus(e.target.value)}>{statuses.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label></div>;
}
export function ListPagination({meta,onPage,loading}:{meta?:PageMeta|null;onPage:(page:number)=>void;loading:boolean}){
  return <nav aria-label="Paginação da lista" className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span aria-live="polite">{meta?`${meta.count} registro(s) · Página ${meta.page} de ${meta.pages}`:"Carregando lista..."}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={loading||!meta||meta.page<=1} onClick={()=>meta&&onPage(meta.page-1)}>Anterior</Button><Button type="button" variant="outline" disabled={loading||!meta||meta.page>=meta.pages} onClick={()=>meta&&onPage(meta.page+1)}>Próxima</Button></div></nav>;
}
