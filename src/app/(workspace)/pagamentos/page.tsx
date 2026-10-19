import { findCurrentUser } from "@/lib/auth";
import { TitlesPage } from "@/components/financeiro/titles";
export default async function Page() { const user = await findCurrentUser(); return <TitlesPage kind="PAYABLE" role={user?.role || "PRODUCER"}/>; }
