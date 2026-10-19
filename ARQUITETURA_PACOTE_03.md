# Pacote 03 — Controle Financeiro, planejamento e integração contábil assistida

## Continuidade do ERP

Projeto cumulativo baseado no Pacote 02: mantém autenticação com sessão, estrutura Next.js 15/React/TypeScript/Tailwind/shadcn/ui, Node.js com Route Handlers e Prisma com dois schemas (SQLite / PostgreSQL). Não foi realizado deploy ou integração real com bancos/adquirentes.

## Novos menus (somente Administrador e Financeiro Interno)

| Tela | API | Persistência |
| --- | --- | --- |
| `/conciliacao` | `GET/POST /api/controle/extratos`, `POST /api/controle/conciliar` | BankStatementLine → LedgerEntry |
| `/ocorrencias` | `GET/POST /api/controle/riscos`, `POST /api/controle/risco-decisao` | RiskCase → FinancialSale/Event/Producer |
| `/planejamento` | `GET/POST /api/controle/orcamentos` | BudgetLine → Event |
| `/contratos` | `GET/POST /api/controle/contratos` | FinancialContract → Event/Producer (opcionais) |
| `/contabilidade` | `GET /api/controle/contabilidade?inicio=AAAA-MM-DD&fim=AAAA-MM-DD[&formato=csv]` | Apenas leitura do LedgerEntry |
| catálogo interno | `GET /api/controle/catalogo` | Conta, evento, vendas, produtores |

## Regras dos novos serviços

**Conciliação**: extrato externo é cadastrado individualmente por conta, referência, data, sinal e valor. A combinação `(bankAccountId, externalId)` é única. Para conciliar, saldo, sinal e conta devem coincidir exatamente com um `LedgerEntry` ainda não vinculado. Um lançamento pode conciliar uma única linha, e vice-versa. A importação e a conciliação **não mudam** `BankAccount.balanceCents`, nem geram `LedgerEntry` adicional. Importador OFX/CNAB e leitura automática de bancos **não fazem parte desta versão**.

**Ocorrências**: vinculadas a uma venda e a uma referência externa única. `exposureCents` é a **parte do direito do produtor exposta ao risco**, não o valor bruto do pagamento ao comprador. A abertura exige limite livre e impede reservar mais do que o `producerNetCents` da venda (somando ocorrências abertas e confirmadas). Rejeição libera a capacidade; confirmação transforma reserva em perda definitiva do direito apurado. Ao calcular disponibilidade (`eventAvailability`), as perdas confirmadas reduzem direito total e liquidado e reservas abertas diminuem novos limites de repasse/antecipação. A confirmação de uma ocorrência não transmite um estorno para a adquirente, não movimenta banco e não recalcula o snapshot histórico da venda. Casos cuja exposição excede a capacidade livre, ou vendas já repassadas sem cobertura, precisam de processo manual/contábil específico.

**Planejamento**: orçamento por evento, receitas e despesas em centavos. As projeções **não** alteram títulos, caixa, obrigações ou contas contábeis. Painel limitado às 200 últimas linhas; quando limite atingido, os totais exibidos são identificados como parciais.

**Contratos**: cadastro documental com contraparte, datas, status e condições. Um contrato ativo não altera taxa Disk, MDR ou partilha de receita automaticamente. Sem assinatura digital nessa etapa.

**Pré-exportação contábil**: leitura do razão financeiro por intervalo de até 93 dias e 5 mil lançamentos. Sugere partidas com contas de contrapartida **a classificar ou revisar**; não são demonstrações contábeis definitivas, classificação fiscal, DRE homologada ou integração com ERP contábil externo. CSV inclui proteção básica contra fórmulas de planilhas, além de UTF-8 com BOM e separador ponto e vírgula.

## Isolamento e governança

1. Rotas novas chamam `authorize(req, ["ADMIN", "FINANCE_DISK"])` no servidor, inclusive GET e POST; menu e páginas SSR reforçam a separação, mas não substituem a API.
2. Nenhum contrato, orçamento, extrato bancário ou ocorrência detalhada é retornado pela API exclusiva do Produtor. Este só obtém saldos informacionais do próprio evento, já afetados pelos bloqueios.
3. Mutação financeira registra `AuditLog` com usuário autenticado. Confirmações e conciliações usam transações Prisma; unicidade e status protegem da dupla utilização. A validação concorrente real em PostgreSQL continua pendente.
4. O Patch corrige também o retorno silencioso após débito de repasse caso haja corrida de status: agora a falha lança exceção e provoca rollback da transação. Isso precisa de teste integrado com concorrência real.
5. Não são enviados comandos PIX, TED, cartão, chargeback, CNAB ou liquidação automática a instituições externas.

## Etapa seguinte necessária

Após instalar dependências em máquina de homologação: validar `prisma validate` para **ambos os schemas**, gerar migração versionada, testar upgrade de banco existente em cópia restaurada, typecheck, testes unitários, build Next.js, API E2E e concorrência real sob SQLite/PostgreSQL. Testar perfis e autorização cruzada antes de produção. Não aplicar `db push` em produção.
