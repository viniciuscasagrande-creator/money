import { redirect } from "next/navigation";
import { findCurrentUser } from "@/lib/auth";
import { WorkspaceShell } from "@/components/financeiro/shell";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await findCurrentUser();
  if (!user) redirect("/login");
  return <WorkspaceShell user={{ name: user.name, email: user.email, role: user.role }}>{children}</WorkspaceShell>;
}
