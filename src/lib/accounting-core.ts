export type PostingInput = {
  accountId: string;
  debitCents: bigint;
  creditCents: bigint;
  costCenter?: string | null;
};

export function validatePostings(items: PostingInput[]) {
  if (items.length < 2) throw new Error("Lançamento deve conter pelo menos duas partidas.");
  let debit = 0n,
    credit = 0n;
  for (const x of items) {
    if (
      x.debitCents < 0n ||
      x.creditCents < 0n ||
      (x.debitCents === 0n && x.creditCents === 0n) ||
      (x.debitCents > 0n && x.creditCents > 0n)
    )
      throw new Error("Partida inválida.");
    debit += x.debitCents;
    credit += x.creditCents;
  }
  if (debit === 0n || debit !== credit) throw new Error("Débitos e créditos devem ser iguais e positivos.");
  return { debit, credit };
}

export function currencyCents(text: string): bigint {
  if (!/^[0-9]+$/.test(text)) throw new Error("Valor deve ser inteiro em centavos.");
  const v = BigInt(text);
  if (v <= 0n || v > 1000000000000n) throw new Error("Valor fora dos limites.");
  return v;
}

export function periodName(date: Date) {
  return date.toISOString().slice(0, 7);
}

export type MultiPartSaleAccountingInput = {
  receivableAccountId: string;
  gatewayExpenseAccountId: string;
  soulRevenueAccountId: string;
  soulSpreadAccountId?: string;
  soulRebateAccountId?: string;
  producerPayableAccountId: string;
  retentionReserveAccountId?: string;
  netSettlementCents: bigint;
  gatewayFeeCents: bigint;
  soulFeeCents: bigint;
  spreadCents?: bigint;
  rebateCents?: bigint;
  producerNetCents: bigint;
  retentionHeldCents?: bigint;
};

/**
 * Gera lançamento contábil de múltiplas partidas (débitos = créditos) para venda liquidada/capturada,
 * separando líquido adquirente, despesa de MDR, receitas próprias SOUL (taxa, spread, rebate),
 * obrigação com produtor e provisão de retenções obrigatórias, sem alterar o razão operacional.
 */
export function buildMultiPartSalePostings(input: MultiPartSaleAccountingInput): PostingInput[] {
  const spread = input.spreadCents ?? 0n;
  const rebate = input.rebateCents ?? 0n;
  const retention = input.retentionHeldCents ?? 0n;
  if (retention < 0n || retention > input.producerNetCents) {
    throw new Error("Retenção contábil não pode exceder a obrigação líquida do produtor.");
  }
  const producerFreePayable = input.producerNetCents - retention;

  const postings: PostingInput[] = [];
  if (input.netSettlementCents > 0n) {
    postings.push({ accountId: input.receivableAccountId, debitCents: input.netSettlementCents, creditCents: 0n });
  }
  if (input.gatewayFeeCents > 0n) {
    postings.push({ accountId: input.gatewayExpenseAccountId, debitCents: input.gatewayFeeCents, creditCents: 0n });
  }
  if (input.soulFeeCents > 0n) {
    postings.push({ accountId: input.soulRevenueAccountId, debitCents: 0n, creditCents: input.soulFeeCents });
  }
  if (spread > 0n) {
    postings.push({
      accountId: input.soulSpreadAccountId || input.soulRevenueAccountId,
      debitCents: 0n,
      creditCents: spread
    });
  }
  if (rebate > 0n) {
    postings.push({
      accountId: input.soulRebateAccountId || input.soulRevenueAccountId,
      debitCents: 0n,
      creditCents: rebate
    });
  }
  if (producerFreePayable > 0n) {
    postings.push({ accountId: input.producerPayableAccountId, debitCents: 0n, creditCents: producerFreePayable });
  }
  if (retention > 0n) {
    postings.push({
      accountId: input.retentionReserveAccountId || input.producerPayableAccountId,
      debitCents: 0n,
      creditCents: retention
    });
  }

  validatePostings(postings);
  return postings;
}

// ============================================================================
// SOUL v4.4 — Motor Contábil Integrado (M1 a M10 + 4 Ajustes SOUL)
// ============================================================================

export const ACCOUNTING_RULE_VERSION = "2026.10.1";

export type AccountNatureType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "DEDUCTION" | "EXPENSE";

export type ChartAccountDef = {
  code: string;
  name: string;
  type: AccountNatureType;
  postable: boolean;
};

export const DEFAULT_CHART_OF_ACCOUNTS: ChartAccountDef[] = [
  { code: "1", name: "ATIVO", type: "ASSET", postable: false },
  { code: "1.1", name: "Ativo circulante", type: "ASSET", postable: false },
  { code: "1.1.01", name: "Caixa Bilheteria", type: "ASSET", postable: true },
  { code: "1.1.02", name: "Bancos", type: "ASSET", postable: true },
  { code: "1.1.03", name: "Valores a receber - PagSeguro", type: "ASSET", postable: true },
  { code: "1.1.04", name: "Valores a receber - Gateway online", type: "ASSET", postable: true },
  { code: "1.1.05", name: "Chargebacks a recuperar", type: "ASSET", postable: true },
  { code: "1.1.06", name: "Valores em trânsito (depósitos a conciliar)", type: "ASSET", postable: true },
  { code: "2", name: "PASSIVO", type: "LIABILITY", postable: false },
  { code: "2.1", name: "Passivo circulante", type: "LIABILITY", postable: false },
  { code: "2.1.01", name: "Repasses a pagar - produtores", type: "LIABILITY", postable: true },
  { code: "2.1.02", name: "Receita diferida (eventos futuros)", type: "LIABILITY", postable: true },
  { code: "2.1.03", name: "Impostos a recolher (ISS, PIS, COFINS)", type: "LIABILITY", postable: true },
  { code: "2.1.04", name: "Retenções obrigatórias vinculadas (ECAD, locação, reservas)", type: "LIABILITY", postable: true },
  { code: "3", name: "RECEITAS", type: "REVENUE", postable: false },
  { code: "3.1", name: "Receita operacional", type: "REVENUE", postable: false },
  { code: "3.1.01", name: "Receita de comissão e taxa de serviço", type: "REVENUE", postable: true },
  { code: "3.1.02", name: "Receita de ingressos (modelo principal)", type: "REVENUE", postable: true },
  { code: "3.2", name: "Deduções da receita", type: "DEDUCTION", postable: false },
  { code: "3.2.01", name: "Impostos sobre receita e cancelamentos", type: "DEDUCTION", postable: true },
  { code: "3.3", name: "Outras receitas", type: "REVENUE", postable: false },
  { code: "3.3.01", name: "Sobras de caixa", type: "REVENUE", postable: true },
  { code: "4", name: "DESPESAS", type: "EXPENSE", postable: false },
  { code: "4.1", name: "Despesas operacionais", type: "EXPENSE", postable: false },
  { code: "4.1.01", name: "Taxas de adquirência (MDR)", type: "EXPENSE", postable: true },
  { code: "4.1.02", name: "Custo de antecipação de recebíveis", type: "EXPENSE", postable: true },
  { code: "4.1.03", name: "Perdas com chargeback", type: "EXPENSE", postable: true },
  { code: "4.1.04", name: "Quebra de caixa", type: "EXPENSE", postable: true }
];

const DEBIT_NATURE_TYPES = new Set<AccountNatureType>(["ASSET", "EXPENSE", "DEDUCTION"]);

export class ErroContabil extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroContabil";
  }
}

export type TaxParametersBps = Record<string, number>;

export const DEFAULT_TAX_PARAMETERS_BPS: TaxParametersBps = {
  ISS: 500,
  PIS: 65,
  COFINS: 300
};

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDaysIso(laterDate: string, earlierDate: string): number {
  const a = new Date(`${laterDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  const b = new Date(`${earlierDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.max(Math.round((a - b) / 86400000), 0);
}

export function defaultMdrBps(forma: "pix" | "debito" | "credito", parcelas: number): number {
  if (forma === "pix") return 99;
  if (forma === "debito") return 199;
  if (parcelas <= 1) return 379;
  return parcelas <= 6 ? 459 : 529;
}

export type EnginePostingLine = {
  conta: string;
  debito: number;
  credito: number;
  centro: string | null;
};

export type EngineJournalEntry = {
  id: number;
  data: string;
  historico: string;
  chave: string;
  tipo: string;
  canal: string | null;
  eventoId: number | null;
  vendaId: number | null;
  regra: string;
  estornoDe: number | null;
  partidas: EnginePostingLine[];
};

export type EngineReceivable = {
  id: number;
  vendaId: number;
  adquirente: "PAGSEGURO" | "GATEWAY";
  parcela: number;
  bruto: number;
  mdrPrevisto: number;
  mdrReal: number | null;
  custoAntecipacao: number;
  liquido: number | null;
  dataPrevista: string;
  dataLiquidacao: string | null;
  status: "PENDENTE" | "LIQUIDADO" | "DIVERGENTE" | "RETIDO" | "CANCELADO";
};

export type EngineSale = {
  id: number;
  chave: string | null;
  eventoId: number;
  canal: "ONLINE" | "POS" | "BILHETERIA";
  forma: "dinheiro" | "debito" | "credito" | "pix";
  adquirente: "PAGSEGURO" | "GATEWAY" | null;
  ingresso: number;
  taxaServico: number;
  comissao: number;
  parcelas: number;
  nsu: string | null;
  autorizacao: string | null;
  caixaId: number | null;
  data: string;
  status: "PAGA" | "REEMBOLSADA" | "CHARGEBACK" | "PERDIDA";
};

export type EngineCashBox = {
  id: number;
  operador: string;
  terminal: string;
  abertoEm: string;
  fechadoEm: string | null;
  conferente: string | null;
  valorContado: number | null;
  diferenca: number | null;
  status: "ABERTO" | "FECHADO";
};

export type EngineReconciliationRecord = {
  id: number;
  adquirente: "PAGSEGURO" | "GATEWAY";
  nsu: string;
  parcela: number;
  recebivelId: number | null;
  status: "CONCILIADO" | "DIVERGENTE" | "SEM_VENDA" | "SEM_RECEBIMENTO" | "DUPLICADO" | "RESOLVIDO";
  brutoExt: number | null;
  mdrExt: number | null;
  liquidoExt: number | null;
  dataLiqExt: string | null;
  diferenca: number | null;
  resolvidoPor: string | null;
};

export type EngineRepasseOrder = {
  id: number;
  eventoId: number;
  valor: number;
  status: "APURADO" | "PAGO";
  antecipado: boolean;
  apuradoPor: string;
  pagoPor: string | null;
  dataApuracao: string;
  dataPagamento: string | null;
  lancamentoId: number | null;
};

export type EngineRetentionRecord = {
  id: number;
  eventoId: number;
  categoria: string;
  descricao: string;
  valor: number;
  lancamentoId: number;
  status: "ATIVA" | "LIBERADA";
};

/**
 * Motor Contábil Integrado SOUL v4.4 em TypeScript (M1 a M10 + 4 Ajustes SOUL).
 * Opera de forma estritamente isolada do razão operacional bancário, garantindo
 * partidas dobradas (D=C), imutabilidade (apenas estorno por lançamento inverso),
 * tributação parametrizável, retenções obrigatórias (2.1.04), repasses parciais com travas
 * e transferências entre eventos do mesmo produtor sem gerar receita adicional.
 */
export class SoulAccountingEngine {
  private accounts = new Map<string, ChartAccountDef>();
  private periods = new Map<string, "ABERTO" | "FECHADO">();
  private producers = new Map<
    number,
    { id: number; nome: string; comissaoBps: number; mdrPorContaProdutor: boolean; prazoRepasseDias: number; permiteTransferenciaEventos: boolean }
  >();
  private events = new Map<
    number,
    { id: number; produtorId: number; nome: string; dataEvento: string; status: "AGENDADO" | "REALIZADO" | "CANCELADO"; tetoTravaAntecipadaCents?: number }
  >();
  private journals: EngineJournalEntry[] = [];
  private sales = new Map<number, EngineSale>();
  private receivables = new Map<number, EngineReceivable>();
  private cashBoxes = new Map<number, EngineCashBox>();
  private cashMovements: Array<{ id: number; caixaId: number; tipo: "SUPRIMENTO" | "VENDA" | "REEMBOLSO" | "SANGRIA"; valor: number; vendaId?: number | null; data: string }> = [];
  private chargebacks = new Map<
    number,
    { id: number; vendaId: number; valor: number; valorLiquidado: number; valorPendente: number; status: "ABERTO" | "PERDIDO" | "GANHO"; abertoEm: string; fechadoEm: string | null }
  >();
  private reconciliations = new Map<number, EngineReconciliationRecord>();
  private repasses = new Map<number, EngineRepasseOrder>();
  private retentions = new Map<number, EngineRetentionRecord>();
  private taxRecords: Array<{ periodo: string; eventoId: number; tributo: string; base: number; aliquotaBps: number; valor: number }> = [];
  private taxRatesBps: TaxParametersBps;

  constructor(customTaxRatesBps?: TaxParametersBps) {
    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      this.accounts.set(acc.code, { ...acc });
    }
    this.taxRatesBps = { ...(customTaxRatesBps ?? DEFAULT_TAX_PARAMETERS_BPS) };
  }

  // Ajuste 1: Parametrização dinâmica de alíquotas tributárias (ISS, PIS, COFINS, etc.)
  public configurarTributos(novasAliquotasBps: TaxParametersBps) {
    for (const [k, v] of Object.entries(novasAliquotasBps)) {
      if (!Number.isInteger(v) || v < 0 || v > 5000) {
        throw new ErroContabil(`Alíquota inválida para ${k}: ${v} bps`);
      }
    }
    this.taxRatesBps = { ...novasAliquotasBps };
  }

  public cadastrarProdutor(input: {
    nome: string;
    comissaoBps: number;
    prazoRepasseDias?: number;
    mdrPorContaProdutor?: boolean;
    permiteTransferenciaEventos?: boolean;
  }): number {
    const id = this.producers.size + 1;
    this.producers.set(id, {
      id,
      nome: input.nome,
      comissaoBps: input.comissaoBps,
      prazoRepasseDias: input.prazoRepasseDias ?? 5,
      mdrPorContaProdutor: input.mdrPorContaProdutor ?? false,
      permiteTransferenciaEventos: input.permiteTransferenciaEventos ?? false
    });
    return id;
  }

  public configurarPermissaoProdutor(produtorId: number, permiteTransferenciaEventos: boolean) {
    const p = this.producers.get(produtorId);
    if (!p) throw new ErroContabil("Produtor inexistente");
    p.permiteTransferenciaEventos = permiteTransferenciaEventos;
  }

  public cadastrarEvento(input: {
    produtorId: number;
    nome: string;
    dataEvento: string;
    tetoTravaAntecipadaCents?: number;
  }): number {
    if (!this.producers.has(input.produtorId)) throw new ErroContabil("Produtor inexistente");
    const id = this.events.size + 1;
    this.events.set(id, {
      id,
      produtorId: input.produtorId,
      nome: input.nome,
      dataEvento: input.dataEvento,
      status: "AGENDADO",
      tetoTravaAntecipadaCents: input.tetoTravaAntecipadaCents
    });
    return id;
  }

  public configurarTetoTravaEvento(eventoId: number, tetoCents: number) {
    const ev = this.events.get(eventoId);
    if (!ev) throw new ErroContabil("Evento inexistente");
    ev.tetoTravaAntecipadaCents = tetoCents;
  }

  // ----- M1 & M2: Períodos e Motor de Lançamentos -----
  public fecharPeriodo(anoMes: string) {
    this.periods.set(anoMes, "FECHADO");
  }

  public reabrirPeriodo(anoMes: string) {
    this.periods.set(anoMes, "ABERTO");
  }

  private checarPeriodo(data: string) {
    const ym = data.slice(0, 7);
    if (this.periods.get(ym) === "FECHADO") {
      throw new ErroContabil(`periodo ${ym} esta fechado`);
    }
  }

  public lancar(
    data: string,
    historico: string,
    partidas: Array<[string, number, number, string | null]>,
    opcoes?: {
      chave?: string;
      regra?: string;
      tipo?: string;
      canal?: string | null;
      eventoId?: number | null;
      vendaId?: number | null;
      estornoDe?: number | null;
    }
  ): number {
    const chave = opcoes?.chave;
    if (chave) {
      const existente = this.journals.find((j) => j.chave === chave);
      if (existente) return existente.id;
    }

    const linhas = partidas
      .filter(([, d, cr]) => d !== 0 || cr !== 0)
      .map(([conta, d, cr, centro]) => ({
        conta,
        debito: Math.trunc(d),
        credito: Math.trunc(cr),
        centro: centro ?? null
      }));

    if (linhas.length < 2) {
      throw new ErroContabil("lancamento precisa de ao menos 2 partidas");
    }
    let totalD = 0;
    let totalC = 0;
    for (const l of linhas) {
      if (l.debito < 0 || l.credito < 0 || (l.debito > 0 && l.credito > 0)) {
        throw new ErroContabil("valores negativos ou simultaneos nao sao permitidos");
      }
      const acc = this.accounts.get(l.conta);
      if (!acc) throw new ErroContabil(`conta inexistente: ${l.conta}`);
      if (!acc.postable) throw new ErroContabil(`conta sintetica nao aceita lancamento: ${l.conta}`);
      totalD += l.debito;
      totalC += l.credito;
    }
    if (totalD === 0 || totalD !== totalC) {
      throw new ErroContabil(`lancamento desbalanceado: D=${totalD} C=${totalC}`);
    }
    this.checarPeriodo(data);

    const id = this.journals.length + 1;
    const entry: EngineJournalEntry = Object.freeze({
      id,
      data,
      historico,
      chave: chave ?? `auto:${id}:${Date.now()}`,
      tipo: opcoes?.tipo ?? "MANUAL",
      canal: opcoes?.canal ?? null,
      eventoId: opcoes?.eventoId ?? null,
      vendaId: opcoes?.vendaId ?? null,
      regra: `${opcoes?.regra ?? "manual"}@${ACCOUNTING_RULE_VERSION}`,
      estornoDe: opcoes?.estornoDe ?? null,
      partidas: linhas.map((l) => Object.freeze({ ...l }))
    });
    this.journals.push(entry);
    return id;
  }

  public estornar(lancamentoId: number, data: string, motivo: string): number {
    const orig = this.journals.find((j) => j.id === lancamentoId);
    if (!orig) throw new ErroContabil("lancamento inexistente");
    if (orig.estornoDe !== null) throw new ErroContabil("um estorno nao pode ser estornado");
    const inv: Array<[string, number, number, string | null]> = orig.partidas.map((p) => [
      p.conta,
      p.credito,
      p.debito,
      p.centro
    ]);
    return this.lancar(data, `Estorno do lancamento #${lancamentoId}: ${motivo}`, inv, {
      chave: `estorno:${lancamentoId}`,
      regra: "estorno",
      tipo: "ESTORNO",
      canal: orig.canal,
      eventoId: orig.eventoId,
      vendaId: orig.vendaId,
      estornoDe: lancamentoId
    });
  }

  public saldoDevedor(contaPrefixo: string, centro?: string | null, ate?: string): number {
    let soma = 0;
    for (const j of this.journals) {
      if (ate && j.data > ate) continue;
      for (const p of j.partidas) {
        if (!p.conta.startsWith(contaPrefixo)) continue;
        if (centro !== undefined && centro !== null && p.centro !== centro) continue;
        soma += p.debito - p.credito;
      }
    }
    return soma;
  }

  public saldoCredor(contaPrefixo: string, centro?: string | null, ate?: string): number {
    const val = -this.saldoDevedor(contaPrefixo, centro, ate);
    return val === 0 ? 0 : val;
  }

  public saldo(contaCodigo: string, centro?: string | null, ate?: string): number {
    const acc = this.accounts.get(contaCodigo);
    const dev = this.saldoDevedor(contaCodigo, centro, ate);
    const val = acc && DEBIT_NATURE_TYPES.has(acc.type) ? dev : -dev;
    return val === 0 ? 0 : val;
  }

  // ----- M5: Caixa da Bilheteria -----
  public abrirCaixa(operador: string, terminal: string, data: string, trocoInicial = 0): number {
    const id = this.cashBoxes.size + 1;
    this.cashBoxes.set(id, {
      id,
      operador,
      terminal,
      abertoEm: data,
      fechadoEm: null,
      conferente: null,
      valorContado: null,
      diferenca: null,
      status: "ABERTO"
    });
    if (trocoInicial > 0) {
      this.cashMovements.push({ id: this.cashMovements.length + 1, caixaId: id, tipo: "SUPRIMENTO", valor: trocoInicial, data });
      this.lancar(
        data,
        `Suprimento (troco) caixa #${id}`,
        [
          ["1.1.01", trocoInicial, 0, null],
          ["1.1.02", 0, trocoInicial, null]
        ],
        { chave: `suprimento:${id}:abertura`, regra: "suprimento", tipo: "CAIXA" }
      );
    }
    return id;
  }

  private exigirCaixaAberto(caixaId?: number | null): EngineCashBox {
    if (!caixaId) throw new ErroContabil("operação em dinheiro exige caixa aberto");
    const cx = this.cashBoxes.get(caixaId);
    if (!cx || cx.status !== "ABERTO") throw new ErroContabil(`caixa ${caixaId} nao esta aberto`);
    return cx;
  }

  public sangriaCaixa(caixaId: number, valor: number, data: string) {
    this.exigirCaixaAberto(caixaId);
    this.cashMovements.push({ id: this.cashMovements.length + 1, caixaId, tipo: "SANGRIA", valor, data });
    this.lancar(
      data,
      `Sangria caixa #${caixaId}`,
      [
        ["1.1.06", valor, 0, null],
        ["1.1.01", 0, valor, null]
      ],
      { regra: "sangria", tipo: "CAIXA" }
    );
  }

  public saldoEsperadoCaixa(caixaId: number): number {
    return this.cashMovements
      .filter((m) => m.caixaId === caixaId)
      .reduce((acc, m) => acc + (m.tipo === "SUPRIMENTO" || m.tipo === "VENDA" ? m.valor : -m.valor), 0);
  }

  public fecharCaixa(caixaId: number, conferente: string, valorContado: number, data: string): number {
    const cx = this.exigirCaixaAberto(caixaId);
    if (conferente === cx.operador) {
      throw new ErroContabil("quem opera o caixa nao pode fechar/conferir o proprio caixa");
    }
    const dif = valorContado - this.saldoEsperadoCaixa(caixaId);
    if (dif < 0) {
      this.lancar(
        data,
        `Quebra de caixa #${caixaId} (falta)`,
        [
          ["4.1.04", -dif, 0, null],
          ["1.1.01", 0, -dif, null]
        ],
        { chave: `quebra:${caixaId}`, regra: "quebra", tipo: "CAIXA" }
      );
    } else if (dif > 0) {
      this.lancar(
        data,
        `Sobra de caixa #${caixaId}`,
        [
          ["1.1.01", dif, 0, null],
          ["3.3.01", 0, dif, null]
        ],
        { chave: `quebra:${caixaId}`, regra: "sobra", tipo: "CAIXA" }
      );
    }
    cx.status = "FECHADO";
    cx.fechadoEm = data;
    cx.conferente = conferente;
    cx.valorContado = valorContado;
    cx.diferenca = dif;
    return dif;
  }

  public depositarCaixa(valor: number, data: string, doc?: string) {
    this.lancar(
      data,
      `Deposito bancario ${doc ?? ""}`.trim(),
      [
        ["1.1.02", valor, 0, null],
        ["1.1.06", 0, valor, null]
      ],
      { chave: doc ? `deposito:${doc}` : undefined, regra: "deposito", tipo: "CAIXA" }
    );
  }

  // ----- M3 & Vendas nos 3 canais (Online, POS, Bilheteria) -----
  public vender(input: {
    eventoId: number;
    canal: "ONLINE" | "POS" | "BILHETERIA";
    forma: "dinheiro" | "debito" | "credito" | "pix";
    ingresso: number;
    data: string;
    taxaServico?: number;
    parcelas?: number;
    nsu?: string | null;
    autorizacao?: string | null;
    caixaId?: number | null;
    chave?: string;
  }): number {
    const taxaServico = input.taxaServico ?? 0;
    const parcelas = input.parcelas ?? 1;
    if (!["ONLINE", "POS", "BILHETERIA"].includes(input.canal) || !["dinheiro", "debito", "credito", "pix"].includes(input.forma)) {
      throw new ErroContabil("canal/forma invalidos");
    }
    if (input.forma === "dinheiro" && input.canal !== "BILHETERIA") {
      throw new ErroContabil("dinheiro so e aceito na bilheteria");
    }
    if (input.forma !== "dinheiro" && !input.nsu) {
      throw new ErroContabil("NSU e obrigatorio para vendas eletronicas (conciliacao)");
    }
    if (input.chave) {
      for (const s of this.sales.values()) {
        if (s.chave === input.chave) return s.id;
      }
    }
    const ev = this.events.get(input.eventoId);
    if (!ev || ev.status !== "AGENDADO") {
      throw new ErroContabil("evento inexistente ou nao esta aberto para vendas");
    }
    const prod = this.producers.get(ev.produtorId)!;
    if (input.forma === "dinheiro") {
      this.exigirCaixaAberto(input.caixaId);
    }

    const comissao = Math.trunc((input.ingresso * prod.comissaoBps) / 10000);
    const adq: "GATEWAY" | "PAGSEGURO" | null =
      input.forma === "dinheiro" ? null : input.canal === "ONLINE" ? "GATEWAY" : "PAGSEGURO";
    const bruto = input.ingresso + taxaServico;
    const vid = this.sales.size + 1;
    const centro = `EVT:${input.eventoId}`;
    const contaAtivo = input.forma === "dinheiro" ? "1.1.01" : adq === "GATEWAY" ? "1.1.04" : "1.1.03";

    this.sales.set(vid, {
      id: vid,
      chave: input.chave ?? null,
      eventoId: input.eventoId,
      canal: input.canal,
      forma: input.forma,
      adquirente: adq,
      ingresso: input.ingresso,
      taxaServico,
      comissao,
      parcelas,
      nsu: input.nsu ?? null,
      autorizacao: input.autorizacao ?? null,
      caixaId: input.caixaId ?? null,
      data: input.data,
      status: "PAGA"
    });

    this.lancar(
      input.data,
      `Venda #${vid} ${input.canal}/${input.forma} evento ${input.eventoId}`,
      [
        [contaAtivo, bruto, 0, centro],
        ["2.1.01", 0, input.ingresso - comissao, centro],
        ["2.1.02", 0, taxaServico + comissao, centro]
      ],
      {
        chave: `venda:${vid}`,
        regra: "venda",
        tipo: "VENDA",
        canal: input.canal,
        eventoId: input.eventoId,
        vendaId: vid
      }
    );

    if (input.forma === "dinheiro") {
      this.cashMovements.push({
        id: this.cashMovements.length + 1,
        caixaId: input.caixaId!,
        tipo: "VENDA",
        valor: bruto,
        vendaId: vid,
        data: input.data
      });
    } else {
      const n = input.forma === "pix" || input.forma === "debito" ? 1 : parcelas;
      const base = Math.trunc(bruto / n);
      const bps = defaultMdrBps(input.forma, n);
      for (let i = 1; i <= n; i++) {
        const valorParcela = base + (i === n ? bruto - base * n : 0);
        const rid = this.receivables.size + 1;
        this.receivables.set(rid, {
          id: rid,
          vendaId: vid,
          adquirente: adq!,
          parcela: i,
          bruto: valorParcela,
          mdrPrevisto: Math.trunc((valorParcela * bps) / 10000),
          mdrReal: null,
          custoAntecipacao: 0,
          liquido: null,
          dataPrevista: addDaysIso(input.data, input.forma === "pix" || input.forma === "debito" ? 1 : 30 * i),
          dataLiquidacao: null,
          status: "PENDENTE"
        });
      }
    }

    return vid;
  }

  public listarRecebiveisPorVenda(vendaId: number): EngineReceivable[] {
    return [...this.receivables.values()].filter((r) => r.vendaId === vendaId);
  }

  public listarTodosRecebiveis(): EngineReceivable[] {
    return [...this.receivables.values()];
  }

  public liquidarRecebivel(recId: number, data: string, mdrReal: number, custoAntecipacao = 0) {
    const r = this.receivables.get(recId);
    if (!r || (r.status !== "PENDENTE" && r.status !== "DIVERGENTE")) {
      throw new ErroContabil(`recebivel ${recId} nao pode ser liquidado`);
    }
    const venda = this.sales.get(r.vendaId)!;
    const ev = this.events.get(venda.eventoId)!;
    const prod = this.producers.get(ev.produtorId)!;
    const centro = `EVT:${venda.eventoId}`;
    const contaReceber = r.adquirente === "GATEWAY" ? "1.1.04" : "1.1.03";
    const liquido = r.bruto - mdrReal - custoAntecipacao;

    this.lancar(
      data,
      `Liquidacao ${r.adquirente} venda #${r.vendaId} parc ${r.parcela}`,
      [
        ["1.1.02", liquido, 0, centro],
        [prod.mdrPorContaProdutor ? "2.1.01" : "4.1.01", mdrReal, 0, centro],
        ["4.1.02", custoAntecipacao, 0, centro],
        [contaReceber, 0, r.bruto, centro]
      ],
      {
        chave: `liq:${recId}`,
        regra: "liquidacao",
        tipo: "LIQUIDACAO",
        eventoId: venda.eventoId,
        vendaId: venda.id
      }
    );

    r.status = "LIQUIDADO";
    r.mdrReal = mdrReal;
    r.custoAntecipacao = custoAntecipacao;
    r.liquido = liquido;
    r.dataLiquidacao = data;
  }

  public anteciparRecebiveis(recIds: number[], data: string, taxaBpsMes: number) {
    for (const rid of recIds) {
      const r = this.receivables.get(rid);
      if (!r) throw new ErroContabil("recebivel inexistente");
      const dias = diffDaysIso(r.dataPrevista, data);
      const custo = Math.trunc(((r.bruto - r.mdrPrevisto) * taxaBpsMes * dias) / (30 * 10000));
      this.liquidarRecebivel(rid, data, r.mdrPrevisto, custo);
    }
  }

  public fluxoProjetado(): Array<[string, number]> {
    const map = new Map<string, number>();
    for (const r of this.receivables.values()) {
      if (r.status === "PENDENTE" || r.status === "DIVERGENTE") {
        map.set(r.dataPrevista, (map.get(r.dataPrevista) ?? 0) + (r.bruto - r.mdrPrevisto));
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  // ----- M6: Conciliação PagSeguro / Gateway -----
  public conciliar(
    adquirente: "PAGSEGURO" | "GATEWAY",
    linhas: Array<{ nsu: string; parcela?: number; bruto: number; mdr: number; data_liquidacao: string }>,
    dataCorte: string
  ) {
    const resumo = { CONCILIADO: 0, DIVERGENTE: 0, SEM_VENDA: 0, DUPLICADO: 0, SEM_RECEBIMENTO: 0 };
    const excecoes: Array<[string, number, string]> = [];
    const vistos = new Set<number>();

    const upsertConciliacao = (
      nsu: string,
      parcela: number,
      recebivelId: number | null,
      status: EngineReconciliationRecord["status"],
      brutoExt: number | null,
      mdrExt: number | null,
      liquidoExt: number | null,
      dataLiqExt: string | null,
      diferenca: number | null
    ) => {
      const existing = [...this.reconciliations.values()].find(
        (c) => c.adquirente === adquirente && c.nsu === nsu && c.parcela === parcela
      );
      if (existing) {
        existing.recebivelId = recebivelId;
        existing.status = status;
        existing.brutoExt = brutoExt;
        existing.mdrExt = mdrExt;
        existing.liquidoExt = liquidoExt;
        existing.dataLiqExt = dataLiqExt;
        existing.diferenca = diferenca;
        return existing.id;
      }
      const id = this.reconciliations.size + 1;
      this.reconciliations.set(id, {
        id,
        adquirente,
        nsu,
        parcela,
        recebivelId,
        status,
        brutoExt,
        mdrExt,
        liquidoExt,
        dataLiqExt,
        diferenca,
        resolvidoPor: null
      });
      return id;
    };

    for (const ln of linhas) {
      const nsu = String(ln.nsu);
      const parc = ln.parcela ?? 1;
      const bruto = ln.bruto;
      const mdr = ln.mdr;
      const dt = ln.data_liquidacao;
      const liqExt = bruto - mdr;

      const r = [...this.receivables.values()].find((rec) => {
        const v = this.sales.get(rec.vendaId);
        return rec.adquirente === adquirente && v?.nsu === nsu && rec.parcela === parc;
      });

      if (!r) {
        upsertConciliacao(nsu, parc, null, "SEM_VENDA", bruto, mdr, liqExt, dt, null);
        resumo.SEM_VENDA += 1;
        excecoes.push([nsu, parc, "SEM_VENDA"]);
      } else if (r.status === "LIQUIDADO") {
        vistos.add(r.id);
        resumo.DUPLICADO += 1;
        excecoes.push([nsu, parc, "DUPLICADO"]);
      } else {
        vistos.add(r.id);
        const dif = bruto - r.bruto - (mdr - r.mdrPrevisto);
        if (bruto === r.bruto && mdr === r.mdrPrevisto) {
          this.liquidarRecebivel(r.id, dt, mdr);
          upsertConciliacao(nsu, parc, r.id, "CONCILIADO", bruto, mdr, liqExt, dt, 0);
          resumo.CONCILIADO += 1;
        } else {
          r.status = "DIVERGENTE";
          upsertConciliacao(nsu, parc, r.id, "DIVERGENTE", bruto, mdr, liqExt, dt, dif);
          resumo.DIVERGENTE += 1;
          excecoes.push([nsu, parc, "DIVERGENTE"]);
        }
      }
    }

    for (const r of this.receivables.values()) {
      if (r.adquirente === adquirente && r.status === "PENDENTE" && r.dataPrevista <= dataCorte && !vistos.has(r.id)) {
        const v = this.sales.get(r.vendaId)!;
        upsertConciliacao(v.nsu!, r.parcela, r.id, "SEM_RECEBIMENTO", null, null, null, null, null);
        resumo.SEM_RECEBIMENTO += 1;
        excecoes.push([v.nsu!, r.parcela, "SEM_RECEBIMENTO"]);
      }
    }

    return { resumo, excecoes };
  }

  public listarConciliacoesPorStatus(status: EngineReconciliationRecord["status"]): EngineReconciliationRecord[] {
    return [...this.reconciliations.values()].filter((c) => c.status === status);
  }

  public aceitarDivergencia(conciliacaoId: number, usuario: string, data?: string) {
    const c = this.reconciliations.get(conciliacaoId);
    if (!c || c.status !== "DIVERGENTE" || !c.recebivelId) {
      throw new ErroContabil("apenas conciliacoes DIVERGENTES podem ser aceitas");
    }
    const r = this.receivables.get(c.recebivelId)!;
    if (c.brutoExt !== r.bruto) {
      throw new ErroContabil("valor bruto divergente: corrija a venda/estorne antes de aceitar");
    }
    this.liquidarRecebivel(r.id, data ?? c.dataLiqExt!, c.mdrExt!);
    c.status = "RESOLVIDO";
    c.resolvidoPor = usuario;
  }

  // ----- M7, M8 & M9: Fiscal, Reconhecimento de Receita, Reembolsos e Chargebacks -----
  private provisionarImpostos(eventoId: number, base: number, data: string, reversao = false) {
    if (base <= 0) return;
    const centro = `EVT:${eventoId}`;
    for (const [tributo, bps] of Object.entries(this.taxRatesBps)) {
      const valor = Math.trunc((base * bps) / 10000);
      if (valor === 0) continue;
      this.lancar(
        data,
        `${reversao ? "Reversao de " : "Provisao de "}${tributo} evento ${eventoId}`,
        reversao
          ? [
              ["2.1.03", valor, 0, centro],
              ["3.2.01", 0, valor, centro]
            ]
          : [
              ["3.2.01", valor, 0, centro],
              ["2.1.03", 0, valor, centro]
            ],
        { regra: "imposto", tipo: "IMPOSTO", eventoId }
      );
      this.taxRecords.push({
        periodo: data.slice(0, 7),
        eventoId,
        tributo,
        base: reversao ? -base : base,
        aliquotaBps: bps,
        valor: reversao ? -valor : valor
      });
    }
  }

  public realizarEvento(eventoId: number, data: string): number {
    const ev = this.events.get(eventoId);
    if (!ev || ev.status !== "AGENDADO") throw new ErroContabil("evento nao esta agendado");
    const centro = `EVT:${eventoId}`;
    const diferido = this.saldoCredor("2.1.02", centro);
    if (diferido > 0) {
      this.lancar(
        data,
        `Reconhecimento de receita evento ${eventoId}`,
        [
          ["2.1.02", diferido, 0, centro],
          ["3.1.01", 0, diferido, centro]
        ],
        { chave: `realizado:${eventoId}`, regra: "reconhecimento", tipo: "RECONHECIMENTO", eventoId }
      );
      this.provisionarImpostos(eventoId, diferido, data, false);
    }
    ev.status = "REALIZADO";
    return diferido;
  }

  public reembolsar(vendaId: number, data: string, motivo: string, caixaId?: number) {
    const v = this.sales.get(vendaId);
    if (!v || v.status !== "PAGA") {
      throw new ErroContabil(`venda ${vendaId} nao pode ser reembolsada`);
    }
    const ev = this.events.get(v.eventoId)!;
    const bruto = v.ingresso + v.taxaServico;
    const repParte = v.ingresso - v.comissao;
    const difParte = v.taxaServico + v.comissao;
    const centro = `EVT:${v.eventoId}`;
    const contaDif = ev.status === "REALIZADO" ? "3.2.01" : "2.1.02";

    const partidas: Array<[string, number, number, string | null]> = [
      ["2.1.01", repParte, 0, centro],
      [contaDif, difParte, 0, centro]
    ];

    if (v.forma === "dinheiro") {
      this.exigirCaixaAberto(caixaId);
      this.cashMovements.push({
        id: this.cashMovements.length + 1,
        caixaId: caixaId!,
        tipo: "REEMBOLSO",
        valor: bruto,
        vendaId,
        data
      });
      partidas.push(["1.1.01", 0, bruto, centro]);
    } else {
      const recs = this.listarRecebiveisPorVenda(vendaId);
      const pend = recs
        .filter((r) => r.status === "PENDENTE" || r.status === "DIVERGENTE")
        .reduce((a, b) => a + b.bruto, 0);
      const liq = recs.filter((r) => r.status === "LIQUIDADO").reduce((a, b) => a + b.bruto, 0);
      const contaRec = v.adquirente === "GATEWAY" ? "1.1.04" : "1.1.03";
      partidas.push([contaRec, 0, pend, centro], ["1.1.02", 0, liq, centro]);
      for (const r of recs) {
        if (r.status === "PENDENTE" || r.status === "DIVERGENTE") r.status = "CANCELADO";
      }
    }

    this.lancar(data, `Reembolso venda #${vendaId}: ${motivo}`, partidas, {
      chave: `reembolso:${vendaId}`,
      regra: "reembolso",
      tipo: "REEMBOLSO",
      canal: v.canal,
      eventoId: v.eventoId,
      vendaId
    });

    if (ev.status === "REALIZADO") {
      this.provisionarImpostos(v.eventoId, difParte, data, true);
    }
    v.status = "REEMBOLSADA";
  }

  public abrirChargeback(vendaId: number, data: string): number {
    const v = this.sales.get(vendaId);
    if (!v || v.forma === "dinheiro" || v.status !== "PAGA") {
      throw new ErroContabil("chargeback so se aplica a venda eletronica com status PAGA");
    }
    const recs = this.listarRecebiveisPorVenda(vendaId);
    const liq = recs.filter((r) => r.status === "LIQUIDADO").reduce((a, b) => a + b.bruto, 0);
    const pend = recs
      .filter((r) => r.status === "PENDENTE" || r.status === "DIVERGENTE")
      .reduce((a, b) => a + b.bruto, 0);
    const centro = `EVT:${v.eventoId}`;
    const contaRec = v.adquirente === "GATEWAY" ? "1.1.04" : "1.1.03";

    this.lancar(
      data,
      `Chargeback aberto venda #${vendaId}`,
      [
        ["1.1.05", liq + pend, 0, centro],
        ["1.1.02", 0, liq, centro],
        [contaRec, 0, pend, centro]
      ],
      {
        chave: `cb_abre:${vendaId}`,
        regra: "chargeback_abertura",
        tipo: "CHARGEBACK",
        canal: v.canal,
        eventoId: v.eventoId,
        vendaId
      }
    );

    for (const r of recs) {
      if (r.status === "PENDENTE" || r.status === "DIVERGENTE") r.status = "RETIDO";
    }
    v.status = "CHARGEBACK";
    const cbId = this.chargebacks.size + 1;
    this.chargebacks.set(cbId, {
      id: cbId,
      vendaId,
      valor: v.ingresso + v.taxaServico,
      valorLiquidado: liq,
      valorPendente: pend,
      status: "ABERTO",
      abertoEm: data,
      fechadoEm: null
    });
    return cbId;
  }

  public resolverChargeback(chargebackId: number, data: string, perdido: boolean) {
    const cb = this.chargebacks.get(chargebackId);
    if (!cb || cb.status !== "ABERTO") throw new ErroContabil("chargeback ja encerrado");
    const v = this.sales.get(cb.vendaId)!;
    const ev = this.events.get(v.eventoId)!;
    const centro = `EVT:${v.eventoId}`;
    const total = cb.valorLiquidado + cb.valorPendente;
    const recs = this.listarRecebiveisPorVenda(v.id);

    if (perdido) {
      const repParte = v.ingresso - v.comissao;
      const difParte = v.taxaServico + v.comissao;
      const contaDif = ev.status === "REALIZADO" ? "3.2.01" : "2.1.02";
      this.lancar(
        data,
        `Chargeback perdido venda #${v.id}`,
        [
          ["2.1.01", repParte, 0, centro],
          [contaDif, difParte, 0, centro],
          ["1.1.05", 0, total, centro]
        ],
        {
          chave: `cb_fecha:${chargebackId}`,
          regra: "chargeback_perda",
          tipo: "CHARGEBACK",
          canal: v.canal,
          eventoId: v.eventoId,
          vendaId: v.id
        }
      );
      for (const r of recs) {
        if (r.status === "RETIDO") r.status = "CANCELADO";
      }
      v.status = "PERDIDA";
      if (ev.status === "REALIZADO") {
        this.provisionarImpostos(v.eventoId, difParte, data, true);
      }
      cb.status = "PERDIDO";
    } else {
      const contaRec = v.adquirente === "GATEWAY" ? "1.1.04" : "1.1.03";
      this.lancar(
        data,
        `Chargeback ganho venda #${v.id}`,
        [
          ["1.1.02", cb.valorLiquidado, 0, centro],
          [contaRec, cb.valorPendente, 0, centro],
          ["1.1.05", 0, total, centro]
        ],
        {
          chave: `cb_fecha:${chargebackId}`,
          regra: "chargeback_ganho",
          tipo: "CHARGEBACK",
          canal: v.canal,
          eventoId: v.eventoId,
          vendaId: v.id
        }
      );
      for (const r of recs) {
        if (r.status === "RETIDO") r.status = "PENDENTE";
      }
      v.status = "PAGA";
      cb.status = "GANHO";
    }
    cb.fechadoEm = data;
  }

  public cancelarEvento(eventoId: number, data: string, motivo = "evento cancelado", caixaId?: number): number {
    const vendasPagas = [...this.sales.values()].filter((s) => s.eventoId === eventoId && s.status === "PAGA");
    for (const s of vendasPagas) {
      this.reembolsar(s.id, data, motivo, caixaId);
    }
    const ev = this.events.get(eventoId)!;
    ev.status = "CANCELADO";
    return vendasPagas.length;
  }

  // ----- Ajuste 4: Retenções Obrigatórias (ECAD, Locação, Equipe, Reserva de Risco) -----
  public constituirRetencaoObrigatoria(input: {
    eventoId: number;
    categoria: "ECAD" | "ALUGUEL_ESPACO" | "EQUIPE_PRODUCAO" | "TRIBUTOS_ENCARGOS" | "RESERVA_RISCO" | "OUTRAS_DESPESAS";
    descricao: string;
    valor: number;
    data: string;
  }): number {
    const ev = this.events.get(input.eventoId);
    if (!ev) throw new ErroContabil("evento inexistente");
    const centro = `EVT:${input.eventoId}`;
    const saldoLivreProdutor = this.saldoCredor("2.1.01", centro);
    if (input.valor <= 0 || input.valor > saldoLivreProdutor) {
      throw new ErroContabil(`Retenção (${input.valor}) excede obrigação livre do produtor (${saldoLivreProdutor})`);
    }
    const id = this.retentions.size + 1;
    const lid = this.lancar(
      input.data,
      `Retenção obrigatória ${input.categoria} (${input.descricao}) evento ${input.eventoId}`,
      [
        ["2.1.01", input.valor, 0, centro],
        ["2.1.04", 0, input.valor, centro]
      ],
      {
        chave: `retencao:${id}`,
        regra: "retencao_obrigatoria",
        tipo: "RETENCAO",
        eventoId: input.eventoId
      }
    );
    this.retentions.set(id, {
      id,
      eventoId: input.eventoId,
      categoria: input.categoria,
      descricao: input.descricao,
      valor: input.valor,
      lancamentoId: lid,
      status: "ATIVA"
    });
    return id;
  }

  // ----- Ajuste 3: Transferência Contábil Entre Eventos do Mesmo Produtor -----
  public transferirSaldoEntreEventos(input: {
    eventoOrigemId: number;
    eventoDestinoId: number;
    valor: number;
    data: string;
    motivo: string;
  }): number {
    if (input.eventoOrigemId === input.eventoDestinoId) {
      throw new ErroContabil("Eventos de origem e destino devem ser distintos");
    }
    const evOrig = this.events.get(input.eventoOrigemId);
    const evDest = this.events.get(input.eventoDestinoId);
    if (!evOrig || !evDest) throw new ErroContabil("Evento inexistente");
    if (evOrig.produtorId !== evDest.produtorId) {
      throw new ErroContabil("Transferência entre produtores distintos é proibida");
    }
    const prod = this.producers.get(evOrig.produtorId)!;
    if (!prod.permiteTransferenciaEventos) {
      throw new ErroContabil("Permissão de transferência entre eventos desabilitada pelo Financeiro SOUL");
    }
    const centroOrig = `EVT:${input.eventoOrigemId}`;
    const centroDest = `EVT:${input.eventoDestinoId}`;
    const saldoLivreOrig = this.saldoCredor("2.1.01", centroOrig);
    if (input.valor <= 0 || input.valor > saldoLivreOrig) {
      throw new ErroContabil(`Saldo livre insuficiente no evento de origem (${saldoLivreOrig}) após retenções`);
    }

    return this.lancar(
      input.data,
      `Transferência interna entre eventos #${input.eventoOrigemId} -> #${input.eventoDestinoId}: ${input.motivo}`,
      [
        ["2.1.01", input.valor, 0, centroOrig],
        ["2.1.01", 0, input.valor, centroDest]
      ],
      {
        regra: "transferencia_eventos",
        tipo: "TRANSFERENCIA_EVENTOS",
        eventoId: input.eventoOrigemId
      }
    );
  }

  // ----- M4 & Ajuste 2: Apuração e Pagamento de Repasses (Pós-Evento D+X e Antecipado com Travas) -----
  public demonstrativoRepasse(eventoId: number) {
    const c = `EVT:${eventoId}`;
    let creditos = 0;
    for (const j of this.journals) {
      for (const p of j.partidas) {
        if (p.conta === "2.1.01" && p.centro === c) creditos += p.credito;
      }
    }
    const pagos = [...this.repasses.values()]
      .filter((r) => r.eventoId === eventoId && r.status === "PAGO")
      .reduce((a, b) => a + b.valor, 0);
    const saldoLivre = this.saldoCredor("2.1.01", c);
    const retencoesVinculadas = this.saldoCredor("2.1.04", c);
    return {
      vendidoLiquidoComissao: creditos,
      jaPago: pagos,
      retencoesObrigatorias: retencoesVinculadas,
      reembolsosChargebacksMdrRetencoes: creditos - pagos - saldoLivre,
      saldoARepassar: saldoLivre
    };
  }

  public apurarRepasse(
    eventoId: number,
    usuario: string,
    data: string,
    opcoes?: { valor?: number; antecipado?: boolean }
  ): number {
    const ev = this.events.get(eventoId);
    if (!ev) throw new ErroContabil("evento inexistente");
    const prod = this.producers.get(ev.produtorId)!;
    const saldo = this.demonstrativoRepasse(eventoId).saldoARepassar;
    const valor = opcoes?.valor ?? saldo;
    const antecipado = opcoes?.antecipado ?? false;

    if (valor <= 0 || valor > saldo) {
      throw new ErroContabil(`valor invalido para repasse (saldo ${saldo})`);
    }
    if (!antecipado) {
      if (ev.status !== "REALIZADO") {
        throw new ErroContabil("repasse normal so apos a realizacao do evento (use antecipado=true)");
      }
      if (data < addDaysIso(ev.dataEvento, prod.prazoRepasseDias)) {
        throw new ErroContabil("prazo de repasse (D+X) ainda nao venceu");
      }
    } else {
      if (ev.status === "CANCELADO") throw new ErroContabil("evento cancelado");
      if (ev.tetoTravaAntecipadaCents !== undefined) {
        const jaApuradosOuPagos = [...this.repasses.values()]
          .filter((r) => r.eventoId === eventoId && r.antecipado)
          .reduce((a, b) => a + b.valor, 0);
        if (jaApuradosOuPagos + valor > ev.tetoTravaAntecipadaCents) {
          throw new ErroContabil(
            `Valor (${valor}) excede o teto liberado pelas Travas de Repasse (${ev.tetoTravaAntecipadaCents - jaApuradosOuPagos})`
          );
        }
      }
    }

    const id = this.repasses.size + 1;
    this.repasses.set(id, {
      id,
      eventoId,
      valor,
      status: "APURADO",
      antecipado,
      apuradoPor: usuario,
      pagoPor: null,
      dataApuracao: data,
      dataPagamento: null,
      lancamentoId: null
    });
    return id;
  }

  public pagarRepasse(repasseId: number, usuario: string, data: string) {
    const r = this.repasses.get(repasseId);
    if (!r || r.status !== "APURADO") throw new ErroContabil("repasse ja pago ou inexistente");
    if (usuario === r.apuradoPor) {
      throw new ErroContabil("segregacao de funcoes: quem apura nao pode pagar");
    }
    if (r.valor > this.demonstrativoRepasse(r.eventoId).saldoARepassar) {
      throw new ErroContabil("saldo insuficiente: houve estorno/chargeback/retencao apos a apuracao");
    }
    const centro = `EVT:${r.eventoId}`;
    const lid = this.lancar(
      data,
      `Repasse #${repasseId} evento ${r.eventoId}`,
      [
        ["2.1.01", r.valor, 0, centro],
        ["1.1.02", 0, r.valor, centro]
      ],
      { chave: `repasse:${repasseId}`, regra: "repasse", tipo: "REPASSE", eventoId: r.eventoId }
    );
    r.status = "PAGO";
    r.pagoPor = usuario;
    r.dataPagamento = data;
    r.lancamentoId = lid;
  }

  // ----- M10: Relatórios Contábeis (Balancete, Razão, DRE, Passivo Produtores) -----
  public balancete(ate?: string) {
    const linhas: Array<{ codigo: string; nome: string; debito: number; credito: number; saldoDevedor: number }> = [];
    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      if (!acc.postable) continue;
      let d = 0;
      let c = 0;
      for (const j of this.journals) {
        if (ate && j.data > ate) continue;
        for (const p of j.partidas) {
          if (p.conta === acc.code) {
            d += p.debito;
            c += p.credito;
          }
        }
      }
      if (d > 0 || c > 0) {
        linhas.push({ codigo: acc.code, nome: acc.name, debito: d, credito: c, saldoDevedor: d - c });
      }
    }
    const totalDebito = linhas.reduce((a, b) => a + b.debito, 0);
    const totalCredito = linhas.reduce((a, b) => a + b.credito, 0);
    return {
      linhas,
      totalDebito,
      totalCredito,
      fecha: totalDebito === totalCredito
    };
  }

  public dre(eventoId?: number) {
    const centro = eventoId !== undefined ? `EVT:${eventoId}` : null;
    const receita = this.saldo("3.1", centro) + this.saldo("3.3", centro);
    const deducoes = this.saldo("3.2", centro);
    const despesas = this.saldo("4.1", centro);
    return {
      receitaBruta: receita,
      deducoes: -deducoes,
      receitaLiquida: receita - deducoes,
      despesas: -despesas,
      resultado: receita - deducoes - despesas
    };
  }

  public passivoProdutores(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const j of this.journals) {
      for (const p of j.partidas) {
        if (p.conta === "2.1.01" && p.centro) {
          out[p.centro] = (out[p.centro] ?? 0) + (p.credito - p.debito);
        }
      }
    }
    return out;
  }
}
