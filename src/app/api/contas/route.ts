import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch, accountInput } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error) return error;
  const accounts = await prisma.bankAccount.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items: accounts.map(a => ({ ...a, balanceCents: a.balanceCents.toString(), createdAt: a.createdAt.toISOString() })) });
}
export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]); if (error || !user) return error!;
  try {
    const input = accountInput.parse(await request.json());
    const balance = BigInt(input.initialBalanceCents);
    if (balance > 9999999999999999n) return fail("Saldo inicial acima do limite.");
    const account = await prisma.$transaction(async tx => {
      const acc = await tx.bankAccount.create({ data: { name: input.name, institution: input.institution, lastFour: input.lastFour, balanceCents: balance } });
      if (balance > 0n) await tx.ledgerEntry.create({ data: { bankAccountId: acc.id, origin: "OPENING", direction: "CREDIT", amountCents: balance, description: "Saldo inicial informado no cadastro da conta" } });
      await tx.auditLog.create({ data: { actorId: user.id, entity: "BankAccount", entityId: acc.id, action: "ACCOUNT_CREATED", summary: "Conta cadastrada com saldo inicial informado pelo operador." } });
      return acc;
    });
    return NextResponse.json({ id: account.id }, { status: 201 });
  } catch (e) { const x = apiCatch(e); return fail(x.message, x.status); }
}
