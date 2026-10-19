# Validação de homologação — Pacote 03

## Resultado nesta geração

- Testes de regras puras: **13 aprovados de 13** (5 novos, 8 herdados).
- Verificação sintática TypeScript/TSX: aprovada (não substitui typecheck com dependências).
- Comparação estrutural do schema Prisma SQLite/PostgreSQL: mesmos nomes de modelos e enums; **não equivale a Prisma Validate**.
- API e servidor Next.js: **não executados**.
- Banco SQLite/PostgreSQL: **não criado nem migrado** nesta sessão.
- Sem interações reais com adquirentes ou bancos.

## Cenários adicionados ao script `scripts/homologacao-integrada.mjs`

1. Login isolado e acessos proibidos do Produtor a todas as novas rotas de controle.
2. Importação de extrato com referência única por conta e rejeição de duplicidade.
3. Conferência da conta, direção e valor; proibição de dupla conciliação.
4. Conciliação sem alteração de saldo bancário.
5. Abertura de risco, retenção do valor no limite do evento e rejeição com liberação.
6. Confirmação de perda e redução do limite de repasse.
7. Cadastro de contrato documental e orçamento sem movimentar caixa.
8. Pré-exportação contábil por período com débitos e créditos do mesmo valor.

## Barreiras obrigatórias antes de uso real

- Validar modelo Prisma para PostgreSQL, migrar banco de homologação com dados históricos, testar rollback e restaurar backup.
- Executar `npm run typecheck`, `npm test`, `npm run build` sem falhas.
- Executar o arquivo PowerShell `scripts/homologacao-local.ps1` com Node, Prisma e Next instalados.
- Fazer testes de concorrência de pedidos, bloqueios de risco, reconciliações duplicadas e edição de títulos.
- Homologar importação de extratos oficiais e integração gateway/banco, observando idempotência e autenticação.
- Revisar o modelo contábil com o contador, pois esta versão só apresenta pré-classificações.
- Implantar fluxo de reembolso/chargeback real e conciliação de transferências **somente em pacote posterior com autorização e controles adicionais**.
