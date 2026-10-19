import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "ERP Financeiro | Fintech Premium", description: "ERP Financeiro com gestão integrada, painéis, conciliações e governança" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
