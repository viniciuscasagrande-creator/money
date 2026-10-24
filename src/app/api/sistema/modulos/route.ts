import {withMonitoring} from "@/lib/observability";
import { NextRequest,NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { capabilityList } from "@/lib/governance";
import { visibleFinanceModules, PACKAGE_LABELS } from "@/lib/financeiro/constants";
export const runtime="nodejs";
async function GETHandler(request:NextRequest){
 const {user,error}=await authorize(request); if(error||!user)return error!;
 const capabilities=await capabilityList(user);
 return NextResponse.json({items:visibleFinanceModules(user.role,capabilities),packages:PACKAGE_LABELS,
  profile:user.role,countsAreReal:true},{headers:{"Cache-Control":"private, no-store"}});
}

export const GET=withMonitoring("/api/sistema/modulos",GETHandler);
