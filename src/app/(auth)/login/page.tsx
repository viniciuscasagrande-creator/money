import { redirect } from "next/navigation";
import { findCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/financeiro/login";
export default async function LoginPage() { if (await findCurrentUser()) redirect("/dashboard"); return <LoginForm />; }
