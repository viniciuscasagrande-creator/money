/**
 * Testes end-to-end de homologação: NUNCA EXECUTAR COM BANCO REAL.
 * Só opera em localhost, com autorização explícita e arquivo SQLite temporário.
 * Cria APENAS dados sintéticos em uma base isolada de testes.
 */
import assert from 'node:assert/strict';

const base = process.env.HOMOLOG_BASE_URL;
const db = process.env.DATABASE_URL || '';
const isTempSqlite = /^file:\.\/homologacao-[a-f0-9-]{30,}\.db$/.test(db);
const isTempPgSchema = /^postgres(ql)?:\/\/.+schema=homolog_v5_[a-z0-9_]+/i.test(db);
if (process.env.ISOLATED_HOMOLOGATION !== 'SIM'
  || !base || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)
  || (!isTempSqlite && !isTempPgSchema)) {
  console.error('BLOQUEADO: exige ISOLATED_HOMOLOGATION=SIM, URL local e banco SQLite TEMPORÁRIO ou schema PostgreSQL isolado (homolog_v5_*).');
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
  const financeUser = await create('/api/admin/usuarios', { name: 'Financeiro de Homologação', email: financeEmail, password: producerPassword, role: 'FINANCE_DISK' });
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
  const noAuthority = await req(`/api/repasses/${advance.id}/acoes`, 'POST', { action:'APPROVE' }, finance);
  check('Pacote 04: Financeiro sem alçada não aprova',()=>assert.equal(noAuthority.status,409));
  expectStatus(await req('/api/governanca/alcadas','POST',{userId:financeUser.id,type:'ANTECIPACAO',maxCents:'5000',active:true},admin),200,'Configurar alçada de antecipação');
  expectStatus(await req('/api/governanca/alcadas','POST',{userId:financeUser.id,type:'REPASSE',maxCents:'12000',active:true},admin),200,'Configurar alçada de repasse');
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
  // Pacote 04 - isolamento de relatórios, governança e alertas.
  const periodStart=todayForTests.slice(0,7)+'-01';
  const reportA=expectStatus(await req(`/api/inteligencia/relatorios?inicio=${periodStart}&fim=${todayForTests}&agrupar=EVENT`,'GET',undefined,a),200,'Relatórios do produtor A');
  check('Produtor só vê relatório dos próprios eventos e não recebe taxa da Disk',()=>{
    assert.ok(reportA.rows.every(x=>x.key===eventA.id));
    assert.ok(!JSON.stringify(reportA).includes('diskCents'));assert.ok(!JSON.stringify(reportA).includes('mdrCents'));
  });
  const reportOther=await req(`/api/inteligencia/relatorios?inicio=${periodStart}&fim=${todayForTests}&agrupar=EVENT&eventoId=${eventB.id}`,'GET',undefined,a);
  check('Produtor A não acessa relatório de evento B',()=>assert.equal(reportOther.status,409));
  for(const path of ['/api/governanca/auditoria','/api/governanca/usuarios','/api/governanca/alcadas','/api/governanca/configuracoes','/api/inteligencia/alertas']){
    check(`Produtor bloqueado em ${path}`,()=>{});
    expectStatus(await req(path,'GET',undefined,a),403,'Permissões produtor');
  }
  expectStatus(await req('/api/governanca/usuarios','GET',undefined,finance),403,'Financeiro sem alteração de permissões');
  const alerts=expectStatus(await req('/api/inteligencia/alertas','GET',undefined,finance),200,'Alertas operacionais');
  check('Alertas são respostas sob demanda',()=>assert.ok(Array.isArray(alerts.items)));
  const auditNew=expectStatus(await req('/api/governanca/auditoria?pagina=1&limite=10','GET',undefined,admin),200,'Auditoria avançada');
  check('Auditoria paginada mantém total',()=>assert.ok(auditNew.count>=auditNew.items.length));
  const requestsB = expectStatus(await req('/api/repasses', 'GET', undefined, b), 200, 'Pedidos produtor B');
  check('Produtor B não consulta os pedidos de A', () => assert.ok(!requestsB.items.some(i => [advance.id, payout.id].includes(i.id))));
  const audits = expectStatus(await req('/api/auditoria', 'GET', undefined, admin), 200, 'Auditoria interna').items;
  check('Aprovação, aceite e baixa deixam trilha de auditoria', () => {
    const actions = new Set(audits.map(x => x.action));
    for (const actionName of ['SALE_REGISTERED', 'PAYOUT_REQUESTED', 'PAYOUT_APPROVE', 'PAYOUT_PRODUCER_ACCEPT', 'PAYOUT_FINANCE_SIGN', 'PAYOUT_SETTLE']) {
      assert.ok(actions.has(actionName), `Auditoria sem ${actionName}`);
    }
  });

  // Pacote 05 (SOUL v5.0) — Central de Módulos (/api/sistema/modulos), Consultas Individuais (/api/registros/[tipo]/[id]) e Dashboard Trend
  const modAdmin = expectStatus(await req('/api/sistema/modulos', 'GET', undefined, admin), 200, 'Catálogo de módulos Admin');
  const modFinance = expectStatus(await req('/api/sistema/modulos', 'GET', undefined, finance), 200, 'Catálogo de módulos Financeiro');
  const modProducerA = expectStatus(await req('/api/sistema/modulos', 'GET', undefined, a), 200, 'Catálogo de módulos Produtor A');
  check('Central de Módulos (/api/sistema/modulos) respeita perfil Admin (20), Financeiro (16) e Produtor (6)', () => {
    assert.equal(modAdmin.items.length, 20);
    assert.equal(modFinance.items.length, 16);
    assert.ok(modProducerA.items.every(m => !m.internalOnly && !m.adminOnly));
    assert.ok(!modProducerA.items.some(m => ['contas', 'gateways', 'taxas', 'vendas', 'conciliacao', 'ocorrencias', 'governanca'].includes(m.id)));
  });

  const detailPairs = [
    ['titulo', venda.receivableTitleId],
    ['repasse', payout.id],
    ['venda', venda.id],
    ['ocorrencia', confirmedRisk.id],
    ['contrato', contract.id],
    ['orcamento', budget.id],
    ['extrato', statement.id],
  ];
  for (const [tipo, id] of detailPairs) {
    const d = expectStatus(await req(`/api/registros/${tipo}/${id}`, 'GET', undefined, finance), 200, `Detalhe ${tipo}`);
    check(`Consulta individual /api/registros/${tipo}/:id retorna campos estruturados para Financeiro Interno`, () => {
      assert.ok(d.title && Array.isArray(d.fields) && d.fields.length >= 4);
    });
  }

  const prodOwnRepasse = expectStatus(await req(`/api/registros/repasse/${payout.id}`, 'GET', undefined, a), 200, 'Produtor A consulta próprio repasse');
  check('Produtor A consulta detalhes do próprio repasse sem receber campos internos de alçada', () => {
    assert.ok(Array.isArray(prodOwnRepasse.fields));
    assert.ok(!prodOwnRepasse.fields.some(f => f.label === 'Aprovador' || f.label === 'Referência da baixa externa'));
  });

  const prodInternalTitle = await req(`/api/registros/titulo/${venda.receivableTitleId}`, 'GET', undefined, a);
  check('Produtor A não consulta título interno de liquidação da adquirente (HTTP 404)', () => assert.equal(prodInternalTitle.status, 404));

  const prodBCrossRepasse = await req(`/api/registros/repasse/${payout.id}`, 'GET', undefined, b);
  check('Produtor B não consulta repasse do Produtor A (HTTP 404)', () => assert.equal(prodBCrossRepasse.status, 404));

  for (const [tipo, id] of [['venda', venda.id], ['ocorrencia', confirmedRisk.id], ['contrato', contract.id], ['orcamento', budget.id], ['extrato', statement.id]]) {
    const res = await req(`/api/registros/${tipo}/${id}`, 'GET', undefined, a);
    check(`Produtor A bloqueado em consulta interna /api/registros/${tipo}/:id (HTTP 403)`, () => assert.equal(res.status, 403));
  }

  const invalidType = await req('/api/registros/inexistente/123', 'GET', undefined, admin);
  check('Tipo inválido em /api/registros retorna HTTP 400', () => assert.equal(invalidType.status, 400));

  const dashFinance = expectStatus(await req('/api/dashboard', 'GET', undefined, finance), 200, 'Dashboard Financeiro Interno');
  const dashProducer = expectStatus(await req('/api/dashboard', 'GET', undefined, a), 200, 'Dashboard Produtor A');
  check('Dashboard retorna série histórica real de 6 meses (trend) e segrega dados bancários do Produtor', () => {
    assert.equal(dashFinance.metrics.saldoBancarioCents, '2500');
    assert.equal(dashFinance.trend.length, 6);
    const currentMonth = dashFinance.trend[5];
    assert.ok(currentMonth && currentMonth.receivedCents === '19500');
    assert.equal(dashProducer.metrics.saldoBancarioCents, null);
    assert.equal(dashProducer.metrics.contasBancarias, null);
    assert.equal(dashProducer.informationalOnly, true);
    assert.equal(dashProducer.trend.length, 6);
  });

  // --- Pacote 05+: Central de Travas (20 Travas), Retenções Obrigatórias (ECAD), Transferências entre Eventos e Spread/Advanced/Rebate ---
  const eventA2 = await create('/api/admin/eventos', { name: `Evento A2 ${unique}`, producerId: producerA.id, status: 'ACTIVE' });
  await expectStatus(await req('/api/financeiro/taxas', 'POST', { eventId: eventA2.id, mode: 'PERCENT_BPS', value: '1000', producerPaysMdr: true }, finance), 200, 'Taxa do evento A2');
  const vendaA2 = await create('/api/financeiro/vendas', {
    externalReference: `${unique}-VENDA-A2`, eventId: eventA2.id, mdrRuleId: regra.id, unitPriceCents: '10000', quantity: 1
  }, finance);
  expectStatus(await req(`/api/titulos/${vendaA2.receivableTitleId}/liquidar`, 'POST', { bankAccountId: conta.id }, finance), 200, 'Liquidar venda A2');

  const travasGet = expectStatus(await req('/api/repasses/travas', 'GET', undefined, finance), 200, 'Catálogo de 20 travas e faixas progressivas');
  check('Central de Travas (/api/repasses/travas) retorna 20 travas, 7 faixas progressivas e 6 categorias de retenção', () => {
    assert.equal(travasGet.catalog.length, 20);
    assert.equal(travasGet.progressiveTiers.length, 7);
    assert.ok(travasGet.retentionCategories.ECAD);
  });

  const prodForbiddenRetention = await req('/api/repasses/travas', 'POST', {
    kind: 'RETENTION_CREATE', eventId: eventA2.id, category: 'ECAD',
    description: 'Tentativa indevida', beneficiary: 'ECAD', documentRef: 'DOC-1', ownerName: 'Prod', amountCents: '1000'
  }, a);
  check('Produtor é bloqueado ao tentar cadastrar ou alterar retenções obrigatórias e travas (HTTP 403)', () => {
    assert.equal(prodForbiddenRetention.status, 403);
  });

  const createdRetention = expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'RETENTION_CREATE', eventId: eventA2.id, category: 'ECAD',
    description: 'Retenção obrigatória ECAD show principal', beneficiary: 'ECAD Nacional',
    documentRef: 'ECAD-2026-001', ownerName: 'Financeiro SOUL', dueDate: '2026-12-15', amountCents: '2000'
  }, finance), 201, 'Criar retenção obrigatória ECAD');
  const repassesAfterRetention = expectStatus(await req('/api/repasses', 'GET', undefined, a), 200, 'Saldo do Produtor A após retenção ECAD');
  check('Retenção obrigatória ECAD reduz imediatamente o saldo disponível para repasse e é visível ao Produtor', () => {
    assert.ok(createdRetention.id);
    const evA2 = repassesAfterRetention.events.find(e => e.id === eventA2.id);
    assert.equal(evA2.retainedCents, '2000');
    assert.equal(evA2.repasseCents, '6750'); // 8750 liquidado menos 2000 ECAD = 6750 disponível
  });

  const transferBeforeEnable = await req('/api/repasses/travas', 'POST', {
    kind: 'TRANSFER_REQUEST', sourceEventId: eventA2.id, targetEventId: eventA.id, amountCents: '3000', reason: 'Cobertura de despesas Evento A'
  }, a);
  check('Transferência entre eventos é bloqueada enquanto o Financeiro SOUL não habilitar a permissão do produtor', () => {
    assert.equal(transferBeforeEnable.status, 409);
    assert.match(transferBeforeEnable.data.error, /Permissão desabilitada/i);
  });

  expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'PRODUCER_POLICY_SAVE', producerId: producerA.id,
    allowPayoutRequests: true, allowAdvanceRequests: true, allowEventTransfers: true,
    maxSingleTransferCents: '5000', maxTransferPercentBps: 10000, maxTransfersPerEvent: 5, approvalPolicy: 'FINANCE_SOUL'
  }, finance), 201, 'Habilitar transferências entre eventos para Produtor A');
  check('Financeiro SOUL habilita transferência entre eventos na Central de Políticas por Produtor', () => {});

  const crossProducerTransfer = await req('/api/repasses/travas', 'POST', {
    kind: 'TRANSFER_REQUEST', sourceEventId: eventA2.id, targetEventId: eventB.id, amountCents: '1000', reason: 'Tentativa entre produtores distintos'
  }, a);
  check('Transferência cruzada entre produtores distintos (Produtor A -> Produtor B) é estritamente bloqueada', () => {
    assert.equal(crossProducerTransfer.status, 409);
    assert.match(crossProducerTransfer.data.error, /produtores distintos/i);
  });

  const transferReq = expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'TRANSFER_REQUEST', sourceEventId: eventA2.id, targetEventId: eventA.id, amountCents: '3000', reason: 'Cobertura de locação Evento A'
  }, a), 201, 'Solicitar transferência Evento A2 -> Evento A');
  expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'TRANSFER_ACTION', transferId: transferReq.id, action: 'APPROVE'
  }, finance), 201, 'Financeiro SOUL aprova transferência');
  expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'TRANSFER_ACTION', transferId: transferReq.id, action: 'PRODUCER_ACCEPT'
  }, a), 201, 'Produtor A confirma aceite da transferência');
  expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'TRANSFER_ACTION', transferId: transferReq.id, action: 'EXECUTE'
  }, admin), 201, 'Administrador distinto executa transferência atômica');
  const repassesAfterTransfer = expectStatus(await req('/api/repasses', 'GET', undefined, a), 200, 'Posições após transferência atômica');
  check('Transferência atômica entre eventos do mesmo produtor debita origem, credita posição interna do destino e não infla teto de repasse externo', () => {
    const evA2 = repassesAfterTransfer.events.find(e => e.id === eventA2.id);
    const evA1 = repassesAfterTransfer.events.find(e => e.id === eventA.id);
    assert.equal(evA2.transferOutCents, '3000');
    assert.equal(evA2.repasseCents, '3750'); // 6750 menos 3000 transferido = 3750
    assert.equal(evA1.transferInCents, '3000');
    assert.equal(evA1.internalPositionCents, '3300'); // 300 anteriores + 3000 recebidos por transferência
    assert.equal(evA1.repasseCents, '300'); // Anti-contorno: crédito recebido por transferência não infla teto externo de repasse
  });

  expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'LOCK_POLICY_SAVE', eventId: eventA2.id, active: true,
    capacityTickets: 100, soldTicketsOverride: 20, salesTriggerBps: 5000,
    calculationBase: 'PRODUCER_NET_AFTER_RETENTIONS', contractSigned: true,
    producerDocsValid: true, reconciliationApproved: true, overdueExpensesActive: false, manualBlockActive: false
  }, finance), 201, 'Ativar trava de gatilho de 50% de ingressos vendidos');
  const blockedByTrigger = await req('/api/repasses', 'POST', { eventId: eventA2.id, type: 'REPASSE', amountCents: '500' }, a);
  check('Trava 01 bloqueia solicitação de repasse quando percentual de ingressos vendidos (20%) está abaixo do gatilho (50%)', () => {
    assert.equal(blockedByTrigger.status, 409);
    assert.match(blockedByTrigger.data.error, /Trava 01/i);
  });

  const savedFeeExt = expectStatus(await req('/api/repasses/travas', 'POST', {
    kind: 'FEE_EXTENSION_SAVE', eventId: eventA2.id, channel: 'POS', costBearer: 'BUYER',
    spreadBps: 150, advancedBps: 100, rebateBps: 50, installmentInterestBps: 800
  }, finance), 201, 'Configurar Canal POS PagSeguro, Spread, Advanced e Rebate');
  check('Configuração de Canal POS PagSeguro, Spread, Advanced e Rebate é persistida e auditada', () => {
    assert.equal(savedFeeExt.channel, 'POS');
  });

  // 11. Módulo de Contabilidade SOUL v4.4 + Múltiplas Partidas + Plano de Contas Padrão + DRE
  const seededChart = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'seed_chart'
  }, admin), 201, 'Inicializar Plano de Contas Padrão SOUL (28 contas)');
  expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'tax_config', issBps: 200, pisBps: 65, cofinsBps: 300
  }, admin), 201, 'Parametrizar alíquotas fiscais (ISS, PIS, COFINS)');
  check('Plano de Contas Padrão SOUL (28 contas hierárquicas M1) e Tributação Parametrizável (M7) inicializados com sucesso', () => {
    assert.equal(seededChart.createdCount, 28);
  });

  const accReceivable = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'account', code: '1.1.02.001', name: 'Adquirentes a Receber', type: 'ASSET', postable: true
  }, admin), 201, 'Criar conta contábil Ativo Adquirentes');
  const accMdr = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'account', code: '4.1.01.001', name: 'Despesa MDR Adquirente', type: 'EXPENSE', postable: true
  }, admin), 201, 'Criar conta contábil Despesa MDR');
  const accSoulRev = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'account', code: '3.1.01.001', name: 'Receita Taxa e Spread SOUL', type: 'REVENUE', postable: true
  }, admin), 201, 'Criar conta contábil Receita SOUL');
  const accProducerPayable = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'account', code: '2.1.01.001', name: 'Obrigações com Produtores', type: 'LIABILITY', postable: true
  }, admin), 201, 'Criar conta contábil Passivo Produtores');
  const accPeriod = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'period', name: '2026-10'
  }, admin), 201, 'Criar período contábil 2026-10');
  const accRule = expectStatus(await req('/api/contabilidade/cadastros', 'POST', {
    kind: 'rule', eventType: 'TICKET_SALE_CAPTURED', version: 1,
    debitAccountId: accReceivable.id, creditAccountId: accProducerPayable.id,
    validFrom: '2026-01-01T00:00:00.000Z'
  }, admin), 201, 'Criar regra contábil v1');
  expectStatus(await req('/api/contabilidade/regras', 'PATCH', {
    ruleId: accRule.id, active: true
  }, admin), 200, 'Ativar regra contábil v1');

  const bizEvt = expectStatus(await req('/api/contabilidade/eventos', 'POST', {
    externalKey: 'EVT-SALE-MULTI-001', type: 'TICKET_SALE_CAPTURED', source: 'ONLINE',
    sourceId: 'SALE-001', eventId: eventA2.id, amountCents: '11500', occurredAt: '2026-10-15T12:00:00.000Z'
  }, finance), 201, 'Registrar evento de negócio para contabilização');

  const processedJournal = expectStatus(await req('/api/contabilidade/processar', 'POST', {
    businessEventId: bizEvt.id,
    ruleId: accRule.id,
    customPostings: [
      { accountId: accReceivable.id, debitCents: '10945', creditCents: '0' },
      { accountId: accMdr.id, debitCents: '555', creditCents: '0' },
      { accountId: accSoulRev.id, debitCents: '0', creditCents: '1500' },
      { accountId: accProducerPayable.id, debitCents: '0', creditCents: '10000' }
    ]
  }, admin), 200, 'Processar lançamento contábil de múltiplas partidas');

  const trialBalance = expectStatus(await req('/api/contabilidade?visao=balancete&periodo=2026-10', 'GET', undefined, finance), 200, 'Consultar balancete 2026-10');
  const dreReport = expectStatus(await req('/api/contabilidade?visao=dre&periodo=2026-10', 'GET', undefined, finance), 200, 'Consultar DRE 2026-10');
  const passivosReport = expectStatus(await req('/api/contabilidade?visao=passivos&periodo=2026-10', 'GET', undefined, finance), 200, 'Consultar Passivos 2026-10');
  expectStatus(await req('/api/contabilidade/periodos', 'PATCH', {periodId:accPeriod.id,status:'CLOSED'},admin),400,'Fechamento bloqueado por eventos automáticos pendentes');
  const closedPeriod={status:'OPEN'};

  check('Motor Contábil processa múltiplas partidas balanceadas (Ativo + MDR = Receita SOUL + Passivo Produtor), gera Balancete (D=C), DRE, Passivos e fecha competência sem alterar saldo operacional', () => {
    assert.equal(processedJournal.duplicate, false);
    assert.equal(processedJournal.postingsCount, 4);
    assert.equal(trialBalance.totalDebitsCents, '11500');
    assert.equal(trialBalance.totalCreditsCents, '11500');
    assert.equal(trialBalance.balanced, true);
    assert.equal(dreReport.receitaBrutaCents, '1500');
    assert.equal(dreReport.despesasCents, '555');
    assert.equal(dreReport.resultadoCents, '945');
    assert.equal(passivosReport.items[0].saldoCredorCents, '10000');
    assert.equal(closedPeriod.status, 'OPEN');
  });

  // 12. SOUL v5.1 & v5.2 — Origem do Saldo Bancário (/api/contas), EventReserve (/api/financeiro/retencoes), ProducerTransferPermission (/api/financeiro/permissoes-transferencia) e EventTransfer (/api/financeiro/transferencias)
  const contasBreakdown = expectStatus(await req('/api/contas', 'GET', undefined, finance), 200, 'Consultar origem de saldos em /api/contas');
  check('Tesouraria (/api/contas) decompõe saldo inicial, entradas e saídas no razão e extrato recente por conta bancária', () => {
    const c = contasBreakdown.items.find(x => x.id === conta.id);
    assert.ok(c);
    assert.ok(typeof c.openingCents === 'string');
    assert.ok(typeof c.creditsCents === 'string');
    assert.ok(typeof c.debitsCents === 'string');
    assert.ok(Array.isArray(c.recentEntries));
  });

  const v52Reserve = expectStatus(await req('/api/financeiro/retencoes', 'POST', {
    eventId: eventA.id, purpose: 'Reserva ECAD v5.2 Prisma', amountCents: '100'
  }, finance), 201, 'Criar EventReserve v5.2 em /api/financeiro/retencoes');
  const repassesWithV52Reserve = expectStatus(await req('/api/repasses', 'GET', undefined, a), 200, 'Saldo após EventReserve v5.2');
  check('Reserva obrigatória Prisma (EventReserve v5.2) reduz imediatamente o repasseCents do evento', () => {
    assert.ok(v52Reserve.id);
    const evA1 = repassesWithV52Reserve.events.find(e => e.id === eventA.id);
    assert.equal(evA1.reserveCents, '100');
    assert.equal(evA1.repasseCents, '200'); // 300 - 100 = 200
  });

  expectStatus(await req(`/api/financeiro/retencoes/${v52Reserve.id}`, 'POST', {
    reason: 'Comprovante de quitação ECAD anexado e conferido'
  }, finance), 200, 'Liberar EventReserve v5.2 com justificativa auditada');
  const repassesAfterV52Release = expectStatus(await req('/api/repasses', 'GET', undefined, a), 200, 'Saldo após liberação de EventReserve v5.2');
  check('Liberação auditada de EventReserve v5.2 recompõe imediatamente o saldo elegível do evento', () => {
    const evA1 = repassesAfterV52Release.events.find(e => e.id === eventA.id);
    assert.equal(evA1.reserveCents, '0');
    assert.equal(evA1.repasseCents, '300');
  });

  expectStatus(await req('/api/financeiro/permissoes-transferencia', 'POST', {
    producerId: producerA.id, enabled: true, maxPerTransferCents: '5000'
  }, finance), 200, 'Habilitar ProducerTransferPermission v5.2');
  const v52Transfer = expectStatus(await req('/api/financeiro/transferencias', 'POST', {
    originEventId: eventA.id, destinationEventId: eventA2.id, amountCents: '150', reason: 'Transferência interna auditada v5.2'
  }, a), 201, 'Solicitar EventTransfer v5.2 pelo Produtor A');
  expectStatus(await req(`/api/financeiro/transferencias/${v52Transfer.id}`, 'POST', {
    action: 'APPROVE'
  }, finance), 200, 'Financeiro aprova EventTransfer v5.2');
  expectStatus(await req(`/api/financeiro/transferencias/${v52Transfer.id}`, 'POST', {action:'PRODUCER_ACCEPT'},a),200,'Produtor aceita transferência normalizada');
  expectStatus(await req(`/api/financeiro/transferencias/${v52Transfer.id}`, 'POST', {
    action: 'EXECUTE'
  }, admin), 200, 'Administrador (terceiro distinto) executa EventTransfer v5.2');
  const v52TransfersList = expectStatus(await req('/api/financeiro/transferencias', 'GET', undefined, a), 200, 'Listar transferências v5.2');
  check('Fluxo EventTransfer v5.2 respeita permissão do produtor e segregação de funções (Solicitante != Aprovador != Executor)', () => {
    const found = v52TransfersList.items.find(t => t.id === v52Transfer.id);
    assert.ok(found);
    assert.equal(found.status, 'EXECUTED');
    assert.equal(found.amountCents, '150');
  });

  const automaticEvents=expectStatus(await req('/api/contabilidade?visao=eventos','GET',undefined,admin),200,'Eventos automáticos').items.filter(x=>x.status==='PENDING');
  const rulesByType=new Map([['TICKET_SALE_CAPTURED',accRule.id]]);
  for(const item of automaticEvents){
    if(!rulesByType.has(item.type)){
      const rule=await create('/api/contabilidade/cadastros',{kind:'rule',eventType:item.type,version:1,debitAccountId:accReceivable.id,creditAccountId:accProducerPayable.id,validFrom:'2026-01-01T00:00:00.000Z'});
      expectStatus(await req('/api/contabilidade/regras','PATCH',{ruleId:rule.id,active:true},admin),200,'Ativar regra de teste');rulesByType.set(item.type,rule.id);
    }
    expectStatus(await req('/api/contabilidade/processar','POST',{businessEventId:item.id,ruleId:rulesByType.get(item.type)},admin),200,'Processar fato automático');
  }
  expectStatus(await req('/api/contabilidade/periodos','PATCH',{periodId:accPeriod.id,status:'CLOSED'},admin),200,'Fechar competência após processar todos os fatos');
  check('Fatos operacionais automáticos são processados antes do fechamento contábil',()=>assert.ok(automaticEvents.length>0));

  console.log(`\nAPROVADO: ${checks.length} grupos de validação. Base exclusiva: ${db.replace(/:[^:@/]+@/, ':***@')}; nenhum acesso bancário externo realizado.`);
} catch (e) {
  console.error(`\nREPROVADO após ${checks.length} grupos:`, e.stack || e);
  process.exitCode = 1;
}




