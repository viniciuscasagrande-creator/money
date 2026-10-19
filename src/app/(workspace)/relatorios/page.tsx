import {redirect} from "next/navigation";
import {findCurrentUser} from "@/lib/auth";
import {ReportsPage} from "@/components/financeiro/intelligence";
export default async function Page(){const user=await findCurrentUser();if(!user)redirect("/login");return <ReportsPage/>;}
