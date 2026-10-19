import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePostings,
  currencyCents,
  periodName,
  buildMultiPartSalePostings,
  SoulAccountingEngine,
  ErroContabil
} from "../src/lib/accounting-core";

function createTestEngine() {
  const m = new SoulAccountingEngine();
  const prodId = m.cadastrarProdutor({ nome: "Prod", comissaoBps: 1000, prazoRepasseDias: 5 });
  const evId = m.cadastrarEvento({ produtorId: prodId, nome: "Show", dataEvento: "2026-12-10" });
  const centro = `EVT:${evId}`;
  const online = (kw?: Partial<Parameters<SoulAccountingEngine["vender"]>[0]>) =>
    m.vender({
      eventoId: evId,
      canal: "ONLINE",
      forma: "credito",
      ingresso: 9000,
      taxaServico: 1000,
      data: "2026-10-19",
      nsu: "N1",
      ...kw
    });
  return { m, prodId, evId, centro, online };
}

test("partidas balanceadas", () =>
  assert.equal(
    validatePostings([
      { accountId: "a", debitCents: 100n, creditCents: 0n },
      { accountId: "b", debitCents: 0n, creditCents: 100n }
    ]).debit,
    100n
  ));

test("partidas desbalanceadas", () =>
  assert.throws(() =>
    validatePostings([
      { accountId: "a", debitCents: 100n, creditCents: 0n },
      { accountId: "b", debitCents: 0n, creditCents: 99n }
    ])
  ));

test("valor em centavos", () => {
  assert.equal(currencyCents("1234"), 1234n);
  assert.throws(() => currencyCents("12.34"));
});

test("competência em UTC", () => assert.equal(periodName(new Date("2026-10-19T00:00:00Z")), "2026-10"));

test("múltiplas partidas de venda (MDR + Taxa SOUL + Spread + Obrigação Produtor + Retenção)", () => {
  const postings = buildMultiPartSalePostings({
    receivableAccountId: "1.1.02.001",
    gatewayExpenseAccountId: "4.1.01.001",
    soulRevenueAccountId: "3.1.01.001",
    soulSpreadAccountId: "3.1.01.002",
    producerPayableAccountId: "2.1.01.001",
    retentionReserveAccountId: "2.1.01.002",
    netSettlementCents: 10945n,
    gatewayFeeCents: 555n,
    soulFeeCents: 1000n,
    spreadCents: 500n,
    producerNetCents: 10000n,
    retentionHeldCents: 2000n
  });
  assert.equal(postings.length, 6);
  const summary = validatePostings(postings);
  assert.equal(summary.debit, 11500n);
  assert.equal(summary.credit, 11500n);
});

// ============================================================================
// Suíte Completa Portada para TypeScript (M1 a M10 + 4 Ajustes SOUL v4.4)
// ============================================================================

test("TestVendas: venda online lançamento, idempotência, dinheiro exige bilheteria/caixa, NSU obrigatório e parcelas somam bruto", () => {
  const { m, evId, centro, online } = createTestEngine();
  online();
  assert.equal(m.saldo("1.1.04"), 10000); // a receber do gateway
  assert.equal(m.saldo("2.1.01", centro), 8100); // 9000 - 10% comissão
  assert.equal(m.saldo("2.1.02", centro), 1900); // taxa 1000 + comissão 900

  // Idempotência por chave
  const { m: m2, online: online2 } = createTestEngine();
  const a = online2({ chave: "wh-1" });
  const b = online2({ chave: "wh-1" });
  assert.equal(a, b);
  assert.equal(m2.saldo("1.1.04"), 10000);

  // Dinheiro exige canal BILHETERIA e caixa aberto
  assert.throws(() => online({ forma: "dinheiro" }), ErroContabil);
  assert.throws(
    () => m.vender({ eventoId: evId, canal: "BILHETERIA", forma: "dinheiro", ingresso: 5000, data: "2026-10-19" }),
    ErroContabil
  );

  // NSU obrigatório em vendas eletrônicas
  assert.throws(() => online({ nsu: null }), ErroContabil);

  // Parcelas somam o bruto com absorção de arredondamento na última parcela
  const vid = online({ parcelas: 3, nsu: "N2" });
  const rs = m.listarRecebiveisPorVenda(vid);
  assert.equal(rs.length, 3);
  assert.equal(
    rs.reduce((acc, r) => acc + r.bruto, 0),
    10000
  );
  assert.equal(m.balancete().fecha, true);
});

test("TestMotor: bloqueia lançamento desbalanceado, conta sintética, estorno duplo e período fechado", () => {
  const { m, online } = createTestEngine();
  assert.throws(
    () =>
      m.lancar("2026-10-19", "x", [
        ["1.1.02", 100, 0, null],
        ["3.1.01", 0, 90, null]
      ]),
    ErroContabil
  );
  assert.throws(
    () =>
      m.lancar("2026-10-19", "x", [
        ["1.1", 100, 0, null],
        ["3.1.01", 0, 100, null]
      ]),
    ErroContabil
  );

  online();
  const estId1 = m.estornar(1, "2026-10-20", "teste");
  assert.equal(m.saldo("1.1.04"), 0);
  const estId2 = m.estornar(1, "2026-10-20", "teste");
  assert.equal(estId1, estId2); // Idempotência do estorno

  m.fecharPeriodo("2026-10");
  assert.throws(() => online({ nsu: "N3" }), ErroContabil);
  assert.equal(m.balancete().fecha, true);
});

test("TestCaixa: abertura com troco, venda em dinheiro, sangria, fechamento com quebra e segregação de operador, depósito bancário", () => {
  const { m, evId } = createTestEngine();
  const cx = m.abrirCaixa("ana", "T1", "2026-12-10", 10000);
  m.vender({
    eventoId: evId,
    canal: "BILHETERIA",
    forma: "dinheiro",
    ingresso: 9000,
    data: "2026-10-20",
    caixaId: cx
  });
  m.sangriaCaixa(cx, 5000, "2026-10-20");

  // Mesmo operador não pode fechar o próprio caixa (segregação de funções)
  assert.throws(() => m.fecharCaixa(cx, "ana", 14000, "2026-10-20"), ErroContabil);

  const dif = m.fecharCaixa(cx, "bruno", 13995, "2026-10-20"); // esperado 14000 -> falta 5
  assert.equal(dif, -5);
  assert.equal(m.saldo("4.1.04"), 5); // Quebra de caixa
  assert.equal(m.saldo("1.1.01"), 13995); // 10000 troco + 9000 venda - 5000 sangria - 5 quebra
  m.depositarCaixa(5000, "2026-10-21", "DEP1");
  assert.equal(m.saldo("1.1.06"), 0); // Valores em trânsito zerados após depósito
  assert.equal(m.balancete().fecha, true);
});

test("TestConciliacaoEFluxo: conciliação PagSeguro (CONCILIADO, DIVERGENTE, SEM_VENDA, SEM_RECEBIMENTO, DUPLICADO) e antecipação", () => {
  const { m, evId } = createTestEngine();
  const a = m.vender({ eventoId: evId, canal: "POS", forma: "credito", ingresso: 10000, data: "2026-10-20", nsu: "P1" });
  const b = m.vender({ eventoId: evId, canal: "POS", forma: "debito", ingresso: 5000, data: "2026-10-20", nsu: "P2" });
  const ra = m.listarRecebiveisPorVenda(a)[0];
  const rb = m.listarRecebiveisPorVenda(b)[0];
  const extrato = [
    { nsu: "P1", parcela: 1, bruto: ra.bruto, mdr: ra.mdrPrevisto, data_liquidacao: "2026-11-19" },
    { nsu: "P2", parcela: 1, bruto: rb.bruto, mdr: rb.mdrPrevisto + 10, data_liquidacao: "2026-10-21" },
    { nsu: "XX", parcela: 1, bruto: 100, mdr: 4, data_liquidacao: "2026-10-21" }
  ];
  const r = m.conciliar("PAGSEGURO", extrato, "2026-11-30");
  assert.equal(r.resumo.CONCILIADO, 1);
  assert.equal(r.resumo.DIVERGENTE, 1);
  assert.equal(r.resumo.SEM_VENDA, 1);
  assert.equal(m.saldo("1.1.03"), 5000); // P2 ainda não baixado
  assert.equal(m.saldo("4.1.01"), ra.mdrPrevisto);
  const cid = m.listarConciliacoesPorStatus("DIVERGENTE")[0].id;
  m.aceitarDivergencia(cid, "maria");
  assert.equal(m.saldo("1.1.03"), 0);
  assert.equal(m.saldo("4.1.01"), ra.mdrPrevisto + rb.mdrPrevisto + 10);
  assert.equal(m.balancete().fecha, true);

  // Sem recebimento e duplicado
  const { m: m2, evId: evId2 } = createTestEngine();
  m2.vender({ eventoId: evId2, canal: "POS", forma: "debito", ingresso: 5000, data: "2026-10-20", nsu: "P2" });
  const rSem = m2.conciliar("PAGSEGURO", [], "2026-10-30");
  assert.equal(rSem.resumo.SEM_RECEBIMENTO, 1);
  const rb2 = m2.listarTodosRecebiveis()[0];
  const ln = { nsu: "P2", parcela: 1, bruto: rb2.bruto, mdr: rb2.mdrPrevisto, data_liquidacao: "2026-10-21" };
  m2.conciliar("PAGSEGURO", [ln], "2026-10-30");
  const rDup = m2.conciliar("PAGSEGURO", [ln], "2026-10-30");
  assert.equal(rDup.resumo.DUPLICADO, 1);
  assert.equal(m2.saldo("4.1.01"), rb2.mdrPrevisto);
  assert.equal(m2.balancete().fecha, true);

  // Antecipação
  const { m: m3, evId: evId3 } = createTestEngine();
  m3.vender({ eventoId: evId3, canal: "POS", forma: "credito", ingresso: 10000, data: "2026-10-20", nsu: "P1", parcelas: 2 });
  const ids = m3.listarTodosRecebiveis().map((x) => x.id);
  m3.anteciparRecebiveis(ids, "2026-10-21", 200);
  assert.ok(m3.saldo("4.1.02") > 0);
  assert.equal(m3.saldo("1.1.03"), 0);
  assert.deepEqual(m3.fluxoProjetado(), []);
  assert.equal(m3.balancete().fecha, true);
});

test("TestReembolsoChargebackRepasse: reembolso antes/após evento, chargeback ganho/perdido, repasse D+5 e cancelamento de evento", () => {
  // Reembolso pendente
  const { m, centro, online } = createTestEngine();
  const vid = online();
  m.reembolsar(vid, "2026-10-21", "arrependimento");
  assert.equal(m.saldo("1.1.04"), 0);
  assert.equal(m.saldo("2.1.01", centro), 0);
  assert.equal(m.saldo("2.1.02", centro), 0);
  assert.throws(() => m.reembolsar(vid, "2026-10-21", "de novo"), ErroContabil);
  assert.equal(m.balancete().fecha, true);

  // Reembolso após realização vai para deduções e reverte impostos
  const { m: m2, evId: evId2, online: online2 } = createTestEngine();
  const vid2 = online2({ forma: "pix", nsu: "PX" });
  m2.realizarEvento(evId2, "2026-12-10");
  assert.equal(m2.saldo("3.1.01"), 1900);
  assert.equal(m2.saldo("2.1.03"), 95 + 12 + 57); // ISS + PIS + COFINS sobre 1900
  m2.reembolsar(vid2, "2026-12-11", "evento ruim");
  assert.equal(m2.saldo("2.1.03"), 0);
  assert.equal(m2.saldo("3.2.01"), 1900);
  assert.equal(m2.dre(evId2).resultado, 0);
  assert.equal(m2.balancete().fecha, true);

  // Chargeback perdido e ganho
  const { m: m3, centro: centro3, online: online3 } = createTestEngine();
  const v1 = online3({ nsu: "A", forma: "pix" });
  const v2 = online3({ nsu: "B", forma: "pix" });
  const rec = m3.listarRecebiveisPorVenda(v1)[0];
  m3.conciliar(
    "GATEWAY",
    [{ nsu: "A", parcela: 1, bruto: rec.bruto, mdr: rec.mdrPrevisto, data_liquidacao: "2026-10-20" }],
    "2026-10-20"
  );
  const cb1 = m3.abrirChargeback(v1, "2026-11-01");
  const cb2 = m3.abrirChargeback(v2, "2026-11-01");
  assert.equal(m3.saldo("1.1.05"), 20000);
  m3.resolverChargeback(cb1, "2026-11-20", true);
  m3.resolverChargeback(cb2, "2026-11-20", false);
  assert.equal(m3.saldo("1.1.05"), 0);
  assert.equal(m3.saldo("2.1.01", centro3), 8100);
  assert.equal(m3.listarRecebiveisPorVenda(v2)[0].status, "PENDENTE");
  assert.equal(m3.balancete().fecha, true);

  // Repasse fluxo completo pós-evento D+5 com segregação de funções
  const { m: m4, evId: evId4, centro: centro4, online: online4 } = createTestEngine();
  online4({ forma: "pix", nsu: "PX" });
  m4.vender({ eventoId: evId4, canal: "POS", forma: "credito", ingresso: 10000, data: "2026-10-20", nsu: "P1" });
  assert.throws(() => m4.apurarRepasse(evId4, "ana", "2026-12-20"), ErroContabil); // evento ainda não realizado
  m4.realizarEvento(evId4, "2026-12-10");
  assert.throws(() => m4.apurarRepasse(evId4, "ana", "2026-12-12"), ErroContabil); // D+5 não venceu
  const rid = m4.apurarRepasse(evId4, "ana", "2026-12-15");
  assert.throws(() => m4.pagarRepasse(rid, "ana", "2026-12-15"), ErroContabil); // segregação de funções
  m4.pagarRepasse(rid, "bruno", "2026-12-15");
  assert.equal(m4.demonstrativoRepasse(evId4).saldoARepassar, 0);
  assert.equal(m4.saldo("2.1.01", centro4), 0);
  assert.equal(m4.passivoProdutores()[centro4], 0);
  assert.equal(m4.balancete().fecha, true);

  // Cancelamento de evento
  const { m: m5, evId: evId5, centro: centro5, online: online5 } = createTestEngine();
  online5({ forma: "pix", nsu: "PX" });
  const cx5 = m5.abrirCaixa("ana", "T1", "2026-10-19");
  m5.vender({ eventoId: evId5, canal: "BILHETERIA", forma: "dinheiro", ingresso: 5000, data: "2026-10-19", caixaId: cx5 });
  const n = m5.cancelarEvento(evId5, "2026-10-25", "evento cancelado", cx5);
  assert.equal(n, 2);
  assert.equal(m5.saldo("2.1.01", centro5), 0);
  assert.equal(m5.saldo("1.1.01"), 0);
  assert.equal(m5.balancete().fecha, true);
});

test("Ajustes SOUL v4.4: Tributação Parametrizável, Retenções Obrigatórias (ECAD), Repasse Parcial Antes do Evento com Travas e Transferência Entre Eventos sem Receita Adicional", () => {
  const { m, prodId, evId, centro, online } = createTestEngine();
  const ev2Id = m.cadastrarEvento({ produtorId: prodId, nome: "Show 2", dataEvento: "2026-12-20" });
  const centro2 = `EVT:${ev2Id}`;

  // Ajuste 1: Parametrização dinâmica de alíquotas pelo contador (ex.: ISS 2%, PIS 0,65%, COFINS 3%)
  m.configurarTributos({ ISS: 200, PIS: 65, COFINS: 300 });

  // Venda no Evento 1 (líquido produtor = 8100, receita diferida = 1900)
  online({ nsu: "N-SOUL-1" });
  online({ nsu: "N-SOUL-2" }); // Total 2.1.01 [EVT:1] = 16200, Total 2.1.02 [EVT:1] = 3800

  // Ajuste 4: Retenção obrigatória de ECAD (3200 centavos) reduz saldo livre 2.1.01 e provisiona em 2.1.04
  m.constituirRetencaoObrigatoria({
    eventoId: evId,
    categoria: "ECAD",
    descricao: "Retenção obrigatória ECAD",
    valor: 3200,
    data: "2026-10-20"
  });
  assert.equal(m.saldo("2.1.01", centro), 13000); // 16200 - 3200 ECAD = 13000 livres
  assert.equal(m.saldo("2.1.04", centro), 3200); // 3200 protegidos em retenções obrigatórias

  // Ajuste 2: Liberação parcial antecipada antes do evento respeitando o teto das Travas de Repasse (ex.: 20% = 2600)
  m.configurarTetoTravaEvento(evId, 2600);
  assert.throws(
    () => m.apurarRepasse(evId, "financeiro1", "2026-10-21", { valor: 3000, antecipado: true }),
    ErroContabil
  );
  const repParcialId = m.apurarRepasse(evId, "financeiro1", "2026-10-21", { valor: 2600, antecipado: true });
  m.pagarRepasse(repParcialId, "financeiro2", "2026-10-21");
  assert.equal(m.saldo("2.1.01", centro), 10400); // 13000 - 2600 repassados = 10400

  // Ajuste 3: Transferência contábil entre eventos do mesmo produtor (EVT:1 -> EVT:2) sem gerar receita adicional
  assert.throws(
    () =>
      m.transferirSaldoEntreEventos({
        eventoOrigemId: evId,
        eventoDestinoId: ev2Id,
        valor: 4000,
        data: "2026-10-22",
        motivo: "Locação Show 2"
      }),
    ErroContabil // Bloqueado enquanto permissão não habilitada pelo Financeiro SOUL
  );
  m.configurarPermissaoProdutor(prodId, true);
  m.transferirSaldoEntreEventos({
    eventoOrigemId: evId,
    eventoDestinoId: ev2Id,
    valor: 4000,
    data: "2026-10-22",
    motivo: "Locação Show 2"
  });
  assert.equal(m.saldo("2.1.01", centro), 6400); // 10400 - 4000 = 6400
  assert.equal(m.saldo("2.1.01", centro2), 4000); // 0 + 4000 = 4000
  assert.equal(m.saldo("3.1.01"), 0); // Nenhuma receita nova foi criada pela transferência!

  // Realização do Evento 1 aplica as alíquotas parametrizadas (ISS 2% = 76, PIS 0,65% = 24, COFINS 3% = 114 sobre 3800)
  m.realizarEvento(evId, "2026-12-10");
  assert.equal(m.saldo("3.1.01", centro), 3800);
  assert.equal(m.saldo("2.1.03", centro), 76 + 24 + 114);
  assert.equal(m.balancete().fecha, true);
});
