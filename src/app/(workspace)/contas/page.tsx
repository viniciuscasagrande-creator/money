import { redirect } from "next/navigation";
import { findCurrentUser, isInternal } from "@/lib/auth";
import { AccountsPage } from "@/components/financeiro/accounts";
export default async function Page() { const user = await findCurrentUser(); if (!user || !isInternal(user.role)) redirect("/dashboard"); return <AccountsPage/>; }
