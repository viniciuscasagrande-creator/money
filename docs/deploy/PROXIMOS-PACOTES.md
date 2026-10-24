# Implementação por etapas

Atualizado em 21/10/2026. A ordem abaixo representa entregas incrementais; uma linha planejada não indica funcionalidade implantada.

| Pacote | Situação | Próxima entrega verificável |
|---|---|---|
| 1 — PostgreSQL e CI | Código entregue; ativação GitHub/Vercel pendente | Configurar ambientes e secrets e executar pipeline no GitHub |
| 2 — Segurança e acesso | Troca de senha e revogação implementadas localmente | Validar em preview; depois implementar recuperação por e-mail com serviço configurado |
| 3 — Integrações resilientes | Fila persistente, worker, painel e reprocessamento implementados localmente | Validar em preview e configurar execução periódica do worker |
| 4 — Conciliação e fechamento | Alocações parciais, divergências e fechamento mensal por conta implementados localmente | Validar em preview com extratos representativos e conferir competências antes da produção |
| 5 — Contabilidade e demonstrativos | Prévia, cópia histórica de regras, trilha de origem e demonstrativos corrigidos localmente | Validar mapeamentos contábeis e fiscais e testar a implantação em preview |
| 6 — Backup operacional | Criptografia, cópia externa configurável, retenção e ensaio isolado implementados localmente | Configurar destino externo real, custodiar a chave e agendar execução e ensaios no host de operação |
| 7 — Monitoramento e auditoria | Planejado; auditoria operacional já existe | Identificadores de correlação, logs sem segredos e alertas de falha com canal configurado |
| 8 — Experiência e desempenho | Planejado | Testar fluxos em navegador e celular e medir consultas antes de otimizar ou paginar |

## Critérios para os próximos pacotes

Cada entrega deve conter código, testes dos riscos envolvidos, instruções de configuração e retorno, e identificação explícita do que foi validado. Mudanças em modelos devem preservar paridade SQLite/PostgreSQL, migrações e restauração. Reprocessar integrações não pode duplicar títulos; conciliar não pode criar movimento bancário adicional; relatórios e alertas não podem expor valores internos ao produtor.

Serviços de e-mail, armazenamento e notificações precisam ser configurados para testes reais. A confirmação de regras de conciliação parcial e contas contábeis deve preceder alterações que mudem resultados financeiros. O desenvolvimento local pode continuar enquanto a ativação GitHub do pacote 1 estiver pendente.
