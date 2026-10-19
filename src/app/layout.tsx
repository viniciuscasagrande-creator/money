import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Financeiro | Pacote 02", description: "ERP financeiro com Next.js e Prisma" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
