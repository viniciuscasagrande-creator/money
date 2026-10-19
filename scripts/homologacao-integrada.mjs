/**
 * Testes end-to-end de homologação: NUNCA EXECUTAR COM BANCO REAL.
 * Só opera em localhost, com autorização explícita e arquivo SQLite temporário.
 * Cria APENAS dados sintéticos em uma base isolada de testes.
 */
import assert from 'node:assert/strict';

const base = process.env.HOMOLOG_BASE_URL;
const db = process.env.DATABASE_URL || '';
if (process.env.ISOLATED_HOMOLOGATION !== 'SIM'
  || !base || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)
  || !/^file:\.\/homologacao-[a-f0-9-]{30,}\.db$/.test(db)) {
  console.error('BLOQUEADO: exige ISOLATED_HOMOLOGATION=SIM, URL local e banco SQLite TEMPORÁRIO homologacao-UUID.db.');
  process.exit(2);
}
const email = process.env.HOMOLOG_ADMIN_EMAIL;
const password = process.env.HOMOLOG_ADMIN_PASSWORD;
const producerPassword = process.env.HOMOLOG_PRODUCER_PASSWORD;
if (!email || !password || !producerPassword) throw new Error('Credenciais de testes não informadas.');

const checks = [];
const check = (name, fn) => { fn(); checks.push(name); console.log(`✓ ${name}`); };
const unique = `HML-${Date.now().toString(36)}`;
const admin = { cookie: '' }, finance = { cookie: '' }, a = { cookie: '' }, b = { cookie: '' };
async function req(path, method = 'GET', body, actor) {
  const r = await fetch(`${base}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(actor?.cookie ? { Cookie: actor.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await r.text(); let data;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 800) }; }
  return { status: r.status, headers: r.headers, data };
}
function expectStatus(response, status, description) {
  assert.equal(response.status, status, `${description}: HTTP ${response.status}: ${JSON.stringify(response.data)}`);
  return response.data;
}
async function create(path, payload, actor = admin) {
  return expectStatus(await req(path, 'POST', payload, actor), 201, `POST ${path}`);
}
async function action(id, actionName, payload, actor = admin, expectedStatus = 200) {
  return expectStatus(await req(`/api/repasses/${id}/acoes`, 'POST', { action: actionName, ...payload }, actor), expectedStatus, `AÇÃO ${actionName}`);
}
async function login(actor, loginEmail, loginPassword) {
  const res = await req('/api/auth/login', 'POST', { email: loginEmail, password: loginPassword });
  expectStatus(res, 200, `Login ${loginEmail}`);
  actor.cookie = res.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(actor.cookie.startsWith('disk_financeiro_session='), 'Cookie seguro de sessão ausente.');
}

try {
  expectStatus(await req('/api/dashboard'), 401, 'Dashboard anônimo');
  check('API exige autenticação', () => {});
  const csrf = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://atacante.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }) });
  check('Origem cruzada de login rejeitada', () => assert.equal(csrf.status, 403));

  await login(admin, email, password);
  check('Administrador autentica em sessão própria', () => assert.ok(admin.cookie));
  const producerA = await create('/api/admin/produtores', { name: `Produtor Teste A ${unique}` });
  const producerB = await create('/api/admin/produtores', { name: `Produtor Teste B ${unique}` });
  const eventA = await create('/api/admin/eventos', { name: `Evento A ${unique}`, producerId: producerA.id, status: 'ACTIVE' });
  const eventB = await create('/api/admin/eventos', { name: `Evento B ${unique}`, producerId: producerB.id, status: 'ACTIVE' });
  const aEmail = `prod-a-${unique.toLowerCase()}@example.invalid`;
  const bEmail = `prod-b-${unique.toLowerCase()}@example.invalid`;
  await create('/api/admin/usuarios', { name: 'Usuário Homologação A', email: aEmail, password: producerPassword, role: 'PRODUCER', producerId: producerA.id });
  await create('/api/admin/usuarios', { name: 'Usuário Homologação B', email: bEmail, password: producerPassword, role: 'PRODUCER', producerId: producerB.id });
  const financeEmail = `finance-${unique.toLowerCase()}@example.invalid`;
  await create('/api/admin/usuarios', { name: 'Financeiro de Homologação', email: financeEmail, password: producerPassword, role: 'FINANCE_DISK' });
  await login(finance, financeEmail, producerPassword);
  await login(a, aEmail, producerPassword);
  await login(b, bEmail, producerPassword);
  check('Financeiro Interno e produtores possuem sessões independentes' , () => assert.notEqual(a.cookie, b.cookie));
  const evsA = expectStatus(await req('/api/admin/eventos', 'GET', undefined, a), 200, 'Eventos produtor A').items;
  const evsB = expectStatus(await req('/api/admin/eventos', 'GET', undefined, b), 200, 'Eventos produtor B').items;
  check('Cada produtor consulta exclusivamente seus eventos', () => {
    assert.deepEqual(evsA.map(e => e.id), [eventA.id]);
    assert.deepEqual(evsB.map(e => e.id), [eventB.id]);
  });
  for (const path of ['/api/contas', '/api/financeiro/catalogo', '/api/financeiro/vendas', '/api/auditoria', '/api/admin/usuarios', '/api/controle/catalogo', '/api/controle/extratos', '/api/controle/riscos',
    '/api/controle/contratos', '/api/controle/orcamentos', '/api/controle/contabilidade?inicio=2026-01-01&fim=2026-03-01']) {
    expectStatus(await req(path, 'GET', undefined, a), 403, `${path} restrito`);
  }
  check('APIs de bancos, taxas, vendas, auditoria e usuários negadas ao produtor', () => {});
  expectStatus(await req('/api/admin/usuarios', 'GET', undefined, finance), 403, 'Financeiro sem gestão de usuários');
  expectStatus(await req('/api/auditoria', 'GET', undefined, finance), 403, 'Financeiro sem auditoria administrativa');
  check('Financeiro Interno não possui privilégio de Administrador', () => {});
  const conta = await create('/api/contas', { name: `Banco Teste ${unique}`, institution: 'INSTITUIÇÃO DE HOMOLOGAÇÃO', initialBalanceCents: '0' }, finance);
  const gateway = await create('/api/financeiro/gateways', { name: `Gateway ${unique}` }, finance);
  const bandeira = await create('/api/financeiro/bandeiras', { name: `Bandeira ${unique}` }, finance);
  const regra = expectStatus(await req('/api/financeiro/mdr', 'POST', { gatewayId: gateway.id, brandId: bandeira.id, installments: 1, rateBps: 250, fixedCents: '0' }, finance), 200, 'MDR financeiro');
  await expectStatus(await req('/api/financeiro/taxas', 'POST', { eventId: eventA.id, mode: 'PERCENT_BPS', value: '1000', producerPaysMdr: true }, finance), 200, 'Taxa do evento');
  const venda = await create('/api/financeiro/vendas', { externalReference: `${unique}-VENDA-1`, eventId: eventA.id,
    mdrRuleId: regra.id, unitPriceCents: '10000', quantity: 2 }, finance);
  const vendas = expectStatus(await req('/api/financeiro/vendas', 'GET', undefined, finance), 200, 'Venda interna').items;
  const calc = vendas.find(v => v.id === venda.id);
  check('Split da venda R$ 200,00 conserva MDR e parcelas', () => {
    assert.ok(calc, 'Venda não encontrada na consulta');
    assert.equal(calc.grossCents, '20000');
    assert.equal(calc.feeCents, '2000');
    assert.equal(calc.mdrCents, '500');
    assert.equal(calc.producerNetCents, '17500');
    assert.equal(calc.netSettlementCents, '19500');
  });
  const titleListA = expectStatus(await req('/api/recebimentos', 'GET', undefined, a), 200, 'Recebíveis A').items;
  check('Recebível da adquirente não é exposto ao produtor', () => assert.ok(!titleListA.some(t => t.id === venda.receivableTitleId)));
  const duplicateSale = await req('/api/financeiro/vendas', 'POST', { externalReference: `${unique}-VENDA-1`, eventId: eventA.id,
    mdrRuleId: regra.id, unitPriceCents: '10000', quantity: 2 }, finance);
  check('Referência de venda duplicada é rejeitada', () => assert.equal(duplicateSale.status, 409));

  const unavailable = await req('/api/repasses', 'POST', { eventId: eventA.id, type: 'REPASSE', amountCents: '100' }, a);
  check('Repasse não pode usar recebível ainda não liquidado', () => assert.equal(unavailable.status, 409));
  const otherEvent = await req('/api/repasses', 'POST', { eventId: eventA.id, type: 'ANTECIPACAO', amountCents: '100' }, b);
  check('Produtor B não cria antecipação no evento A', () => assert.equal(otherEvent.status, 409));

  const advance = await create('/api/repasses', { eventId: eventA.id, type: 'ANTECIPACAO', amountCents: '5000' }, a);
  await action(advance.id, 'APPROVE', {}, finance);
  const wrongAccept = await req(`/api/repasses/${advance.id}/acoes`, 'POST', { action: 'PRODUCER_ACCEPT' }, b);
  check('Produtor B não assina solicitação de A', () => assert.equal(wrongAccept.status, 409));
  const earlyFinance = await req(`/api/repasses/${advance.id}/acoes`, 'POST', { action: 'FINANCE_SIGN' }, finance);
  check('Financeiro não pode assinar antes do produtor', () => assert.equal(earlyFinance.status, 409));
  await action(advance.id, 'PRODUCER_ACCEPT', {}, a);
  const wrongFinance = await req(`/api/repasses/${advance.id}/acoes`, 'POST', { action: 'FINANCE_SIGN' }, a);
  check('Produtor não executa assinatura financeira', () => assert.equal(wrongFinance.status, 409));
  await action(advance.id, 'FINANCE_SIGN', {}, finance);
  check('Antecipação respeitou aprovação → produtor → Financeiro', () => {});
  const earlySettlement = await req(`/api/repasses/${advance.id}/acoes`, 'POST', { action: 'SETTLE', bankAccountId: conta.id, settlementReference: `${unique}-SEM-FUNDOS` }, finance);
  check('Antecipação sem caixa registrado não pode ser baixada', () => assert.equal(earlySettlement.status, 409));
  await expectStatus(await req(`/api/titulos/${venda.receivableTitleId}/liquidar`, 'POST', { bankAccountId: conta.id }, finance), 200, 'Liquidação recebível');
  const secondSettlement = await req(`/api/titulos/${venda.receivableTitleId}/liquidar`, 'POST', { bankAccountId: conta.id }, finance);
  check('Liquidação duplicada do recebível é bloqueada', () => assert.equal(secondSettlement.status, 409));
  const balanceA = expectStatus(await req('/api/saldos', 'GET', undefined, a), 200, 'Saldo produtor A');
  const payoutViewA = expectStatus(await req('/api/repasses', 'GET', undefined, a), 200, 'Solicitações produtor A');
  check('Taxas internas não vazam na API do produtor', () => {
    const serialized = JSON.stringify({ balanceA, payoutViewA });
    for (const confidential of ['feeCents', 'feeValueAtSale', 'diskNetCents', 'mdrRateBpsAtSale', 'producerPaysMdrAtSale'])
      assert.ok(!serialized.includes(confidential), `Campo interno exposto: ${confidential}`);
  });
  check('Saldo do produtor usa parcela liquidada, não caixa bancário', () => {
    assert.equal(balanceA.mode, 'PRODUCER_INFORMATIONAL');
    assert.equal(balanceA.items.length, 1);
    assert.equal(balanceA.items[0].settledCents, '17500');
    assert.equal(balanceA.items[0].committedCents, '5000');
    assert.equal(balanceA.items[0].repasseCents, '12500');
    assert.ok(!Object.hasOwn(balanceA.items[0], 'balanceCents'));
  });
  const payout = await create('/api/repasses', { eventId: eventA.id, type: 'REPASSE', amountCents: '12000' }, a);
  const excess = await req('/api/repasses', 'POST', { eventId: eventA.id, type: 'REPASSE', amountCents: '600' }, a);
  check('Reservas evitam ultrapassar o saldo de repasses', () => assert.equal(excess.status, 409));
  await action(payout.id, 'APPROVE', {}, finance);
  await action(payout.id, 'PRODUCER_ACCEPT', {}, a);
  await action(payout.id, 'FINANCE_SIGN', {}, finance);
  const payoutReceipt = `${unique}-COMPROVANTE-REPASSE`;
  await action(payout.id, 'SETTLE', { bankAccountId: conta.id, settlementReference: payoutReceipt }, finance);
  const duplicatePayout = await req(`/api/repasses/${payout.id}/acoes`, 'POST', { action: 'SETTLE', bankAccountId: conta.id, settlementReference: payoutReceipt }, admin);
  check('Baixa de repasse é idempotente por estado', () => assert.equal(duplicatePayout.status, 409));
  await action(advance.id, 'SETTLE', { bankAccountId: conta.id, settlementReference: `${unique}-COMPROVANTE-ANTECIP` }, finance);
  const bank = expectStatus(await req('/api/saldos', 'GET', undefined, finance), 200, 'Conciliação interna');
  const bankItem = bank.items.find(i => i.id === conta.id);
  check('Recebimento menos repasse e antecipação reconcilia o razão', () => {
    assert.equal(bankItem.balanceCents, '2500');
    assert.equal(bankItem.ledgerBalanceCents, '2500');
    assert.equal(bankItem.reconciled, true);
  });
  // Pacote 03: importação do extrato não movimenta caixa; conciliação exige correspondência 1:1.
  const todayForTests = new Date().toISOString().slice(0,10);
  const monthForTests = todayForTests.slice(0,7);
  const statement = await create('/api/controle/extratos', { bankAccountId:conta.id,
    externalId:`${unique}-EXTRATO-1`,date:todayForTests,description:'Crédito adquirente',direction:'CREDIT',amountCents:'19500' },finance);
  const statementList = expectStatus(await req('/api/controle/extratos','GET',undefined,finance),200,'Consultar extratos');
  const ledgerForCredit = statementList.ledger.find(x=>x.bankAccountId===conta.id&&x.direction==='CREDIT'&&x.amountCents==='19500');
  check('Extrato encontra lançamento elegível sem alterar saldos',()=>assert.ok(ledgerForCredit));
  const mismatch = await req('/api/controle/conciliar','POST',{statementId:statement.id,ledgerEntryId:statementList.ledger.find(x=>x.direction==='DEBIT').id},finance);
  check('Conciliação de sentidos diferentes é negada',()=>assert.equal(mismatch.status,409));
  expectStatus(await req('/api/controle/conciliar','POST',{statementId:statement.id,ledgerEntryId:ledgerForCredit.id},finance),200,'Conciliar banco');
  const duplicateMatch = await req('/api/controle/conciliar','POST',{statementId:statement.id,ledgerEntryId:ledgerForCredit.id},finance);
  check('Linha de extrato não pode ser conciliada duas vezes',()=>assert.equal(duplicateMatch.status,409));
  const duplicateStatement = await req('/api/controle/extratos','POST',{bankAccountId:conta.id,externalId:`${unique}-EXTRATO-1`,date:todayForTests,
    description:'Crédito adquirente',direction:'CREDIT',amountCents:'19500'},finance);
  check('Importação duplicada de extrato é rejeitada',()=>assert.equal(duplicateStatement.status,409));
  const bankAfterMatch = expectStatus(await req('/api/saldos','GET',undefined,finance),200,'Consultar banco depois da conciliação');
  check('Conciliação não altera saldo bancário',()=>assert.equal(bankAfterMatch.items.find(x=>x.id===conta.id).balanceCents,'2500'));

  const openRisk=await create('/api/controle/riscos',{saleId:venda.id,externalId:`${unique}-ESTORNO-ABERTO`,type:'REFUND',
    exposureCents:'300',reason:'Solicitação de contestação do cliente'},finance);
  const withHold=expectStatus(await req('/api/saldos','GET',undefined,a),200,'Saldo com bloqueio');
  check('Ocorrência aberta bloqueia direito disponível',()=>{
    assert.equal(withHold.items[0].blockedCents,'300');assert.equal(withHold.items[0].repasseCents,'200');
  });
  expectStatus(await req('/api/controle/risco-decisao','POST',{id:openRisk.id,decision:'REJECTED'},finance),200,'Rejeitar ocorrência');
  const withoutHold=expectStatus(await req('/api/saldos','GET',undefined,a),200,'Saldo após rejeitar');
  check('Rejeição libera reserva sem alteração bancária',()=>assert.equal(withoutHold.items[0].repasseCents,'500'));
  const confirmedRisk=await create('/api/controle/riscos',{saleId:venda.id,externalId:`${unique}-CHARGEBACK-CONFIRMADO`,type:'CHARGEBACK',
    exposureCents:'200',reason:'Contestação confirmada em ambiente de homologação'},finance);
  expectStatus(await req('/api/controle/risco-decisao','POST',{id:confirmedRisk.id,decision:'CONFIRMED'},finance),200,'Confirmar ocorrência');
  const confirmedBalance=expectStatus(await req('/api/saldos','GET',undefined,a),200,'Saldo após perda');
  check('Perda confirmada reduz direito e não expõe custos internos',()=>{
    assert.equal(confirmedBalance.items[0].confirmedLossCents,'200');assert.equal(confirmedBalance.items[0].repasseCents,'300');
  });
  const budget=await create('/api/controle/orcamentos',{eventId:eventA.id,kind:'EXPENSE',category:'Aluguel',
    description:'Locação do teatro',amountCents:'100000'},finance);
  check('Orçamento é persistido sem gerar pagamento',()=>assert.ok(budget.id));
  const contract=await create('/api/controle/contratos',{title:'Contrato de realização',counterparty:'Teatro de homologação',eventId:eventA.id,
    status:'DRAFT',startDate:todayForTests,endDate:todayForTests,terms:'Condições comerciais sob análise e assinatura.'},finance);
  check('Contrato documental cadastrado',()=>assert.ok(contract.id));
  const exportJournal=expectStatus(await req(`/api/controle/contabilidade?inicio=${monthForTests}-01&fim=${todayForTests}`,'GET',undefined,finance),
    200,'Pré-exportação contábil');
  check('Exportação sugestiva conserva partidas dobradas',()=>assert.equal(exportJournal.totalCreditsCents,exportJournal.totalDebitsCents));
  check('Produtor não acessa controles internos do Pacote 03',()=>{});
  const requestsB = expectStatus(await req('/api/repasses', 'GET', undefined, b), 200, 'Pedidos produtor B');
  check('Produtor B não consulta os pedidos de A', () => assert.ok(!requestsB.items.some(i => [advance.id, payout.id].includes(i.id))));
  const audits = expectStatus(await req('/api/auditoria', 'GET', undefined, admin), 200, 'Auditoria interna').items;
  check('Aprovação, aceite e baixa deixam trilha de auditoria', () => {
    const actions = new Set(audits.map(x => x.action));
    for (const actionName of ['SALE_REGISTERED', 'PAYOUT_REQUESTED', 'PAYOUT_APPROVE', 'PAYOUT_PRODUCER_ACCEPT', 'PAYOUT_FINANCE_SIGN', 'PAYOUT_SETTLE']) {
      assert.ok(actions.has(actionName), `Auditoria sem ${actionName}`);
    }
  });
  console.log(`\nAPROVADO: ${checks.length} grupos de validação. Base exclusiva: ${db}; nenhum acesso bancário externo realizado.`);
} catch (e) {
  console.error(`\nREPROVADO após ${checks.length} grupos:`, e.stack || e);
  process.exitCode = 1;
}
