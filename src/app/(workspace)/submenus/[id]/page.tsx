import { redirect } from "next/navigation";
import { findCurrentUser } from "@/lib/auth";
import { resolveSubmenuOperationalRoute } from "@/config/submenu-routes";

export const dynamic = "force-dynamic";

export default async function SubmenuOperationalRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await findCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { id } = await params;
  const route = resolveSubmenuOperationalRoute(id);
  redirect(route.operationalHref);
}
