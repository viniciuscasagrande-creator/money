# SOUL v5.3 — Travas Progressivas de Repasse

## Escopo desenvolvido
- Política independente por evento (`EventReleasePolicy` e `EventReleaseTier`), com capacidade comercial configurada, faixas de vendas em pontos-base (`10.000 = 100%`), teto cumulativo e versionamento (`v1`, `v2`...).
- Tela interna `/politicas-repasses` e API `GET/POST /api/financeiro/politicas-liberacao` exclusivas de `ADMIN` e `FINANCE_DISK`.
- Integração do cálculo ao limite de novas solicitações de `REPASSE` e ao valor elegível mostrado no Portal do Produtor.
- Revalidação das solicitações existentes antes de `APPROVE`, `FINANCE_SIGN` e `SETTLE`, considerando o teto cumulativo e recursos ainda suficientes.
- O teto não cria dinheiro. A disponibilidade final é sempre o menor entre (a) limite progressivo residual e (b) disponibilidade financeira efetiva, com retenções, chargebacks, transferências e solicitações já comprometidas.
- Sem liberação bancária automática e sem dados financeiros fictícios.
