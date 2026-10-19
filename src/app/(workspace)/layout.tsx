import { redirect } from "next/navigation";
import { findCurrentUser } from "@/lib/auth";
import { capabilityList } from "@/lib/governance";
import { WorkspaceShell } from "@/components/financeiro/shell";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await findCurrentUser();
  if (!user) redirect("/login");
  const capabilities = await capabilityList(user);
  return <WorkspaceShell user={{ name: user.name, email: user.email, role: user.role }} capabilities={capabilities}>{children}</WorkspaceShell>;
}
