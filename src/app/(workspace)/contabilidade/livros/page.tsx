import {findCurrentUser,isInternal} from "@/lib/auth";import {redirect} from "next/navigation";import {AccountingBooks} from "@/components/financeiro/accounting-books";
export const dynamic="force-dynamic";
export default async function Page(){const user=await findCurrentUser();if(!user)redirect("/login");if(!isInternal(user.role))redirect("/dashboard");return <AccountingBooks/>;}
