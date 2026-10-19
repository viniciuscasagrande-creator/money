import { redirect } from "next/navigation";
import { findCurrentUser } from "@/lib/auth";
import { AdminPage } from "@/components/financeiro/admin";
export default async function Page() { const user = await findCurrentUser(); if (!user || user.role !== "ADMIN") redirect("/dashboard"); return <AdminPage/>; }
