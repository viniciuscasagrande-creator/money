# Pacote 04 — Inteligência e Governança (cumulativo)

**Base técnica:** Next.js 15, React 19, TypeScript, Tailwind CSS, componentes shadcn/ui, Node.js e Prisma 6, com definições de schema equivalentes para SQLite e PostgreSQL.

## 1. O que mudou sobre o Pacote 03

| Área | Telas | API | Modelo/tabela |
|---|---|---|---|
| Relatórios e dashboard executivo | `/relatorios` | `GET /api/inteligencia/relatorios` e `/api/inteligencia/catalogo` | Agrega `FinancialSale`, `PayoutRequest`, `Event`, `Producer` |
| Central de alertas | `/alertas` | `GET/POST /api/inteligencia/alertas` | `AlertAcknowledgement`, consulta dos títulos, repasses, riscos e extratos |
| Auditoria avançada | `/auditoria` | `GET /api/governanca/auditoria` | `AuditLog` existente, paginação e filtros |
| Permissões e alçadas | `/governanca` | `GET/POST /api/governanca/usuarios` e `/api/governanca/alcadas` | `UserPermissionOverride`, `ApprovalAuthority` |
| Configurações financeiras | `/configuracoes` | `GET/POST /api/governanca/configuracoes` | `FinanceSetting` |

As APIs do Pacote 04 **não** enviam PIX, remessas CNAB, requisições de estorno a gateways, e-mails nem mensagens. Alertas são derivados **quando consultados**; a confirmação de leitura é individual e não encerra a ocorrência.

## 2. Permissões e segregação

- **ADMIN:** configura alçadas, acessos e alertas; acessa auditoria e informações internas. Autorizações administrativas são fixas (não se modifica permissão de ADMIN por override).
- **FINANCE_DISK:** relatórios internos, alertas e operações financeiras conforme permissões. Para aprovação de solicitação, precisa simultaneamente de `PAYOUT_APPROVE` habilitado e **alçada ativa para o tipo de operação com `maxCents >= amountCents`**. A ausência da alçada bloqueia a aprovação. Para registrar baixa requer `PAYOUT_SETTLE`.
- **PRODUCER:** apenas relatório do produtor autenticado e seus eventos; nunca recebe `diskCents`, `mdrCents`, regras MDR ou taxas internas na resposta JSON/CSV. Overrides jamais ampliam os limites de perfil.
- Regras de autorização validadas nas **APIs**; a ocultação de itens do menu é apenas reforço visual.
- O Administrador pode aprovar acima de alçadas individuais; essa atuação gera log de auditoria. Avalie segregação adicional para ambientes regulados.

## 3. Relatórios e limites

- Filtros `inicio`, `fim` (`AAAA-MM-DD`), `produtorId`, `eventoId`, `agrupar` (`EVENT`, `PRODUCER`, `MONTH`), e opcional `formato=csv`.
- Período máximo: 366 dias. Corte de volume: 5.000 vendas e 5.000 repasses por consulta; reduz memória, mas não substitui geração de relatórios assíncronos em operações grandes.
- Valores são somados em **BigInt (centavos)**, sem ponto flutuante; status são os estados atuais das transações. A classificação temporal é por data de **registro**, e não pelo momento da liquidação: portanto, os números históricos **não** são balancetes/fechamentos contábeis.
- CSV protege células contra fórmulas (`=`, `+`, `-`, `@`) e normaliza aspas. Não substitui a avaliação humana dos demonstrativos.
- A pré-exportação contábil do Pacote 03 continua em `/contabilidade`.

## 4. Auditoria

- Pesquisa `acao`, `entidade`, `usuarioId`, `inicio`, `fim`; paginação e exportação CSV limitada a 5.000 registros.
- Novas operações administrativas (`PERMISSION_CHANGED`, `APPROVAL_AUTHORITY_CHANGED`, `FINANCE_SETTING_CHANGED`, `ALERT_ACK`, `ALERT_UNACK`) alimentam o **mesmo AuditLog** pré-existente, dentro da transação que grava a alteração.
- `AuditLog` existente é simples, com autor, operação, entidade, resumo e horário. **Não há assinatura criptográfica, armazenamento WORM, identificação de IP padronizada, snapshot antes/depois ou prova de imutabilidade**. Para auditoria formal, evoluir retenção independente, controles de acesso de banco e monitoramento de alterações fora do aplicativo.

## 5. Alertas e parâmetros

- Títulos vencidos, pedidos de repasse/antecipação pendentes, linhas de extrato não conciliadas e riscos ainda abertos.
- Parâmetros em dias: `overdueDays`, `payoutPendingDays`, `unmatchedDays`, `openRiskDays`; intervalo permitido: 0–90.
- Listagem limitada a 100 itens por categoria; a confirmação de leitura não muda o status de título, repasse, extrato ou risco.
- Sem cron, automação com agendamento, notificações push ou mensageria externa. A instalação desse tipo de serviço depende de provedor, credenciais e aprovação operacional futura.

## 6. Migração e homologação

- Os modelos foram acrescentados aos dois arquivos de schema; somente o `provider` difere (SQLite/PostgreSQL).
- **Nova base descartável:** `npm run db:generate && npm run db:push` (SQLite); para PG: `npm run db:generate:pg && npm run db:push:pg` com URL adequada.
- **Banco existente:** backup, restauração de ensaio, revisão de esquema com `prisma migrate diff` e preparação de migrações versionadas. Não execute `db:push` sem revisar em bancos existentes, especialmente de produção.
- Executar `npm run typecheck`, `npm test`, `npm run build` e `powershell -ExecutionPolicy Bypass -File .\scripts\homologacao-local.ps1` no VS Code.
- O script de homologação cria uma base SQLite temporária e dados **somente sintéticos** para testes. Nunca executa pagamentos externos.

## 7. Limitações de execução nesta entrega

- Validação sintática TypeScript/TSX e testes matemáticos isolados aprovados.
- **Não confirmado neste ambiente**: geração do Prisma Client, `prisma validate`, compilação completa do Next.js e E2E HTTP/Prisma. Não considerar homologado até a execução integral no ambiente do usuário.
