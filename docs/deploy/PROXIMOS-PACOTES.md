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
| 8 — Experiência e desempenho | Planejado | Testar fluxos em navegador e celular e medir consultas antes de otimizar ou paginar |
| 9 — Homologação e implantação | Planejado | Testar os fluxos completos no navegador, validar permissões por perfil e ensaiar implantação e retorno da versão |
| 10 — Segurança operacional | Planejado | Autenticação em dois fatores para administradores, recuperação de acesso e revisão das sessões |
| 11 — Aprovações financeiras | Planejado | Aprovação em duas etapas para alterações de dados bancários, estornos e operações acima de limites definidos |
| 12 — Qualidade dos dados | Planejado | Identificar cadastros duplicados, vínculos incompletos e inconsistências financeiras, com correção rastreável |

## Critérios para os próximos pacotes

Cada entrega deve conter código, testes dos riscos envolvidos, instruções de configuração e retorno, e identificação explícita do que foi validado. Mudanças em modelos devem preservar paridade SQLite/PostgreSQL, migrações e restauração. Reprocessar integrações não pode duplicar títulos; conciliar não pode criar movimento bancário adicional; relatórios e alertas não podem expor valores internos ao produtor.

Serviços de e-mail, armazenamento e notificações precisam ser configurados para testes reais. A confirmação de regras de conciliação parcial e contas contábeis deve preceder alterações que mudem resultados financeiros. O desenvolvimento local pode continuar enquanto a ativação GitHub do pacote 1 estiver pendente.
