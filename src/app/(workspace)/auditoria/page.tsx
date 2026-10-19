import { redirect } from "next/navigation";
import { findCurrentUser } from "@/lib/auth";
import { AuditPage } from "@/components/financeiro/audit";
export default async function Page() { const user = await findCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/dashboard"); return <AuditPage/>; }
