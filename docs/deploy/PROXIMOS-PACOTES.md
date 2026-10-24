# Implementação por etapas

Atualizado em 24/10/2026. A ordem abaixo representa entregas incrementais; uma linha planejada não indica funcionalidade implantada.

| Pacote | Situação | Próxima entrega verificável |
|---|---|---|
| 1 — PostgreSQL e CI | Implantado no Neon PostgreSQL e publicado na Vercel | Manter ensaio isolado de migrações e restauração a cada release |
| 2 — Segurança e acesso | Troca de senha, bloqueio de tentativas, MFA TOTP e revogação de sessões implantados | Configurar provedor transacional de e-mail para envio externo de recuperação |
| 3 — Integrações resilientes | Fila persistente (`IntegrationJob`), worker, painel e reprocessamento implantados | Manter execução periódica agendada do worker (`npm run integration:work`) |
| 4 — Conciliação e fechamento | Alocações parciais, divergências e fechamento mensal/por evento implantados | Conferir competências e extratos representativos a cada fechamento |
| 5 — Contabilidade e demonstrativos | Prévia, cópia histórica de regras, trilha de origem e demonstrativos implantados | Revisar mapeamentos contábeis e fiscais definitivos com a contabilidade |
| 6 — Backup operacional | Criptografia AES-256-GCM, cópia externa (`E:/MONEY-BACKUPS-EXTERNO`), retenção e ensaio isolado ativos | Manter agendamento diário de snapshot e ensaio semanal de restauração |
| 7 — Monitoramento e auditoria | Correlação HTTP/auditoria (`requestId`), logs estruturados, painel administrativo e caixa de saída persistente implantados | Conectar receptor HTTPS externo (`MONITOR_WEBHOOK_URL`) e manter agendamento de `monitor:check` / `monitor:dispatch` |
| 8 — Experiência e desempenho | Paginação/busca/sumários de títulos, resumo de contas, origem loopback, acessibilidade e ensaio visual/PostgreSQL implementados | Validar em produção após publicação e continuar revisão progressiva das demais telas densas |

## Entrega única — pacotes 9–12

| Pacote | Implementação | Ativação |
|---|---|---|
| 9 — Vendas completas | Busca, situação, paginação e totais do conjunto filtrado | Homologar em preview |
| 10 — Repasses completos | Lista paginada e filtrada separada da posição dos eventos | Homologar em preview |
| 11 — Transferências completas | Histórico completo, filtros e agregados com escopo por produtor | Homologar em preview |
| 12 — Qualidade e integridade | Executor único das verificações locais e manifesto SHA-256 dos arquivos | Pipeline remoto depende da configuração do pacote 1 |

Detalhes e limites: [PACOTES9-12-ENTREGA-UNICA.md](PACOTES9-12-ENTREGA-UNICA.md). A numeração acima representa a nova entrega consolidada autorizada pelo usuário; não havia pacotes 9–12 preexistentes.

## Critérios para os próximos pacotes

Cada entrega deve conter código, testes dos riscos envolvidos, instruções de configuração e retorno, e identificação explícita do que foi validado. Mudanças em modelos devem preservar paridade SQLite/PostgreSQL, migrações e restauração. Reprocessar integrações não pode duplicar títulos; conciliar não pode criar movimento bancário adicional; relatórios e alertas não podem expor valores internos ao produtor.

Serviços de e-mail, armazenamento e notificações precisam ser configurados para testes reais. A confirmação de regras de conciliação parcial e contas contábeis deve preceder alterações que mudem resultados financeiros. O desenvolvimento local pode continuar enquanto a ativação GitHub do pacote 1 estiver pendente.
