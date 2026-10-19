# Plano de Homologação — Pacote 04

**Ambiente permitido:** SQLite temporário controlado (`scripts/homologacao-local.ps1`), sem dados reais, sem conexão bancária. O script usa a base e credenciais criadas em tempo de execução.

## Verificações previstas

- [ ] Instalar dependências e gerar Prisma Client
- [ ] Validar criação das quatro novas tabelas em SQLite descartável
- [ ] Executar `npm run typecheck`, `npm test` e `npm run build`
- [ ] Login, sessões e bloqueio de requisições de origem cruzada
- [ ] Produtor A não recebe eventos, relatórios nem informações da Disk pertencentes a B
- [ ] Produtor não acessa gateways, auditoria, alertas internos, alçadas e configurações
- [ ] Financeiro Interno não altera permissões administrativas
- [ ] Financeiro Interno sem alçada ativa não aprova solicitações
- [ ] Financeiro Interno com alçada adequada aprova, com regra de assinatura de Produtor → Financeiro
- [ ] Liquidações internas mantêm razão e saldo coerentes (sem ordem bancária real)
- [ ] Relatórios somam vendas e repasses com centavos íntegros e CSV sem fórmulas
- [ ] Alertas consultados sob demanda, sem alterar status dos registros
- [ ] Mudanças de parâmetros, permissões e alçadas geram audit logs
- [ ] Auditoria paginada e exportação autorizada somente para Admin
- [ ] Verificação independente no schema PostgreSQL em ambiente isolado
- [ ] Revisão de migrações a partir da base existente; backup e simulação de rollback
- [ ] Testes de concorrência, desempenho, autorização e segurança antes de produção

## Conclusão atual

**O executor foi atualizado, mas os cenários HTTP/Prisma e compilação completa permanecem não executados nesta sessão**, sem acesso às dependências npm. O pacote é um **artefato para homologação**, não uma aprovação para transações bancárias reais.
