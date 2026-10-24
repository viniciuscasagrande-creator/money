import { FINANCIAL_MENUS, findSubmenuById, type MainMenuItem, type SubMenuItem } from "@/config/navigation";

export interface OperationalSubmenuRoute {
  submenuId: string;
  submenuCode: string;
  submenuTitle: string;
  menuNumber: string;
  menuTitle: string;
  operationalHref: string;
  moduleName: string;
  actionLabel: string;
  status: "OPERACIONAL_HOMOLOGADO";
}

export function resolveOperationalRouteByCode(
  menuNumber: string,
  submenuCode: string
): {
  operationalHref: string;
  moduleName: string;
  actionLabel: string;
} {
  // Casos específicos de submenus com rota dedicada
  if (submenuCode === "01.06") {
    return {
      operationalHref: "/alertas",
      moduleName: "Central de Alertas e Pendências",
      actionLabel: "Gerenciar alertas e pendências operacionais",
    };
  }
  if (submenuCode === "02.04" || submenuCode === "02.09") {
    return {
      operationalHref: "/vendas",
      moduleName: "Vendas por Evento e Split de Recebíveis",
      actionLabel: "Registrar venda e calcular split por evento",
    };
  }
  if (submenuCode === "06.13") {
    return {
      operationalHref: "/retencoes",
      moduleName: "Retenções Obrigatórias e Reservas de Garantia",
      actionLabel: "Gerenciar reservas contratuais e garantias por evento",
    };
  }
  if (submenuCode === "07.09" || submenuCode === "17.08" || submenuCode === "17.09") {
    return {
      operationalHref: "/integracao",
      moduleName: "Conector API de Ingressos e Webhooks",
      actionLabel: "Simular e auditar payloads de venda de ingressos",
    };
  }
  if (submenuCode === "17.01" || submenuCode === "17.02" || submenuCode === "17.03") {
    return {
      operationalHref: "/cadastros",
      moduleName: "Cadastros de Produtores, Eventos e Usuários",
      actionLabel: "Cadastrar produtores, eventos e operadores",
    };
  }

  // Submenus de Contabilidade (Menu 13) direcionados às abas operacionais reais
  if (menuNumber === "13") {
    if (submenuCode === "13.01" || submenuCode === "13.02") {
      return {
        operationalHref: "/contabilidade/livros?aba=plano",
        moduleName: "Plano de Contas Hierárquico e Contas Analíticas",
        actionLabel: "Gerenciar árvore do plano de contas",
      };
    }
    if (submenuCode === "13.03" || submenuCode === "13.04") {
      return {
        operationalHref: "/contabilidade/livros?aba=razao",
        moduleName: "Livro Razão, Partidas Dobradas e Estornos",
        actionLabel: "Consultar razão contábil e lançar partidas",
      };
    }
    if (submenuCode === "13.05" || submenuCode === "13.06" || submenuCode === "13.09") {
      return {
        operationalHref: "/contabilidade/livros?aba=demonstrativos",
        moduleName: "Balancete de Verificação, DRE e Passivos",
        actionLabel: "Consultar Balancete, DRE e obrigações por evento",
      };
    }
    if (submenuCode === "13.07" || submenuCode === "13.08") {
      return {
        operationalHref: "/contabilidade/livros?aba=regras",
        moduleName: "Períodos Contábeis, Fechamento e Exportação CSV",
        actionLabel: "Gerenciar períodos contábeis e exportar CSV",
      };
    }
    if (submenuCode === "13.10") {
      return {
        operationalHref: "/contabilidade",
        moduleName: "Pré-exportação Contábil do Razão Bancário (CSV)",
        actionLabel: "Consultar razão bancário e exportar lote CSV",
      };
    }
    if (submenuCode === "13.13") {
      return {
        operationalHref: "/contabilidade/livros?aba=passivos",
        moduleName: "Passivos de Produtores e Retenções por Evento",
        actionLabel: "Conferir obrigações contábeis e retenções por evento",
      };
    }
    return {
      operationalHref: "/contabilidade/livros",
      moduleName: "Contabilidade, Plano de Contas e Motor M1–M10",
      actionLabel: "Abrir módulo contábil operacional",
    };
  }

  switch (menuNumber) {
    case "01":
      return {
        operationalHref: "/dashboard",
        moduleName: "Dashboard Executivo Financeiro",
        actionLabel: "Consultar indicadores e fluxo de caixa",
      };
    case "02":
      return {
        operationalHref: "/recebimentos",
        moduleName: "Contas a Receber e Liquidações",
        actionLabel: "Cadastrar e liquidar recebíveis",
      };
    case "03":
      return {
        operationalHref: "/pagamentos",
        moduleName: "Contas a Pagar e Baixas",
        actionLabel: "Cadastrar e liquidar pagamentos",
      };
    case "04":
      return {
        operationalHref: "/contas",
        moduleName: "Tesouraria e Contas Bancárias",
        actionLabel: "Gerenciar contas bancárias e vínculo com razão",
      };
    case "05":
      return {
        operationalHref: "/saldos",
        moduleName: "Saldos e Posições por Evento/Produtor",
        actionLabel: "Conferir saldos bancários, razão e posições",
      };
    case "06":
      return {
        operationalHref: "/repasses",
        moduleName: "Repasses, Antecipações, 20 Travas e Retenções",
        actionLabel: "Gerenciar repasses, travas, ECAD e transferências",
      };
    case "07":
      return {
        operationalHref: "/gateways",
        moduleName: "Gateways, Bandeiras e Regras MDR",
        actionLabel: "Configurar adquirentes, bandeiras e taxas MDR",
      };
    case "08":
      return {
        operationalHref: "/taxas",
        moduleName: "Divisão de Receitas, Parcelamento 1x–12x, Spread e POS",
        actionLabel: "Configurar taxas por evento e simular parcelamento",
      };
    case "09":
      return {
        operationalHref: "/conciliacao",
        moduleName: "Conciliação Bancária e Conferência de Extratos",
        actionLabel: "Importar extratos e conciliar com o razão",
      };
    case "10":
      return {
        operationalHref: "/ocorrencias",
        moduleName: "Cancelamentos, Estornos, Chargebacks e Riscos",
        actionLabel: "Registrar e decidir cancelamentos, estornos e disputas",
      };
    case "11":
      return {
        operationalHref: "/planejamento",
        moduleName: "Orçamento Financeiro por Evento",
        actionLabel: "Projetar receitas, despesas e margem por evento",
      };
    case "12":
      return {
        operationalHref: "/contratos",
        moduleName: "Gestão de Contratos e Vigências",
        actionLabel: "Cadastrar contratos e condições comerciais",
      };
    case "14":
      return {
        operationalHref: "/relatorios",
        moduleName: "Relatórios Executivos e Exportação CSV",
        actionLabel: "Filtrar indicadores por evento, produtor e período",
      };
    case "15":
      return {
        operationalHref: "/governanca",
        moduleName: "Permissões e Alçadas de Aprovação",
        actionLabel: "Configurar matriz RBAC e limites de alçada",
      };
    case "16":
      return {
        operationalHref: "/auditoria",
        moduleName: "Log de Atividades e Trilha de Auditoria",
        actionLabel: "Consultar trilha de auditoria paginada e exportar CSV",
      };
    case "17":
      return {
        operationalHref: "/configuracoes",
        moduleName: "Configurações e Parâmetros Operacionais",
        actionLabel: "Ajustar parâmetros e limiares de alertas",
      };
    default:
      return {
        operationalHref: "/dashboard",
        moduleName: "Painel Financeiro",
        actionLabel: "Abrir painel principal",
      };
  }
}

export function resolveSubmenuOperationalRoute(submenuIdOrCode: string): OperationalSubmenuRoute {
  const found = findSubmenuById(submenuIdOrCode);
  const menu: MainMenuItem = found?.menu ?? FINANCIAL_MENUS[0];
  const submenu: SubMenuItem = found?.submenu ?? FINANCIAL_MENUS[0].submenus[0];
  const target = resolveOperationalRouteByCode(menu.number, submenu.code);

  return {
    submenuId: submenu.id,
    submenuCode: submenu.code,
    submenuTitle: submenu.title,
    menuNumber: menu.number,
    menuTitle: menu.title,
    operationalHref: target.operationalHref,
    moduleName: target.moduleName,
    actionLabel: target.actionLabel,
    status: "OPERACIONAL_HOMOLOGADO",
  };
}

export const ALL_OPERATIONAL_SUBMENU_ROUTES: readonly OperationalSubmenuRoute[] =
  FINANCIAL_MENUS.flatMap((menu) =>
    menu.submenus.map((sub) => resolveSubmenuOperationalRoute(sub.id))
  );
