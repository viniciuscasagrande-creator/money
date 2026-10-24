import { findCurrentUser, isInternal } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AccountingBooks } from "@/components/financeiro/accounting-books";
import { AccountingPage } from "@/components/financeiro/control-pages";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await findCurrentUser();
  if (!user) redirect("/login");
  if (!isInternal(user.role)) redirect("/dashboard");
  return (
    <div className="space-y-8">
      <AccountingBooks />
      <div className="border-t border-slate-200 pt-8">
        <AccountingPage hideBackLinks />
      </div>
    </div>
  );
}
