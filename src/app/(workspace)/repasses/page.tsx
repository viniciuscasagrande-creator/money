import { findCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PayoutsPage } from "@/components/financeiro/payouts";
export const dynamic = "force-dynamic";
export default async function Page() { const user = await findCurrentUser(); if (!user) redirect("/login"); return <PayoutsPage/>; }
