import { NextRequest, NextResponse } from "next/server";
import { authorize, fail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiCatch, accountInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
  if (error) return error;

  const [accounts, ledgerEntries] = await Promise.all([
    prisma.bankAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.ledgerEntry.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const items = accounts.map((a) => {
    const entries = ledgerEntries.filter((l) => l.bankAccountId === a.id);
    let openingCents = 0n;
    let creditsCents = 0n;
    let debitsCents = 0n;
    for (const e of entries) {
      if (e.direction === "CREDIT") {
        if (e.origin === "OPENING") {
          openingCents += e.amountCents;
        } else {
          creditsCents += e.amountCents;
        }
      } else {
        debitsCents += e.amountCents;
      }
    }
    const ledgerCents = openingCents + creditsCents - debitsCents;
    const diffCents = a.balanceCents - ledgerCents;

    return {
      ...a,
      balanceCents: a.balanceCents.toString(),
      openingCents: openingCents.toString(),
      creditsCents: creditsCents.toString(),
      debitsCents: debitsCents.toString(),
      ledgerCents: ledgerCents.toString(),
      diffCents: diffCents.toString(),
      entriesCount: entries.length,
      recentEntries: entries.slice(0, 5).map((e) => ({
        id: e.id,
        origin: e.origin,
        direction: e.direction,
        amountCents: e.amountCents.toString(),
        description: e.description,
        createdAt: e.createdAt.toISOString(),
      })),
      createdAt: a.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const { user, error } = await authorize(request, ["ADMIN", "FINANCE_DISK"]);
  if (error || !user) return error!;
  try {
    const input = accountInput.parse(await request.json());
    const balance = BigInt(input.initialBalanceCents);
    if (balance > 9999999999999999n) return fail("Saldo inicial acima do limite.");
    const account = await prisma.$transaction(async (tx) => {
      const acc = await tx.bankAccount.create({
        data: {
          name: input.name,
          institution: input.institution,
          lastFour: input.lastFour,
          balanceCents: balance,
        },
      });
      if (balance > 0n) {
        await tx.ledgerEntry.create({
          data: {
            bankAccountId: acc.id,
            origin: "OPENING",
            direction: "CREDIT",
            amountCents: balance,
            description: "Saldo inicial informado no cadastro da conta",
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          entity: "BankAccount",
          entityId: acc.id,
          action: "ACCOUNT_CREATED",
          summary: "Conta cadastrada com saldo inicial informado pelo operador.",
        },
      });
      return acc;
    });
    return NextResponse.json({ id: account.id }, { status: 201 });
  } catch (e) {
    const x = apiCatch(e);
    return fail(x.message, x.status);
  }
}
