import {withMonitoring} from "@/lib/observability";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeAccountSecurity, SecurityError, sessionTokenHash } from "@/lib/account-security";
import { apiCatch } from "@/lib/validation";

export const runtime = "nodejs";
const cookieName = "disk_financeiro_session";
const inputSchema = z.discriminatedUnion("action",[
  z.object({action:z.literal("CHANGE_PASSWORD"),currentPassword:z.string().min(1).max(128),newPassword:z.string().min(12).max(72)}).strict(),
  z.object({action:z.literal("REVOKE_OTHERS"),currentPassword:z.string().min(1).max(128)}).strict()
]);
async function GETHandler(request: NextRequest) {
  const {user,error} = await authorize(request); if(error || !user) return error!;
  try {
    const token = (await cookies()).get(cookieName)?.value ?? "";
    const sessions = await prisma.session.findMany({where:{userId:user.id,expiresAt:{gt:new Date()}},select:{id:true,tokenHash:true,createdAt:true,expiresAt:true},orderBy:{createdAt:"desc"}});
    return NextResponse.json({items:sessions.map(s=>({id:s.id,current:s.tokenHash===sessionTokenHash(token),createdAt:s.createdAt,expiresAt:s.expiresAt}))},{headers:{"Cache-Control":"no-store"}});
  } catch(e) {const x=apiCatch(e);return fail(x.message,x.status);}
}
async function POSTHandler(request: NextRequest) {
  const {user,error} = await authorize(request); if(error || !user) return error!;
  try {
    const input = inputSchema.parse(await request.json().catch(()=>null));
    const jar = await cookies(), token = jar.get(cookieName)?.value ?? "";
    const result = await changeAccountSecurity(prisma,{...input,userId:user.id,tokenHash:sessionTokenHash(token)});
    if(result.requiresLogin) jar.delete(cookieName);
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch(e) {
    if(e instanceof SecurityError) return fail(e.message,e.status);
    const x=apiCatch(e);return fail(x.message,x.status);
  }
}

export const GET=withMonitoring("/api/auth/security",GETHandler);
export const POST=withMonitoring("/api/auth/security",POSTHandler);
