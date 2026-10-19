import {findCurrentUser,isInternal} from "@/lib/auth";
import {redirect} from "next/navigation";
import {ContractsPage} from "@/components/financeiro/control-pages";
export const dynamic="force-dynamic";
export default async function Page(){const user=await findCurrentUser();if(!user)redirect("/login");if(!isInternal(user.role))redirect("/dashboard");return <ContractsPage/>;}
