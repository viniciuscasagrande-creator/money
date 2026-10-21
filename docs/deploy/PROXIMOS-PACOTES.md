# Implementação por etapas

Atualizado em 21/10/2026. A ordem abaixo representa entregas incrementais; uma linha planejada não indica funcionalidade implantada.

| Pacote | Situação | Próxima entrega verificável |
|---|---|---|
| 1 — PostgreSQL e CI | Código entregue; ativação GitHub/Vercel pendente | Configurar ambientes e secrets e executar pipeline no GitHub |
| 2 — Segurança e acesso | Troca de senha e revogação implementadas localmente | Validar em preview; depois implementar recuperação por e-mail com serviço configurado |
| 3 — Integrações resilientes | Planejado; idempotência básica já existe | Fila persistente com estados, concessão exclusiva de processamento, tentativas com espera e reprocessamento auditado |
| 4 — Conciliação e fechamento | Planejado; conciliação e fechamento contábil básicos já existem | Definir e testar conciliação parcial, divergências e período financeiro, preservando movimentos já liquidados |
| 5 — Contabilidade e demonstrativos | Planejado; eventos contábeis e demonstrativos já existem | Cobrir operações com regras contábeis revisadas e permitir rastrear lançamentos até suas origens |
| 6 — Backup operacional | Planejado; exportação e restauração já existem | Destino externo configurado, retenção, verificação de integridade e restauração periódica em ambiente isolado |
| 7 — Monitoramento e auditoria | Planejado; auditoria operacional já existe | Identificadores de correlação, logs sem segredos e alertas de falha com canal configurado |
| 8 — Experiência e desempenho | Planejado | Testar fluxos em navegador e celular e medir consultas antes de otimizar ou paginar |

## Critérios para os próximos pacotes

Cada entrega deve conter código, testes dos riscos envolvidos, instruções de configuração e retorno, e identificação explícita do que foi validado. Mudanças em modelos devem preservar paridade SQLite/PostgreSQL, migrações e restauração. Reprocessar integrações não pode duplicar títulos; conciliar não pode criar movimento bancário adicional; relatórios e alertas não podem expor valores internos ao produtor.

Serviços de e-mail, armazenamento e notificações precisam ser configurados para testes reais. A confirmação de regras de conciliação parcial e contas contábeis deve preceder alterações que mudem resultados financeiros. O desenvolvimento local pode continuar enquanto a ativação GitHub do pacote 1 estiver pendente.
