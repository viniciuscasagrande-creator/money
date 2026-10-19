export type UserRole =
  | "ADMIN"
  | "FINANCEIRO_INTERNO"
  | "TESOURARIA"
  | "CONTABILIDADE"
  | "PRODUTOR"
  | "AUDITOR";

export type ImplementationPackage = "P1" | "P2" | "P3" | "P4";

export type SubmenuOrigin = "Documento" | "Proposta" | "Acréscimo";

export interface SubMenuItem {
  id: string;
  code: string;
  title: string;
  description: string;
  allowedRoles: UserRole[];
  pkg: ImplementationPackage;
  origin: SubmenuOrigin;
  note?: string;
}

export interface MainMenuItem {
  id: string;
  number: string;
  title: string;
  iconName: string;
  pkg: ImplementationPackage;
  docCount: number;
  addedCount: number;
  removedCount: number;
  allowedRoles: UserRole[];
  submenus: SubMenuItem[];
}

export interface ArchitecturalRule {
  id: string;
  title: string;
  description: string;
  relatedMenus: string[];
  status: string;
}

export const ARCHITECTURAL_RULES: ArchitecturalRule[] = [
  {
    id: "rule-1",
    title: "Razão de dupla entrada, imutável",
    description:
      "Todo lançamento tem débito e crédito. Erros são corrigidos por lançamento reverso/compensatório, nunca por edição ou exclusão.",
    relatedMenus: ["05", "09", "13", "16"],
    status: "ATIVO NO KERNEL SQLITE",
  },
  {
    id: "rule-2",
    title: "Idempotência",
    description:
      "Webhooks, cobranças e repasses usam chave única (Idempotency-Key) para que o mesmo evento não seja processado duas vezes.",
    relatedMenus: ["06", "07", "09"],
    status: "ATIVO NAS APIS",
  },
  {
    id: "rule-3",
    title: "Segregação de funções (SoD)",
    description:
      "Quem cria um repasse, pagamento ou antecipação não pode aprová-lo nem executá-lo.",
    relatedMenus: ["15", "16", "17"],
    status: "ATIVO EM ALÇADAS",
  },
  {
    id: "rule-4",
    title: "Segurança em operações sensíveis",
    description:
      "Autenticação em dois fatores (2FA) para repasses e trava temporária de saques após troca de conta bancária.",
    relatedMenus: ["05", "06", "16"],
    status: "ATIVO (2FA + QUARENTENA)",
  },
  {
    id: "rule-5",
    title: "Fechamento de período",
    description:
      "Após o fechamento contábil, lançamentos em meses encerrados ficam bloqueados; correções entram no período aberto.",
    relatedMenus: ["13", "17"],
    status: "ATIVO (TRAVA COMPETÊNCIA)",
  },
  {
    id: "rule-6",
    title: "Saldo ligado ao status do evento",
    description:
      "O saldo só é liberado conforme a regra do evento (por exemplo, após sua realização), com reserva de garantia quando aplicável.",
    relatedMenus: ["05", "06", "10"],
    status: "ATIVO POR EVENTO",
  },
  {
    id: "rule-7",
    title: "Separação receita x recursos de terceiros",
    description:
      "Distinguir faturamento, valores recebidos, valores a repassar, taxas e receita própria. Saldo bancário não é lucro.",
    relatedMenus: ["05", "08", "14"],
    status: "SEGREGAÇÃO NATIVA",
  },
  {
    id: "rule-8",
    title: "Permissões também nas APIs",
    description:
      "Restrições por perfil valem nas telas, nas APIs e nas consultas de dados.",
    relatedMenus: ["16", "17"],
    status: "RBAC BACKEND + UI",
  },
];

export interface RoleProfileInfo {
  role: UserRole;
  label: string;
  shortLabel: string;
  portalType: "INTERNO" | "PRODUTOR";
  description: string;
  badgeColor: string;
  defaultUser: string;
  defaultEmail: string;
}

export const ROLE_PROFILES: Record<UserRole, RoleProfileInfo> = {
  ADMIN: {
    role: "ADMIN",
    label: "Administrador",
    shortLabel: "Admin",
    portalType: "INTERNO",
    description: "Todos os menus, gestão de permissões e auditoria",
    badgeColor: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    defaultUser: "Carlos Eduardo (Diretor Admin)",
    defaultEmail: "admin@erpfinanceiro.com.br",
  },
  FINANCEIRO_INTERNO: {
    role: "FINANCEIRO_INTERNO",
    label: "Financeiro interno",
    shortLabel: "Fin. Interno",
    portalType: "INTERNO",
    description: "Visão consolidada, repasses, recebimentos, taxas, aprovações e relatórios",
    badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    defaultUser: "Henrique Dias (Coord. Financeiro)",
    defaultEmail: "financeiro@erpfinanceiro.com.br",
  },
  TESOURARIA: {
    role: "TESOURARIA",
    label: "Tesouraria",
    shortLabel: "Tesouraria",
    portalType: "INTERNO",
    description: "Bancos, caixa, conciliações e pagamentos autorizados",
    badgeColor: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    defaultUser: "Marina Costa (Tesouraria & Bancos)",
    defaultEmail: "tesouraria@erpfinanceiro.com.br",
  },
  CONTABILIDADE: {
    role: "CONTABILIDADE",
    label: "Contabilidade",
    shortLabel: "Contábil",
    portalType: "INTERNO",
    description: "Classificações, fechamento, demonstrativos e integração fiscal",
    badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    defaultUser: "Dr. Paulo Ribeiro (Contador Chefe)",
    defaultEmail: "contabilidade@erpfinanceiro.com.br",
  },
  PRODUTOR: {
    role: "PRODUTOR",
    label: "Produtor ou parceiro",
    shortLabel: "Produtor",
    portalType: "PRODUTOR",
    description: "Apenas seus saldos, solicitações, demonstrativos e operações autorizadas",
    badgeColor: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    defaultUser: "Roberto Almeida (Live Stage Brasil)",
    defaultEmail: "financeiro@livestage.com.br",
  },
  AUDITOR: {
    role: "AUDITOR",
    label: "Auditor",
    shortLabel: "Auditor",
    portalType: "INTERNO",
    description: "Consulta de históricos, operações, evidências e logs, sem execução financeira",
    badgeColor: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    defaultUser: "Sofia Martins (Auditoria Independente)",
    defaultEmail: "auditoria@bdo-compliance.com.br",
  },
};

export const PACKAGE_INFO: Record<
  ImplementationPackage,
  {
    code: ImplementationPackage;
    number: string;
    name: string;
    menusIncluded: string;
    summary: string;
    color: string;
  }
> = {
  P1: {
    code: "P1",
    number: "01",
    name: "Fundação",
    menusIncluded: "01, 02, 03, 05",
    summary:
      "Dashboard, núcleo financeiro, contas, recebimentos, pagamentos, saldos (incluindo cadastro bancário do produtor) e permissões",
    color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  P2: {
    code: "P2",
    number: "02",
    name: "Operações",
    menusIncluded: "04, 06, 07, 08, 15",
    summary:
      "Tesouraria (incluindo PDV), gateways, taxas e promoções, repasses, acerto de evento, antecipações, aprovações e assinaturas",
    color: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  P3: {
    code: "P3",
    number: "03",
    name: "Controle",
    menusIncluded: "09, 10, 11, 12, 13",
    summary:
      "Conciliações, estornos, cancelamento de evento, chargebacks, contratos, planejamento e integração contábil/fiscal",
    color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  P4: {
    code: "P4",
    number: "04",
    name: "Inteligência e Governança",
    menusIncluded: "14, 16, 17",
    summary: "Relatórios, indicadores, auditoria, logs, automações e configurações",
    color: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
};

const ALL_INTERNAL: UserRole[] = [
  "ADMIN",
  "FINANCEIRO_INTERNO",
  "TESOURARIA",
  "CONTABILIDADE",
  "AUDITOR",
];
const ALL_ROLES: UserRole[] = [
  "ADMIN",
  "FINANCEIRO_INTERNO",
  "TESOURARIA",
  "CONTABILIDADE",
  "PRODUTOR",
  "AUDITOR",
];

function buildSubmenus(
  menuNumber: string,
  pkg: ImplementationPackage,
  allowedRoles: UserRole[],
  items: Array<{
    title: string;
    origin: SubmenuOrigin;
    desc: string;
    roles?: UserRole[];
    note?: string;
  }>
): SubMenuItem[] {
  return items.map((item, idx) => {
    const subNum = String(idx + 1).padStart(2, "0");
    return {
      id: `${menuNumber}-${subNum}`,
      code: `${menuNumber}.${subNum}`,
      title: item.title,
      description: item.desc,
      allowedRoles: item.roles || allowedRoles,
      pkg,
      origin: item.origin,
      note: item.note,
    };
  });
}

export const FINANCIAL_MENUS: MainMenuItem[] = [
  {
    id: "menu-01",
    number: "01",
    title: "Dashboard Financeiro",
    iconName: "LayoutDashboard",
    pkg: "P1",
    docCount: 7,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("01", "P1", ALL_ROLES, [
      {
        title: "Visão Geral Financeira",
        origin: "Documento",
        desc: "Síntese operacional em tempo real separando receita própria, custódia de terceiros e liquidez.",
      },
      {
        title: "Indicadores de Receitas e Despesas",
        origin: "Documento",
        desc: "Take rate efetivo, margem operacional, receitas de taxas vs. custos de processamento e OPEX.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Posição de Caixa e Bancos",
        origin: "Documento",
        desc: "Disponibilidades bancárias imediatas vs. passivo exigível de produtores e contas escrow.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Saldos Consolidados",
        origin: "Documento",
        desc: "Visão matricial de saldos disponíveis, a liberar e bloqueados por conta corrente e evento.",
      },
      {
        title: "Previsão de Fluxo de Caixa",
        origin: "Documento",
        desc: "Projeção de entradas de adquirentes, saídas operacionais e programação de repasses.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Alertas e Pendências",
        origin: "Documento",
        desc: "Fila crítica de aprovações de alçada, divergências de conciliação, chargebacks e vencimentos.",
      },
      {
        title: "Painel Executivo",
        origin: "Documento",
        desc: "KPIs estratégicos para diretoria: TPV (Volume Total Transacionado), EBITDA, float e margem líquida.",
        roles: ALL_INTERNAL,
      },
    ]),
  },
  {
    id: "menu-02",
    number: "02",
    title: "Gestão de Recebimentos",
    iconName: "ArrowDownLeft",
    pkg: "P1",
    docCount: 8,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("02", "P1", ALL_ROLES, [
      {
        title: "Contas a Receber",
        origin: "Documento",
        desc: "Títulos ativos de vendas de ingressos, cotas de patrocínio, faturas B2B e taxas contratuais.",
      },
      {
        title: "Recebimentos por Período",
        origin: "Documento",
        desc: "Análise cronológica por data de competência (venda) vs. data de caixa (liquidação efetiva).",
      },
      {
        title: "Recebimentos por Cliente",
        origin: "Documento",
        desc: "Rastreamento individual por comprador, patrocinador ou empresa contratante.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Vendas e Transações",
        origin: "Documento",
        desc: "Listagem analítica de pedidos com decomposição automática de valor de face, taxas e MDR.",
      },
      {
        title: "Agenda de Recebíveis",
        origin: "Documento",
        desc: "Calendário de liquidação de parcelas de cartão de crédito, PIX e boletos registrados.",
      },
      {
        title: "Liquidações Financeiras",
        origin: "Documento",
        desc: "Baixas efetivas de lotes liquidados pelos gateways e bancos no razão financeiro.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Cobranças e Inadimplência",
        origin: "Documento",
        desc: "Gestão de faturas vencidas, régua de cobrança automatizada e renegociação de cotas.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Histórico de Recebimentos",
        origin: "Documento",
        desc: "Registro imutável de todas as entradas liquidadas com vínculo direto ao lançamento no Ledger.",
      },
    ]),
  },
  {
    id: "menu-03",
    number: "03",
    title: "Contas a Pagar",
    iconName: "ArrowUpRight",
    pkg: "P1",
    docCount: 8,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("03", "P1", ALL_INTERNAL, [
      {
        title: "Contas a Pagar em Aberto",
        origin: "Proposta",
        note: "Renomeado de 'Contas a Pagar' para diferenciar do nome do menu principal",
        desc: "Títulos em aberto com fornecedores, infraestrutura, segurança e operação.",
      },
      {
        title: "Lançamento de Despesas",
        origin: "Proposta",
        desc: "Inclusão de novas obrigações financeiras vinculadas a centro de custo e alçada de aprovação.",
      },
      {
        title: "Agenda de Pagamentos",
        origin: "Proposta",
        desc: "Calendário de desembolsos programados validado contra o saldo livre da conta movimento própria.",
      },
      {
        title: "Pagamentos por Fornecedor",
        origin: "Proposta",
        desc: "Visão consolidada por credor, contratos vigentes, retenções fiscais e histórico.",
      },
      {
        title: "Pagamentos em Lote",
        origin: "Proposta",
        desc: "Agrupamento de títulos aprovados para remessa bancária ou disparo PIX corporativo.",
      },
      {
        title: "Despesas Recorrentes",
        origin: "Proposta",
        desc: "Assinaturas de software, folha, aluguéis e contratos mensais com provisionamento automático.",
      },
      {
        title: "Cadastro de Fornecedores",
        origin: "Proposta",
        desc: "Base homologada de fornecedores com dados bancários, CNPJ e enquadramento de retenção fiscal.",
      },
      {
        title: "Histórico de Pagamentos",
        origin: "Proposta",
        desc: "Trilha completa de pagamentos efetuados, aprovadores responsáveis e conciliação bancária.",
      },
    ]),
  },
  {
    id: "menu-04",
    number: "04",
    title: "Tesouraria e Bancos",
    iconName: "Landmark",
    pkg: "P2",
    docCount: 9,
    addedCount: 3,
    removedCount: 0,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("04", "P2", ALL_INTERNAL, [
      {
        title: "Dashboard de Tesouraria",
        origin: "Documento",
        desc: "Controle diário de liquidez, posição de contas operacionais próprias vs. contas escrow de custódia.",
      },
      {
        title: "Contas Bancárias",
        origin: "Documento",
        desc: "Cadastro e governança de contas correntes, contas de liquidação e instituições de pagamento.",
      },
      {
        title: "Saldos e Extratos",
        origin: "Documento",
        desc: "Espelhamento de extratos bancários via Open Finance / API e comparação com saldo contábil.",
      },
      {
        title: "Movimentações Financeiras",
        origin: "Documento",
        desc: "Entradas e saídas bancárias classificadas por natureza e vinculadas ao razão central.",
      },
      {
        title: "Transferências Bancárias",
        origin: "Documento",
        desc: "Transferências entre contas próprias (sweeping de taxas) e liquidação de TED/TEF.",
      },
      {
        title: "PIX e Chaves",
        origin: "Documento",
        desc: "Gestão de chaves PIX, QR Codes dinâmicos de cobrança e chaves favorecidas.",
      },
      {
        title: "Remessas e Retornos CNAB",
        origin: "Documento",
        desc: "Processamento de arquivos CNAB 240/400 para pagamentos em lote e boletos bancários.",
      },
      {
        title: "Projeção de Caixa",
        origin: "Documento",
        desc: "Simulação de caixa curto e médio prazo com estresse de liquidez e janela de repasses.",
      },
      {
        title: "Gestão de Aplicações Financeiras",
        origin: "Documento",
        desc: "Controle de CDBs, compromissadas, rendimentos sobre float e fundo de reserva.",
      },
      {
        title: "Fechamento de Caixa (PDV)",
        origin: "Acréscimo",
        desc: "Apuração e conferência de vendas presenciais em bilheteria física, totens e maquininhas POS.",
      },
      {
        title: "Sangria e Suprimento",
        origin: "Acréscimo",
        desc: "Controle de retiradas de numerário (sangria) e troco inicial (suprimento) nos caixas físicos do evento.",
      },
      {
        title: "Conferência por Operador",
        origin: "Acréscimo",
        desc: "Auditoria individual por turno e operador de caixa físico (dinheiro, cartão presente e PIX POS).",
      },
    ]),
  },
  {
    id: "menu-05",
    number: "05",
    title: "Saldos e Contas Correntes",
    iconName: "Wallet",
    pkg: "P1",
    docCount: 8,
    addedCount: 3,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("05", "P1", ALL_ROLES, [
      {
        title: "Saldos por Produtor",
        origin: "Proposta",
        desc: "Visão consolidada das subcontas virtuais de cada produtor/organizador no Razão Financeiro.",
      },
      {
        title: "Saldos por Evento",
        origin: "Proposta",
        desc: "Isolamento contábil-financeiro por evento para evitar contaminação cruzada de caixas.",
      },
      {
        title: "Conta Corrente do Produtor",
        origin: "Proposta",
        desc: "Ficha financeira completa do produtor: créditos de vendas, taxas descontadas, repasses e retenções.",
      },
      {
        title: "Saldo Disponível",
        origin: "Proposta",
        desc: "Valores já liquidados e livres de travas contratuais, aptos para saque imediato.",
      },
      {
        title: "Saldo a Liberar",
        origin: "Proposta",
        desc: "Valores vinculados à agenda de adquirentes (D+30) ou aguardando a realização do evento.",
      },
      {
        title: "Saldo Bloqueado",
        origin: "Proposta",
        desc: "Valores retidos por reserva de garantia, chargebacks em aberto, trava de troca bancária ou ordem judicial.",
      },
      {
        title: "Extrato de Movimentações",
        origin: "Proposta",
        desc: "Extrato cronológico imutável de partidas dobradas (débito, crédito e saldo após cada operação).",
      },
      {
        title: "Ajustes e Lançamentos Compensatórios",
        origin: "Proposta",
        note: "Lançamentos compensatórios/reversos no lugar de ajuste manual para preservar a imutabilidade do saldo",
        desc: "Estornos e correções estritamente via lançamento reverso auditado, sem edição direta de saldo.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Dados Bancários e Validação de Titularidade",
        origin: "Acréscimo",
        desc: "Cadastro de domicílio bancário e chave PIX validando mesmo CNPJ/CPF do contrato do produtor (KYC/KYB).",
      },
      {
        title: "Aprovação de Alteração de Conta Bancária",
        origin: "Acréscimo",
        desc: "Fluxo de segurança com trava temporária de saques (quarentena de 48h) após alteração de conta favorecida.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Documentos e Análise Cadastral",
        origin: "Acréscimo",
        desc: "Dossiê KYC/KYB do produtor: contrato social, procurações, comprovante bancário e validação PLD.",
      },
    ]),
  },
  {
    id: "menu-06",
    number: "06",
    title: "Repasses e Antecipações",
    iconName: "Send",
    pkg: "P2",
    docCount: 10,
    addedCount: 3,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("06", "P2", ALL_ROLES, [
      {
        title: "Solicitações de Repasse",
        origin: "Proposta",
        desc: "Pedidos de transferência de saldo disponível com validação de titularidade e duplo fator (2FA).",
      },
      {
        title: "Repasses Programados",
        origin: "Proposta",
        desc: "Cronograma contratual de repasses (semanal, quinzenal, D+2 ou pós-evento).",
      },
      {
        title: "Repasses Automáticos",
        origin: "Proposta",
        desc: "Regras de disparo automático de repasses liquidados para produtores homologados.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Fila de Execução",
        origin: "Proposta",
        desc: "Fila operacional de transferências aprovadas aguardando processamento bancário via API PIX/TED.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Repasses Realizados",
        origin: "Proposta",
        desc: "Histórico de repasses efetivados com código EndToEnd (E2E) e lançamento no Razão.",
      },
      {
        title: "Repasses com Falha",
        origin: "Proposta",
        desc: "Tratamento de devoluções bancárias, chave PIX bloqueada ou divergência de titularidade com estorno reverso.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Solicitações de Antecipação",
        origin: "Proposta",
        desc: "Pedidos de adiantamento de vendas em cartão de crédito sobre o saldo a liberar do evento.",
      },
      {
        title: "Simulador de Antecipação",
        origin: "Proposta",
        desc: "Cálculo transparente de valor bruto, taxa proporcional ao prazo médio e valor líquido imediato.",
      },
      {
        title: "Taxas e Custos de Antecipação",
        origin: "Proposta",
        desc: "Apuração do spread financeiro entre taxa cobrada do produtor e custo de funding/adquirente.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Comprovantes e Demonstrativos",
        origin: "Proposta",
        desc: "Recibos bancários autenticados e memórias de cálculo vinculadas a cada repasse.",
      },
      {
        title: "Acerto Final de Evento",
        origin: "Acréscimo",
        desc: "Fechamento definitivo pós-evento: liberação da reserva de garantia, desconto de estornos finais e quitação.",
      },
      {
        title: "Prestação de Contas do Evento",
        origin: "Acréscimo",
        desc: "Borderô oficial consolidado para assinatura do produtor com todas as receitas, taxas, PDV e repasses.",
      },
      {
        title: "Reserva de Garantia por Evento",
        origin: "Acréscimo",
        desc: "Controle do percentual retido cautelarmente até a realização bem-sucedida do evento.",
      },
    ]),
  },
  {
    id: "menu-07",
    number: "07",
    title: "Gateways e Meios de Pagamento",
    iconName: "CreditCard",
    pkg: "P2",
    docCount: 10,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("07", "P2", ALL_INTERNAL, [
      {
        title: "Gateways Cadastrados",
        origin: "Proposta",
        desc: "Gestão de adquirentes, subadquirentes e PSPs (Stone, Adyen, Pagar.me, Cielo, Rede, Itaú PIX).",
      },
      {
        title: "Meios de Pagamento",
        origin: "Proposta",
        desc: "Habilitação e regras de uso por método de pagamento no checkout e nas bilheterias físicas.",
      },
      {
        title: "Cartão de Crédito e Débito",
        origin: "Proposta",
        desc: "Gestão de vendas por bandeira, parcelamento (1x a 12x), captura e agenda de recebíveis.",
      },
      {
        title: "PIX",
        origin: "Proposta",
        desc: "Monitoramento de QR Codes dinâmicos, liquidação instantânea D+0 e conciliação EndToEnd.",
      },
      {
        title: "Boleto",
        origin: "Proposta",
        desc: "Controle de boletos registrados para vendas corporativas, camarotes e cotas de patrocínio.",
      },
      {
        title: "Carteiras Digitais",
        origin: "Proposta",
        desc: "Transações via Apple Pay, Google Pay, PicPay e carteiras cashless de eventos.",
      },
      {
        title: "Tarifas por Meio de Pagamento",
        origin: "Proposta",
        desc: "Tabelas de MDR contratadas por bandeira, modalidade e faixa de parcelamento.",
      },
      {
        title: "Prazos de Liquidação",
        origin: "Proposta",
        desc: "Parametrização de janelas D+0 (PIX), D+1 (Débito), D+2 (Boleto) e D+30 (Crédito).",
      },
      {
        title: "Webhooks e Integrações",
        origin: "Proposta",
        desc: "Fila de notificações assíncronas com chave de idempotência para evitar duplicidade no Razão.",
      },
      {
        title: "Monitor de Transações",
        origin: "Proposta",
        desc: "Acompanhamento em tempo real de autorizações, recusas, retentativas e latência dos gateways.",
      },
    ]),
  },
  {
    id: "menu-08",
    number: "08",
    title: "Divisão de Receitas e Taxas",
    iconName: "PieChart",
    pkg: "P2",
    docCount: 9,
    addedCount: 4,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("08", "P2", ALL_ROLES, [
      {
        title: "Regras de Divisão",
        origin: "Proposta",
        desc: "Motor de split parametrizável entre plataforma, produtor principal, coprodutores e parceiros.",
      },
      {
        title: "Taxa de Serviço",
        origin: "Proposta",
        desc: "Apuração de taxas operacionais de emissão, atendimento e processamento de bilheteria.",
      },
      {
        title: "Taxa de Conveniência",
        origin: "Proposta",
        desc: "Receita de intermediação digital nas vendas online e aplicativo.",
      },
      {
        title: "Taxas por Evento",
        origin: "Proposta",
        desc: "Exceções e condições especiais de taxas negociadas especificamente para um evento ou lote.",
      },
      {
        title: "Taxas por Produtor",
        origin: "Proposta",
        desc: "Tabela comercial vinculada ao contrato guarda-chuva de cada produtor/organizador.",
      },
      {
        title: "Split de Pagamentos",
        origin: "Proposta",
        desc: "Auditoria da divisão financeira automática gerada em cada pedido aprovado.",
      },
      {
        title: "Custos de Gateway",
        origin: "Proposta",
        desc: "Conferência entre MDR descontado pelo gateway e taxa repassada ou absorvida.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Receita Própria da Plataforma",
        origin: "Proposta",
        desc: "Isolamento contábil da receita pertencente exclusivamente à empresa (base para emissão de NFS-e).",
        roles: ALL_INTERNAL,
      },
      {
        title: "Simulador de Taxas",
        origin: "Proposta",
        desc: "Ferramenta interativa para simular preço final, take rate líquido, impostos e margem do evento.",
      },
      {
        title: "Cortesias e Ingressos Gratuitos",
        origin: "Acréscimo",
        desc: "Controle de cotas de cortesia isentas e cobrança de taxa de emissão excedente em contrato.",
      },
      {
        title: "Cupons e Descontos",
        origin: "Acréscimo",
        desc: "Impacto financeiro de códigos promocionais, pré-vendas exclusivas e clubes de assinatura.",
      },
      {
        title: "Custo de Promoções",
        origin: "Acréscimo",
        desc: "Definição de quem absorve o subsídio do desconto: saldo do produtor, plataforma ou patrocinador.",
      },
      {
        title: "Comissões e Afiliados",
        origin: "Acréscimo",
        desc: "Apuração e split automático de comissões para promoters, comissários e canais afiliados.",
      },
    ]),
  },
  {
    id: "menu-09",
    number: "09",
    title: "Conciliação Financeira",
    iconName: "CheckCheck",
    pkg: "P3",
    docCount: 10,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("09", "P3", ALL_INTERNAL, [
      {
        title: "Painel de Conciliação",
        origin: "Proposta",
        desc: "Visão consolidada do batimento 3-way match: Venda Interna × Gateway × Extrato Bancário.",
      },
      {
        title: "Conciliação Bancária",
        origin: "Proposta",
        desc: "Cruzamento entre lançamentos do Razão Financeiro e extratos OFX/API das contas correntes e escrow.",
      },
      {
        title: "Conciliação de Gateways",
        origin: "Proposta",
        desc: "Conferência de agendas de liquidação EDI e taxas MDR efetivamente descontadas pelas adquirentes.",
      },
      {
        title: "Conciliação de Vendas",
        origin: "Proposta",
        desc: "Validação individual de pedidos emitidos na bilheteria contra capturas confirmadas com idempotência.",
      },
      {
        title: "Importação de Extratos",
        origin: "Proposta",
        desc: "Upload e processamento automatizado de arquivos OFX, CNAB 240, CSV e EDI de adquirentes.",
      },
      {
        title: "Conciliação Automática",
        origin: "Proposta",
        desc: "Motor de matching por NSU, TID, EndToEndId (PIX) e código de lote com tolerância parametrizável.",
      },
      {
        title: "Conciliação Manual",
        origin: "Proposta",
        desc: "Mesa de tratamento assistido para partidas pendentes ou depósitos identificados manualmente.",
      },
      {
        title: "Divergências",
        origin: "Proposta",
        desc: "Fila de diferenças de taxas MDR, centavos de arredondamento ou liquidações parciais.",
      },
      {
        title: "Pendências",
        origin: "Proposta",
        desc: "Itens aguardando arquivo de retorno bancário ou confirmação de liquidação D+N.",
      },
      {
        title: "Histórico de Conciliações",
        origin: "Proposta",
        desc: "protocolos diários de conciliação encerrados e assinados pela tesouraria.",
      },
    ]),
  },
  {
    id: "menu-10",
    number: "10",
    title: "Estornos, Chargebacks e Riscos",
    iconName: "ShieldAlert",
    pkg: "P3",
    docCount: 9,
    addedCount: 3,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("10", "P3", ALL_ROLES, [
      {
        title: "Solicitações de Estorno",
        origin: "Proposta",
        desc: "Pedidos de cancelamento e reembolso dentro do prazo legal (CDC 7 dias) ou regras do evento.",
      },
      {
        title: "Estornos Processados",
        origin: "Proposta",
        desc: "Reembolsos efetivados via PIX devolução ou estorno na fatura com lançamento reverso no Razão.",
      },
      {
        title: "Cancelamentos de Pedidos",
        origin: "Proposta",
        desc: "Invalidação automática do ingresso/QR Code sincronizada com a reversão financeira do split.",
      },
      {
        title: "Chargebacks",
        origin: "Proposta",
        desc: "Notificações de contestação recebidas das adquirentes com bloqueio imediato no saldo do produtor.",
      },
      {
        title: "Contestações e Defesas",
        origin: "Proposta",
        desc: "Montagem e envio de dossiê de defesa (3DS, biometria, IP, logs de uso na catraca).",
        roles: ALL_INTERNAL,
      },
      {
        title: "Retenções Preventivas",
        origin: "Proposta",
        desc: "Travas cautelares aplicadas a eventos ou transações sob análise de risco.",
      },
      {
        title: "Análise de Risco e Fraude",
        origin: "Proposta",
        desc: "Monitoramento de scores antifraude, velocidade de compra e listas restritivas.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Saldo Negativo de Produtores",
        origin: "Proposta",
        desc: "Monitoramento de contas correntes de produtores que ficaram devedoras após estornos pós-repasse.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Indicadores de Risco",
        origin: "Proposta",
        desc: "Acompanhamento de Chargeback Rate por bandeira (limites Visa/Mastercard) e índice de reembolso.",
      },
      {
        title: "Cancelamento de Evento (reembolso em lote)",
        origin: "Acréscimo",
        desc: "Operação especial de crise: bloqueio de saques e processamento estruturado de estornos em massa.",
      },
      {
        title: "Adiamento e Remarcação",
        origin: "Acréscimo",
        desc: "Gestão financeira de créditos mantidos para nova data, troca de titularidade ou janela de reembolso.",
      },
      {
        title: "Cobrança de Saldo Negativo",
        origin: "Acréscimo",
        desc: "Recuperação de valores adiantados ao produtor quando o evento sofre cancelamento ou excesso de estornos.",
        roles: ALL_INTERNAL,
      },
    ]),
  },
  {
    id: "menu-11",
    number: "11",
    title: "Planejamento Financeiro",
    iconName: "TrendingUp",
    pkg: "P3",
    docCount: 9,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("11", "P3", ALL_INTERNAL, [
      {
        title: "Orçamento Anual",
        origin: "Proposta",
        desc: "Planejamento corporativo anual de receitas de taxas, custos de processamento e despesas fixas.",
      },
      {
        title: "Orçamento por Evento",
        origin: "Proposta",
        desc: "Previsão de faturamento de bilheteria, take rate esperado e custos de operação de campo por evento.",
      },
      {
        title: "Previsto x Realizado",
        origin: "Proposta",
        desc: "Comparativo analítico entre metas orçadas e saldos efetivamente contabilizados no Razão.",
      },
      {
        title: "Fluxo de Caixa Projetado",
        origin: "Proposta",
        desc: "Visão de médio e longo prazo combinando calendário de grandes eventos e obrigações corporativas.",
      },
      {
        title: "Metas Financeiras",
        origin: "Proposta",
        desc: "Acompanhamento de metas de TPV, margem líquida, receita de antecipação e eficiência operacional.",
      },
      {
        title: "Cenários e Simulações",
        origin: "Proposta",
        desc: "Simulações de sensibilidade (Otimista, Base, Conservador) para tomada de decisão executiva.",
      },
      {
        title: "Centros de Custo",
        origin: "Proposta",
        desc: "Gestão orçamentária por departamento (Tecnologia, Comercial, Operações de Eventos, Atendimento, G&A).",
      },
      {
        title: "Plano de Contas Gerencial",
        origin: "Proposta",
        desc: "Visão gerencial agrupada para análise de geração de caixa e margem de contribuição.",
      },
      {
        title: "Rentabilidade por Evento",
        origin: "Proposta",
        desc: "Apuração do lucro líquido real deixado por cada evento após descontar MDR, impostos e equipe local.",
      },
    ]),
  },
  {
    id: "menu-12",
    number: "12",
    title: "Gestão de Contratos",
    iconName: "FileSignature",
    pkg: "P3",
    docCount: 8,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("12", "P3", ALL_ROLES, [
      {
        title: "Contratos de Produtores",
        origin: "Proposta",
        desc: "Instrumentos jurídicos com produtores parametrizando taxas, prazos de repasse, exclusividade e garantias.",
      },
      {
        title: "Contratos de Fornecedores",
        origin: "Proposta",
        desc: "Contratos de tecnologia, locação de catracas/POS, segurança e prestadores de serviços.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Contratos com Gateways e Bancos",
        origin: "Proposta",
        desc: "Tabelas renegociadas de MDR, tarifas bancárias, custódia escrow e SLAs de liquidação.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Modelos de Contrato",
        origin: "Proposta",
        desc: "Minutas padronizadas por porte de evento e modalidade de comercialização.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Vigências e Renovações",
        origin: "Proposta",
        desc: "Controle de prazos contratuais, cláusulas de renovação automática e amortização de luvas.",
      },
      {
        title: "Aditivos",
        origin: "Proposta",
        desc: "Histórico de termos aditivos alterando taxas, lotes extras ou cronograma de repasses.",
      },
      {
        title: "Assinaturas Eletrônicas",
        origin: "Proposta",
        desc: "Status de coleta de assinaturas digitais com validade jurídica e carimbo de tempo.",
      },
      {
        title: "Alertas de Vencimento",
        origin: "Proposta",
        desc: "Avisos preventivos de expiração de contratos, seguros e garantias.",
        roles: ALL_INTERNAL,
      },
    ]),
  },
  {
    id: "menu-13",
    number: "13",
    title: "Contabilidade e Fiscal",
    iconName: "Calculator",
    pkg: "P3",
    docCount: 10,
    addedCount: 3,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("13", "P3", ALL_ROLES, [
      {
        title: "Plano de Contas",
        origin: "Proposta",
        desc: "Estrutura contábil oficial segregando Ativo, Passivo de Custódia de Terceiros, Receitas e Despesas.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Lançamentos Contábeis",
        origin: "Proposta",
        desc: "Livro Diário e Razão de partidas dobradas gerados automaticamente por cada operação financeira.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Classificação de Receitas e Despesas",
        origin: "Proposta",
        desc: "Regras de contabilização automática por tipo de evento financeiro.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Notas Fiscais Emitidas",
        origin: "Proposta",
        desc: "Controle geral de documentos fiscais de saída emitidos pela plataforma.",
      },
      {
        title: "Notas Fiscais Recebidas",
        origin: "Proposta",
        desc: "Escrituração de notas fiscais de fornecedores e prestadores vinculadas ao Contas a Pagar.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Retenções de Impostos",
        origin: "Proposta",
        desc: "Apuração de IRRF, CSRF (PIS/COFINS/CSLL) e ISS retidos na fonte sobre serviços tomados.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Apuração de Impostos",
        origin: "Proposta",
        desc: "Cálculo mensal de tributos sobre a receita própria da empresa (PIS, COFINS, ISS, IRPJ, CSLL).",
        roles: ALL_INTERNAL,
      },
      {
        title: "Fechamento Contábil",
        origin: "Proposta",
        desc: "Rotina de encerramento mensal com trava de período (bloqueando lançamentos retroativos).",
        roles: ALL_INTERNAL,
      },
      {
        title: "Demonstrativos Contábeis",
        origin: "Proposta",
        desc: "Balancete de Verificação, Balanço Patrimonial e DRE Contábil.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Exportação Contábil",
        origin: "Proposta",
        desc: "Integração e exportação de lotes para sistemas contábeis externos e SPED.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Nota Fiscal sobre a Taxa de Serviço",
        origin: "Acréscimo",
        desc: "Emissão automatizada de NFS-e estritamente sobre a taxa de conveniência/serviço (receita própria).",
      },
      {
        title: "Informes e Declarações aos Produtores",
        origin: "Acréscimo",
        desc: "Disponibilização de informes anuais de rendimentos, extratos fiscais e demonstrativos de taxas.",
      },
      {
        title: "Retenções Fiscais sobre Repasses",
        origin: "Acréscimo",
        desc: "Controle de retenções legais específicas incidentes sobre repasses ou comissões de terceiros.",
      },
    ]),
  },
  {
    id: "menu-14",
    number: "14",
    title: "Relatórios e Inteligência",
    iconName: "BarChart3",
    pkg: "P4",
    docCount: 11,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("14", "P4", ALL_ROLES, [
      {
        title: "Central de Relatórios",
        origin: "Proposta",
        desc: "Catálogo unificado de relatórios operacionais, gerenciais, contábeis e de eventos.",
      },
      {
        title: "DRE",
        origin: "Proposta",
        desc: "Demonstrativo de Resultado do Exercício destacando Receita Própria, Custos MDR, Impostos e EBITDA.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Fluxo de Caixa Realizado",
        origin: "Proposta",
        desc: "Demonstrativo de Fluxo de Caixa (DFC) separando movimentação própria de custódia de terceiros.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Vendas por Evento",
        origin: "Proposta",
        desc: "Performance comercial e financeira detalhada por evento, lote e canal de venda.",
      },
      {
        title: "Receita por Produtor",
        origin: "Proposta",
        desc: "Volume transacionado (TPV), taxas geradas e resultado líquido por organizador parceiro.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Taxas e Receita Própria",
        origin: "Proposta",
        desc: "Análise de evolução do take rate bruto e líquido da plataforma.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Repasses Realizados",
        origin: "Proposta",
        desc: "Relatório analítico de liquidações pagas aos produtores por período e instituição bancária.",
      },
      {
        title: "Inadimplência",
        origin: "Proposta",
        desc: "Relatório de aging de valores vencidos, cotas pendentes e saldos devedores.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Indicadores (KPIs)",
        origin: "Proposta",
        desc: "Painel de indicadores de liquidez, cobertura de custódia, ticket médio e conversão.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Relatórios Agendados",
        origin: "Proposta",
        desc: "Automação de envio periódico de relatórios e borderôs por e-mail.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Exportações",
        origin: "Proposta",
        desc: "Extração auditada em formatos XLSX, CSV, PDF e JSON com hash de integridade.",
      },
    ]),
  },
  {
    id: "menu-15",
    number: "15",
    title: "Aprovações Financeiras",
    iconName: "Stamp",
    pkg: "P2",
    docCount: 8,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_ROLES,
    submenus: buildSubmenus("15", "P2", ALL_ROLES, [
      {
        title: "Caixa de Aprovações",
        origin: "Proposta",
        desc: "Fila centralizada de solicitações financeiras aguardando decisão e assinatura de alçada.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Minhas Aprovações",
        origin: "Proposta",
        desc: "Pendências atribuídas especificamente ao perfil e nível de alçada do usuário logado.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Aprovação de Pagamentos",
        origin: "Proposta",
        desc: "Validação e liberação de Contas a Pagar operacionais e fornecedores.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Aprovação de Repasses",
        origin: "Proposta",
        desc: "Conferência de saldo disponível, titularidade e liberação de repasses a produtores (com Segregação de Funções).",
        roles: ALL_INTERNAL,
      },
      {
        title: "Aprovação de Antecipações",
        origin: "Proposta",
        desc: "Análise de risco do evento, lastro na adquirente e aprovação de adiantamento de recebíveis.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Regras de Alçada",
        origin: "Proposta",
        desc: "Parametrização de limites de valor, exigência de dupla assinatura e alçadas por tipo de operação.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Delegações",
        origin: "Proposta",
        desc: "Transferência temporária e rastreável de poderes de aprovação por período determinado.",
        roles: ALL_INTERNAL,
      },
      {
        title: "Histórico de Aprovações",
        origin: "Proposta",
        desc: "Registro imutável de todas as aprovações e recusas com responsável, data/hora e justificativa.",
      },
    ]),
  },
  {
    id: "menu-16",
    number: "16",
    title: "Auditoria e Governança",
    iconName: "ShieldCheck",
    pkg: "P4",
    docCount: 10,
    addedCount: 0,
    removedCount: 1,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("16", "P4", ALL_INTERNAL, [
      {
        title: "Log de Atividades",
        origin: "Proposta",
        note: "Removido: Permissões e Perfis (mantido em 17 - Configurações)",
        desc: "Registro cronológico de eventos operacionais e ações de usuários no módulo financeiro.",
      },
      {
        title: "Trilha de Auditoria Financeira",
        origin: "Proposta",
        desc: "Rastreamento completo de cada transação desde a origem até o lançamento no Razão Central.",
      },
      {
        title: "Histórico de Alterações",
        origin: "Proposta",
        desc: "Comparativo antes/depois (diff) de qualquer alteração em parâmetros, contratos ou dados bancários.",
      },
      {
        title: "Acessos e Sessões",
        origin: "Proposta",
        desc: "Monitoramento de logins, IPs, validações 2FA e sessões ativas no ambiente administrativo e produtor.",
      },
      {
        title: "Evidências e Anexos",
        origin: "Proposta",
        desc: "Repositório criptografado de comprovantes, notas fiscais, borderôs assinados e dossiês.",
      },
      {
        title: "Alertas de Anomalias",
        origin: "Proposta",
        desc: "Detecção automática de padrões atípicos (tentativa de auto-aprovação, saques pós-troca bancária, etc.).",
      },
      {
        title: "Revisão de Acessos",
        origin: "Proposta",
        desc: "Auditoria periódica de privilégios concedidos e conformidade com Segregação de Funções (SoD).",
      },
      {
        title: "Políticas de Conformidade",
        origin: "Proposta",
        desc: "Monitoramento das 8 Regras de Arquitetura Financeira (Imutabilidade, Idempotência, 2FA, Fechamento).",
      },
      {
        title: "Relatórios de Auditoria",
        origin: "Proposta",
        desc: "Extração de pacotes de evidências e validação matemática do Razão para auditoria interna e externa.",
      },
    ]),
  },
  {
    id: "menu-17",
    number: "17",
    title: "Configurações Financeiras",
    iconName: "Settings",
    pkg: "P4",
    docCount: 10,
    addedCount: 0,
    removedCount: 0,
    allowedRoles: ALL_INTERNAL,
    submenus: buildSubmenus("17", "P4", ALL_INTERNAL, [
      {
        title: "Parâmetros Gerais",
        origin: "Proposta",
        desc: "Configurações globais do núcleo financeiro, travas de segurança e regime de competência.",
      },
      {
        title: "Contas e Bancos Padrão",
        origin: "Proposta",
        desc: "Definição de contas padrão para custódia de ingressos (Escrow), conta movimento própria e impostos.",
      },
      {
        title: "Categorias Financeiras",
        origin: "Proposta",
        desc: "Estrutura de classificação gerencial de receitas, taxas, custos diretos e despesas.",
      },
      {
        title: "Moedas e Câmbio",
        origin: "Proposta",
        desc: "Parâmetros para eventos internacionais, pagamentos em moeda estrangeira e IOF/spread cambial.",
      },
      {
        title: "Calendário e Dias Úteis",
        origin: "Proposta",
        desc: "Calendário bancário FEBRABAN e feriados para cálculo preciso de vencimentos e agendas D+N.",
      },
      {
        title: "Regras de Liquidação",
        origin: "Proposta",
        desc: "Políticas de liberação de saldo vinculadas ao status do evento e janelas de corte bancário.",
      },
      {
        title: "Modelos de Notificação",
        origin: "Proposta",
        desc: "Templates de alertas automáticos de repasse, cobrança, aprovação de alçada e fechamento de evento.",
      },
      {
        title: "Integrações e APIs",
        origin: "Proposta",
        desc: "Gerenciamento de chaves de API, webhooks, políticas de idempotência e conectores ERP.",
      },
      {
        title: "Perfis e Permissões",
        origin: "Proposta",
        desc: "Administração centralizada da matriz RBAC dos 6 perfis (Admin, Fin. Interno, Tesouraria, Contábil, Produtor, Auditor).",
      },
      {
        title: "Automações",
        origin: "Proposta",
        desc: "Regras de conciliação automática, sweeping de taxas próprias e agendamento de rotinas contábeis.",
      },
    ]),
  },
];

export const TOTAL_MAIN_MENUS = FINANCIAL_MENUS.length; // 17
export const TOTAL_BASE_DOC_SUBMENUS = FINANCIAL_MENUS.reduce((acc, m) => acc + m.docCount, 0); // 154
export const TOTAL_ADDED_SUBMENUS = FINANCIAL_MENUS.reduce((acc, m) => acc + m.addedCount, 0); // 19
export const TOTAL_REMOVED_SUBMENUS = FINANCIAL_MENUS.reduce((acc, m) => acc + m.removedCount, 0); // 1
export const TOTAL_SUBMENUS = FINANCIAL_MENUS.reduce((acc, menu) => acc + menu.submenus.length, 0); // 172

export function getMenusForRole(role: UserRole): MainMenuItem[] {
  return FINANCIAL_MENUS.filter((menu) => menu.allowedRoles.includes(role))
    .map((menu) => ({
      ...menu,
      submenus: menu.submenus.filter((sub) => sub.allowedRoles.includes(role)),
    }))
    .filter((menu) => menu.submenus.length > 0);
}

export function findSubmenuById(subId: string): { menu: MainMenuItem; submenu: SubMenuItem } | null {
  for (const menu of FINANCIAL_MENUS) {
    const found = menu.submenus.find((s) => s.id === subId || s.code === subId);
    if (found) {
      return { menu, submenu: found };
    }
  }
  return null;
}
