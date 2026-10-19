# Relatório Oficial de Homologação Geral — SOUL Financeiro v5.0 (Integrado v4.2 + v4.3 + v4.3.1 + v4.4)

**Data da Homologação:** 19/10/2026  
**Ambiente Oficial de Produção:** `https://money-alpha-nine.vercel.app`  
**Banco de Dados:** PostgreSQL (Neon Serverless) · **29 Modelos Prisma** · **15 Enums** · **100% Transacional (`prisma.$transaction`)**

---

## 1. Escopo Consolidado e Entregas Homologadas

| Frente / Pacote | Principais Entregas Homologadas | Arquivos de Referência |
| :--- | :--- | :--- |
| **Pacotes 01 a 04 (SOUL v4.2)** | 20 módulos operacionais, Central de Módulos (`/modulos`), 7 tipos de consultas individuais (`/api/registros/[tipo]/[id]`), RBAC estrito (`ADMIN`, `FINANCE_DISK`, `PRODUCER`). | [`module-catalog.ts`](file:///E:/MONEY/src/lib/module-catalog.ts) |
| **Saldos e Tesouraria (SOUL v4.3.1)** | Modal compartilhado de criação de conta bancária (`CreateBankAccountDialog`), botão **+ Nova conta bancária** no cabeçalho de `/saldos` e `/contas`, botão **+ Cadastrar conta bancária** no estado vazio de `/saldos`, KPIs superiores (`Contas cadastradas`, `Saldo registrado`, `Saldo interno`, `Divergência atual`), atalhos rápidos e checklist guiado de primeiro uso. | [`create-bank-account-dialog.tsx`](file:///E:/MONEY/src/components/financeiro/create-bank-account-dialog.tsx), [`balances.tsx`](file:///E:/MONEY/src/components/financeiro/balances.tsx), [`accounts.tsx`](file:///E:/MONEY/src/components/financeiro/accounts.tsx) |
| **Motor de Receitas, Parcelamento 1x–12x, Spread, Advanced e Rebate** | Segregação matemática entre valor da venda (`grossCents`), líquido liquidado (`netSettlementCents`), receita SOUL (`diskNetCents`) e obrigação líquida do produtor (`producerNetCents`). Suporte aos canais `ONLINE`, `POS` (PagSeguro/PagBank) e `BILHETERIA`, matriz de parcelamento 1x a 12x e memória de cálculo auditável por transação. | [`split-calculation.ts`](file:///E:/MONEY/src/lib/split-calculation.ts), [`fees.tsx`](file:///E:/MONEY/src/components/financeiro/fees.tsx) |
| **Central de 20 Travas de Repasse e Retenções Obrigatórias** | Retenções obrigatórias (`ECAD`, `ALUGUEL_ESPACO`, `EQUIPE_PRODUCAO`, `TRIBUTOS_ENCARGOS`, `RESERVA_RISCO`, `OUTRAS_DESPESAS`), 7 faixas progressivas de liberação por % de ingressos vendidos, base de cálculo `PRODUCER_NET_AFTER_RETENTIONS` e avaliação automática das 20 travas (`IMPEDITIVA`, `CONDICIONAL`, `LIMITE`) na solicitação, aprovação e baixa. | [`control-math.ts`](file:///E:/MONEY/src/lib/control-math.ts), [`payout-locks.ts`](file:///E:/MONEY/src/lib/payout-locks.ts), [`payout-locks-panel.tsx`](file:///E:/MONEY/src/components/financeiro/payout-locks-panel.tsx) |
| **Transferências entre Eventos do Mesmo Produtor** | Central de Políticas por Produtor (`allowPayoutRequests`, `allowAdvanceRequests`, `allowEventTransfers`, limites e alçada), fluxo de transferência atômica (`REQUESTED -> APPROVED -> PRODUCER_ACCEPTED -> EXECUTED`), proteção de retenções na origem e trava anti-contorno circular no destino (`internalPositionCents` vs `repasseCents`). | [`payout-locks.ts`](file:///E:/MONEY/src/lib/payout-locks.ts), [`operations.ts`](file:///E:/MONEY/src/lib/operations.ts), [`route.ts`](file:///E:/MONEY/src/app/api/repasses/travas/route.ts) |
| **Módulo de Contabilidade & Motor Contábil Integrado (SOUL v4.3 + v4.4 — M1 a M10)** | 6 novos modelos Prisma (`AccountingAccount`, `AccountingPeriod`, `AccountingRule`, `AccountingBusinessEvent`, `AccountingJournal`, `AccountingPosting`), Dashboard Contábil independente em `/contabilidade/livros`, Plano de Contas padrão de 24 contas hierárquicas (`M1`), Motor de Lançamentos de Múltiplas Partidas e Estorno Inverso (`M2`), Agenda de Recebíveis e Antecipação (`M3`), Repasses com Segregação e Travas (`M4`), Caixa da Bilheteria com Quebra/Sobra e Segregação (`M5`), Conciliação PagSeguro/Gateway por NSU (`M6`), Tributação Parametrizável ISS/PIS/COFINS (`M7`), Reconhecimento de Receita Diferida na Realização do Evento (`M8`), Reembolsos e Chargebacks (`M9`) e Balancete (`D=C`), Razão, DRE e Passivos por Evento (`M10`). | [`accounting-core.ts`](file:///E:/MONEY/src/lib/accounting-core.ts), [`accounting-integration.ts`](file:///E:/MONEY/src/lib/accounting-integration.ts), [`accounting-books.tsx`](file:///E:/MONEY/src/components/financeiro/accounting-books.tsx), [`route.ts`](file:///E:/MONEY/src/app/api/contabilidade/route.ts) |

---

## 2. Resultado das Validações Automatizadas

1. **Testes Unitários (`npm test`):** **48/48 aprovados** (`0` falhas), incluindo todos os cenários do Motor Contábil `M1–M10`, os 4 ajustes SOUL v4.4, as 20 travas de repasse, as retenções obrigatórias (ECAD), as transferências atômicas entre eventos e a matriz de parcelamento 1x–12x.
2. **Validação Estática e Paridade Prisma (`npm run test:static`):** **133 arquivos TS/TSX**, **29 modelos Prisma**, **15 Enums**, **0 erros sintáticos**.
3. **Validação de Rotas e UI (`npm run test:ui:static`):** **20 módulos**, **7 endpoints de detalhes**, **0 problemas**.
4. **Checagem de Tipos (`npm run typecheck`) e Build de Produção (`npx next build`):** **0 erros**.
5. **Homologação E2E em PostgreSQL Real (`npm run test:homologacao:pg`):** **74/74 grupos de validação E2E aprovados** em schema isolado (`homolog_v5_*`), com limpeza automática do schema temporário e preservação integral do banco de produção (`public`).
