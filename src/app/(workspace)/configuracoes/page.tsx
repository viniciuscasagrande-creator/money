import {redirect} from "next/navigation";
import {findCurrentUser} from "@/lib/auth";
import {SettingsPage} from "@/components/financeiro/governance-pages";
export default async function Page(){const user=await findCurrentUser();if(!user||user.role!=="ADMIN")redirect("/dashboard");return <SettingsPage/>;}
