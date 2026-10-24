import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  computeTotpCode,
  verifyTotpCode,
  enrollUserMfa,
  activateUserMfa,
  verifyUserMfaChallenge,
  issuePasswordResetToken,
  completePasswordReset,
  revokeUserSessions
} from "../src/lib/security-mfa";
import { evaluatePayoutLocksAndCeiling, PAYOUT_LOCK_CATALOG } from "../src/lib/control-math";
import { verifyBackupEnvelopeIntegrity, runAndRecordBackupVerification } from "../src/lib/backup-data";
import { checkOperationalHealth, recordIntegrationIncident } from "../src/lib/operational-monitoring";

test("Prioridade 6: todas as 20 travas do catálogo são executáveis e retornam classificação explícita", () => {
  const baseEval = evaluatePayoutLocksAndCeiling({
    settledProducerCents: 100_000n,
    mandatoryRetentionsCents: 10_000n,
    openRiskCents: 0n,
    previousPayoutsCents: 0n,
    soldPercentBps: 6000,
    salesTriggerBps: 5000
  });
  assert.equal(baseEval.evaluatedLocks.length, 20);
  assert.equal(baseEval.evaluatedLocks.length, PAYOUT_LOCK_CATALOG.length);
  assert.equal(baseEval.eligible, true);

  // Testar bloqueios das travas 05 (data-marco), 06 (horizonte), 11 (teto antecipação), 12 (score) e 16 (cooldown)
  const blockedEval = evaluatePayoutLocksAndCeiling({
    settledProducerCents: 100_000n,
    mandatoryRetentionsCents: 10_000n,
    openRiskCents: 0n,
    previousPayoutsCents: 0n,
    soldPercentBps: 6000,
    salesTriggerBps: 5000,
    nowIso: "2026-10-20T12:00:00.000Z",
    releaseGateDateIso: "2026-11-01T00:00:00.000Z",
    daysUntilEvent: 120,
    maxHorizonDays: 90,
    advanceCommittedCents: 50_000n,
    maxAdvanceCents: 30_000n,
    producerHistoryScore: 40,
    minProducerHistoryScore: 65,
    hoursSinceLastRequest: 4,
    minCooldownHours: 24
  });

  assert.equal(blockedEval.eligible, false);
  assert.equal(blockedEval.maxNewRequestCents, 0n);
  const byCode = Object.fromEntries(blockedEval.evaluatedLocks.map((l) => [l.code, l]));
  assert.equal(byCode.EVENT_DATE_GATE.status, "BLOCKED");
  assert.equal(byCode.EVENT_HORIZON_LIMIT.status, "BLOCKED");
  assert.equal(byCode.ADVANCE_LIMIT_CAP.status, "BLOCKED");
  assert.equal(byCode.FINANCIAL_HISTORY_SCORE.status, "BLOCKED");
  assert.equal(byCode.REQUEST_FREQUENCY_COOLDOWN.status, "BLOCKED");
});

test("Etapa 2 (Prioridades 3, 4, 5) e Melhorias Funcionais (Prioridades 7, 8 e Fechamento por Evento)", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "money-etapa2-"));
  const dbFile = path.join(dir, "etapa2.db");
  const url = `file:${dbFile.replaceAll("\\", "/")}`;
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  fs.writeFileSync(dbFile, "", { flag: "wx" });
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema=prisma/schema.prisma"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }
  );

  const { prisma: db } = await import("../src/lib/prisma");
  const { settleTitle } = await import("../src/lib/finance");
  const { importIntegratedTicketingSale, processIntegrationWithResilience, reprocessFailedIntegration, getIntegrationQueueSummary } = await import("../src/lib/ticketing-import");
  const { buildEventClosingPosition, executeAuditedEventClosing } = await import("../src/lib/event-closing");

  try {
    const admin = await db.user.create({
      data: { name: "Admin Etapa 2", email: "admin.etapa2@soul.local", passwordHash: "hash", role: "ADMIN", active: true }
    });
    const sessionUser = { id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: true, producerId: null };

    await t.test("Prioridade 3: MFA TOTP, códigos de recuperação, redefinição de senha e revogação de sessões", async () => {
      const enrolled = await enrollUserMfa(db, admin.id, admin.id);
      assert.equal(enrolled.recoveryCodes.length, 8);
      const validCode = computeTotpCode(enrolled.secret);
      assert.equal(verifyTotpCode(enrolled.secret, validCode), true);

      const activated = await activateUserMfa(db, admin.id, validCode, admin.id);
      assert.equal(activated.enabled, true);

      const totpVerify = await verifyUserMfaChallenge(db, admin.id, validCode);
      assert.equal(totpVerify.valid, true);
      assert.equal(totpVerify.usedRecoveryCode, false);

      const recVerify = await verifyUserMfaChallenge(db, admin.id, enrolled.recoveryCodes[0]!);
      assert.equal(recVerify.valid, true);
      assert.equal(recVerify.usedRecoveryCode, true);

      // Mesmo código de recuperação não pode ser usado duas vezes
      const recReplay = await verifyUserMfaChallenge(db, admin.id, enrolled.recoveryCodes[0]!);
      assert.equal(recReplay.valid, false);

      // Criar sessões e testar recuperação de senha que encerra sessões
      await db.session.create({
        data: { userId: admin.id, tokenHash: "a".repeat(64), expiresAt: new Date(Date.now() + 3600_000) }
      });
      await db.session.create({
        data: { userId: admin.id, tokenHash: "b".repeat(64), expiresAt: new Date(Date.now() + 3600_000) }
      });

      const resetReq = await issuePasswordResetToken(db, admin.email, admin.id);
      const resetDone = await completePasswordReset(db, resetReq.resetToken, "NovaSenhaForte#2026!");
      assert.equal(resetDone.revokedSessionsCount, 2);
      assert.equal(await db.session.count({ where: { userId: admin.id } }), 0);

      // Revogação seletiva de sessões
      const s1 = await db.session.create({
        data: { userId: admin.id, tokenHash: "c".repeat(64), expiresAt: new Date(Date.now() + 3600_000) }
      });
      await db.session.create({
        data: { userId: admin.id, tokenHash: "d".repeat(64), expiresAt: new Date(Date.now() + 3600_000) }
      });
      const revOther = await revokeUserSessions(db, sessionUser, {
        scope: "OTHER_SESSIONS",
        currentTokenHash: s1.tokenHash
      });
      assert.equal(revOther.revokedCount, 1);
      assert.equal(await db.session.count({ where: { userId: admin.id } }), 1);
    });

    await t.test("Prioridade 7: Venda integrada de ponta a ponta com taxas, spread, antecipação, rebate e memória histórica", async () => {
      const integrated = await importIntegratedTicketingSale(
        {
          operation: "INTEGRATED_SALE",
          externalReference: "INT-SALE-E2E-001",
          producerName: "Produtora Integrada S/A",
          producerDocument: "12345678000199",
          eventName: "Festival Integrado 2026",
          gatewayName: "Stone",
          brandName: "Visa",
          installments: 3,
          unitPriceCents: "50000",
          quantity: 2,
          mdrRateBps: 300,
          feeMode: "PERCENT_BPS",
          feeValue: "1000",
          producerPaysMdr: true,
          channel: "ONLINE",
          costBearer: "PRODUCER",
          spreadBps: 150,
          advancedBps: 100,
          rebateBps: 500
        },
        admin.id
      );

      assert.equal(integrated.ok, true);
      assert.equal(integrated.duplicate, false);
      assert.equal(integrated.operation, "INTEGRATED_SALE");
      assert.equal(integrated.grossCents, "100000");
      assert.ok(integrated.saleId);
      assert.ok(integrated.calculationMemory);
      // Bruto = 100000; MDR = 3000; Taxa SOUL = 10000; Spread = 1500; Advanced = 1000; Rebate (5% de MDR 3000) = 150
      // Produtor líquido = 100000 - 10000 - 3000 - 1500 - 1000 = 84500
      assert.equal(integrated.producerNetCents, "84500");
      // Resultado SOUL = 10000 + 1500 + 1000 + 150 = 12650
      assert.equal(integrated.diskNetCents, "12650");
      // Liquidação adquirente = 100000 - 3000 + 150 = 97150 (84500 + 12650 = 97150)
      assert.equal(integrated.netSettlementCents, "97150");

      // Idempotência no reenvio
      const duplicate = await importIntegratedTicketingSale(
        {
          operation: "INTEGRATED_SALE",
          externalReference: "INT-SALE-E2E-001",
          producerName: "Produtora Integrada S/A",
          producerDocument: "12345678000199",
          eventName: "Festival Integrado 2026",
          gatewayName: "Stone",
          brandName: "Visa",
          installments: 3,
          unitPriceCents: "50000",
          quantity: 2,
          mdrRateBps: 300,
          feeMode: "PERCENT_BPS",
          feeValue: "1000",
          producerPaysMdr: true,
          channel: "ONLINE",
          costBearer: "PRODUCER",
          spreadBps: 150,
          advancedBps: 100,
          rebateBps: 500
        },
        admin.id
      );
      assert.equal(duplicate.duplicate, true);
      assert.equal(duplicate.saleId, integrated.saleId);
    });

    await t.test("Prioridade 4 e 5: Monitoramento de divergências de saldo e Backup assinado com verificação relacional", async () => {
      const healthBefore = await checkOperationalHealth(db);
      assert.equal(healthBefore.summary.bankDivergencesCount, 0);
      assert.equal(healthBefore.summary.saleTitleDivergencesCount, 0);

      // Registrar incidente de integração e verificar detecção
      await recordIntegrationIncident(db, {
        provider: "ticketing",
        externalReference: "BAD-REF-99",
        reason: "Payload inválido rejeitado na borda",
        actorId: admin.id
      });
      const healthWithIncident = await checkOperationalHealth(db);
      assert.equal(healthWithIncident.summary.unresolvedIntegrationIncidentsCount, 1);

      // Verificar backup assinado e detecção de adulteração
      const { certificate, envelope } = await runAndRecordBackupVerification(db, admin.id);
      assert.equal(certificate.valid, true);
      assert.equal(certificate.modelCount, 40);
      assert.ok(certificate.referentialLinksChecked > 0);

      const tampered: typeof envelope = JSON.parse(JSON.stringify(envelope));
      tampered.dump.totalRows += 1;
      assert.throws(() => verifyBackupEnvelopeIntegrity(tampered), /Integridade do backup reprovada/);
    });

    await t.test("Prioridade 8 e Destaque 3: Fechamento por Evento bloqueia pendências e emite certificado auditado após liquidação", async () => {
      const event = await db.event.findFirstOrThrow({ where: { name: "Festival Integrado 2026" } });
      const sale = await db.financialSale.findFirstOrThrow({ where: { eventId: event.id } });

      // Antes de liquidar a venda e contabilizar, o fechamento deve apontar pendências explícitas
      const openPos = await buildEventClosingPosition(db, event.id);
      assert.equal(openPos.finalPosition.readyToClose, false);
      assert.ok(openPos.finalPosition.closingBlockers.length >= 2);
      await assert.rejects(
        () => executeAuditedEventClosing(db, { eventId: event.id, notes: "Tentativa prematura" }, sessionUser),
        /Fechamento bloqueado por pendências abertas/
      );

      // Liquidar título da venda, quitar repasse do produtor e contabilizar eventos
      const bank = await db.bankAccount.create({ data: { name: "Conta Fechamento", institution: "Banco Teste" } });
      await settleTitle(sale.receivableTitleId, bank.id, sessionUser);

      // Contabilizar os eventos contábeis do evento
      await db.accountingBusinessEvent.updateMany({
        where: { eventId: event.id },
        data: { status: "POSTED" }
      });

      // Fechar evento com autorização de saldo residual justificado pelo ADMIN
      const closed = await executeAuditedEventClosing(
        db,
        {
          eventId: event.id,
          notes: "Fechamento auditado após liquidação integral das vendas e conciliação contábil.",
          allowResidualBalanceWithJustification: true
        },
        sessionUser
      );
      assert.equal(closed.status, "CLOSED");
      assert.equal(closed.certificate.statementHash.length, 64);

      const afterClosePos = await buildEventClosingPosition(db, event.id);
      assert.equal(afterClosePos.eventStatus, "CLOSED");
      assert.ok(afterClosePos.closingCertificate);
    });

    await t.test("Pacote 3: Integrações resilientes registram falha na fila com backoff e permitem reprocessamento sem duplicação", async () => {
      // Enviar pedido contra evento encerrado ("Festival Integrado 2026") para provocar falha controlada na fila
      await assert.rejects(
        () =>
          processIntegrationWithResilience(
            {
              externalReference: "RESILIENT-QUEUE-001",
              producerName: "Produtora Integrada S/A",
              producerDocument: "12345678000199",
              eventName: "Festival Integrado 2026",
              description: "Pedido em evento já fechado",
              amountCents: "15000"
            },
            admin.id
          ),
        /Evento encerrado/
      );

      const qBefore = await getIntegrationQueueSummary();
      assert.equal(qBefore.failedCount, 1);
      const failedItem = qBefore.items.find((i) => i.externalReference === "RESILIENT-QUEUE-001");
      assert.ok(failedItem);
      assert.equal(failedItem.attempts, 1);
      assert.ok(failedItem.nextRetryAt);

      // Reprocessar apontando para evento ativo ("Festival Integrado 2027") e confirmar que passa para PROCESSED sem duplicar
      const reprocessed = await reprocessFailedIntegration("RESILIENT-QUEUE-001", admin.id, {
        eventName: "Festival Integrado 2027"
      });
      assert.equal(reprocessed.ok, true);
      assert.equal(reprocessed.duplicate, false);

      const qAfter = await getIntegrationQueueSummary();
      const processedItem = qAfter.items.find((i) => i.externalReference === "RESILIENT-QUEUE-001");
      assert.ok(processedItem);
      assert.equal(processedItem.status, "PROCESSED");
      assert.equal(processedItem.attempts, 2);
    });
  } finally {
    await db.$disconnect();
    process.env.DATABASE_URL = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
