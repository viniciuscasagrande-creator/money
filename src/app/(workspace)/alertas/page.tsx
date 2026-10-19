import {redirect} from "next/navigation";
import {findCurrentUser} from "@/lib/auth";
import {AlertsPage} from "@/components/financeiro/intelligence";
export default async function Page(){const user=await findCurrentUser();if(!user||user.role==="PRODUCER")redirect("/dashboard");return <AlertsPage/>;}
