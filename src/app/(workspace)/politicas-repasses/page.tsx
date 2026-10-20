import { findCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReleasePoliciesPage } from "@/components/financeiro/release-policies";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await findCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "FINANCE_DISK") redirect("/dashboard");
  return <ReleasePoliciesPage />;
}
