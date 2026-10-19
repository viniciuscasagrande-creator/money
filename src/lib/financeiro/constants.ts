/** Catálogo único dos módulos do ERP: usado pelo menu, central de telas e API autorizada.
 * Nenhum item deste catálogo concede acesso por si: APIs sempre validam sessão/escopo. */
export type FinanceRole = "ADMIN" | "FINANCE_DISK" | "PRODUCER";
export type FinancePackage = 1 | 2 | 3 | 4;
export type FinanceModule = {
  key: string; label: string; href: string; package: FinancePackage;
  description: string; endpoint: string; internal?: boolean; admin?: boolean; capability?: string;
};
export const FINANCE_MODULES: readonly FinanceModule[] = [
  {key:"dashboard",label:"Dashboard Financeiro",href:"/dashboard",package:1,endpoint:"/api/dashboard",description:"Indicadores de recebimentos, pagamentos e saldos autorizados."},
  {key:"recebimentos",label:"Recebimentos",href:"/recebimentos",package:1,endpoint:"/api/recebimentos",description:"Títulos a receber, vencimentos e liquidações."},
  {key:"pagamentos",label:"Contas a pagar",href:"/pagamentos",package:1,endpoint:"/api/pagamentos",description:"Títulos a pagar e baixas controladas."},
  {key:"contas",label:"Tesouraria e bancos",href:"/contas",package:1,endpoint:"/api/contas",description:"Contas bancárias e saldo registrado no razão.",internal:true},
  {key:"saldos",label:"Saldos e posições",href:"/saldos",package:1,endpoint:"/api/saldos",description:"Posições segregadas por produtor e evento."},
  {key:"cadastros",label:"Cadastros e acessos",href:"/cadastros",package:1,endpoint:"/api/admin/produtores",description:"Produtores, eventos e usuários.",admin:true},
  {key:"repasses",label:"Repasses e antecipações",href:"/repasses",package:2,endpoint:"/api/repasses",description:"Solicitações, aprovações e aceite antes da baixa."},
  {key:"gateways",label:"Gateways e bandeiras",href:"/gateways",package:2,endpoint:"/api/financeiro/catalogo",description:"Adquirentes, cartões e MDR configuráveis.",internal:true},
  {key:"taxas",label:"Divisão de receitas",href:"/taxas",package:2,endpoint:"/api/financeiro/taxas",description:"Taxas privadas por evento e regra de cobrança.",internal:true},
  {key:"vendas",label:"Vendas por evento",href:"/vendas",package:2,endpoint:"/api/financeiro/vendas",description:"Registro, memória de cálculo e recebíveis.",internal:true},
  {key:"conciliacao",label:"Conciliação bancária",href:"/conciliacao",package:3,endpoint:"/api/controle/extratos",description:"Conferência entre extratos e razão.",internal:true},
  {key:"ocorrencias",label:"Estornos e chargebacks",href:"/ocorrencias",package:3,endpoint:"/api/controle/riscos",description:"Ocorrências, reservas e decisões auditadas.",internal:true},
  {key:"planejamento",label:"Planejamento financeiro",href:"/planejamento",package:3,endpoint:"/api/controle/orcamentos",description:"Orçamento por evento sem movimentar caixa.",internal:true},
  {key:"contratos",label:"Contratos",href:"/contratos",package:3,endpoint:"/api/controle/contratos",description:"Contrapartes, vigências e condições.",internal:true},
  {key:"contabilidade",label:"Pré-exportação contábil",href:"/contabilidade",package:3,endpoint:"/api/controle/contabilidade",description:"Revisão e exportação para análise contábil.",internal:true},
  {key:"relatorios",label:"Relatórios executivos",href:"/relatorios",package:4,endpoint:"/api/inteligencia/relatorios",description:"Indicadores por evento, produtor e período.",capability:"REPORT_VIEW"},
  {key:"alertas",label:"Central de alertas",href:"/alertas",package:4,endpoint:"/api/inteligencia/alertas",description:"Pendências calculadas e confirmações de leitura.",internal:true,capability:"ALERT_VIEW"},
  {key:"governanca",label:"Permissões e alçadas",href:"/governanca",package:4,endpoint:"/api/governanca/usuarios",description:"Permissões por usuário e aprovação financeira.",admin:true},
  {key:"auditoria",label:"Auditoria",href:"/auditoria",package:4,endpoint:"/api/governanca/auditoria",description:"Histórico de ações, responsáveis e decisões.",admin:true},
  {key:"configuracoes",label:"Configurações financeiras",href:"/configuracoes",package:4,endpoint:"/api/governanca/configuracoes",description:"Parâmetros e alertas auditáveis.",admin:true}
] as const;
export const PACKAGE_LABELS: Record<FinancePackage,string> = {
  1:"Fundação financeira", 2:"Operações financeiras", 3:"Controle financeiro", 4:"Inteligência e governança"
};
export const STATUS_LABELS = {
  OPEN:"Em aberto", SETTLED:"Liquidado", CANCELED:"Cancelado", REQUESTED:"Solicitado",
  APPROVED:"Aprovado", REJECTED:"Rejeitado", PRODUCER_ACCEPTED:"Aceite do produtor",
  READY_TO_SETTLE:"Aguardando baixa", AWAITING_SETTLEMENT:"Aguardando liquidação",
  PENDING:"Pendente", MATCHED:"Conciliado", CONFIRMED:"Confirmado", REFUND:"Estorno", CHARGEBACK:"Chargeback",
  DRAFT:"Rascunho", ACTIVE:"Ativo", EXPIRED:"Expirado", REPASSE:"Repasse", ANTECIPACAO:"Antecipação"
} as const;
export function visibleFinanceModules(role:FinanceRole, capabilities: readonly string[]):FinanceModule[] {
  return FINANCE_MODULES.filter(m=>(!m.internal||role!=="PRODUCER")&&(!m.admin||role==="ADMIN")&&(!m.capability||capabilities.includes(m.capability)));
}
export type RecordType = "titulo"|"repasse"|"venda"|"ocorrencia"|"contrato"|"orcamento"|"extrato";
export const RECORD_TYPES = ["titulo","repasse","venda","ocorrencia","contrato","orcamento","extrato"] as const;
export function isRecordType(value:string):value is RecordType { return (RECORD_TYPES as readonly string[]).includes(value); }
