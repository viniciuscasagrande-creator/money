# Pacote 01 — Arquitetura e contratos

## Arquitetura

```
Navegador (Next.js App Router + Tailwind + shadcn/ui)
           │ HTTPS + cookie de sessão HttpOnly
           ▼
Next.js Server Components / Route Handlers (Node.js)
           │
           ├─ Autenticação e autorização por usuário
           ├─ Validação Zod + regras de negócio
           ├─ Serviço financeiro transacional
           └─ Auditoria básica
           │
           ▼
        Prisma Client
           │
   SQLite local OU PostgreSQL
```

## Núcleo do razão financeiro

```
BANK_ACCOUNT (saldo registrado)
     ├─ FINANCIAL_TITLE (em aberto)
     └─ LIQUIDAÇÃO (transação atômica)
          ├─ FINANCIAL_TITLE -> SETTLED
          ├─ BANK_ACCOUNT -> incremento/decremento
          ├─ LEDGER_ENTRY -> CREDIT/DEBIT
          └─ AUDIT_LOG -> TITLE_SETTLED
```

Todo título é criado sem afetar o saldo. A liquidação é idempotente do ponto de vista de estado: uma segunda liquidação do mesmo título é rejeitada.

## Modelo de isolamento de dados

- `User.producerId` vincula o login externo a um único produtor no Pacote 01.
- `Event.producerId` identifica o proprietário do evento.
- `FinancialTitle.producerId` limita a visão do produtor aos registros vinculados.
- Produtores não acessam `BankAccount`, `LedgerEntry` brutos ou auditoria interna.
- Apenas administrador cria usuários, eventos ou produtores; ambos os perfis internos podem criar títulos e contas.
- O saldo bancário é propriedade da empresa e não deve ser confundido com obrigações de terceiros.

## O que permanece intencionalmente de fora

- Repasses, antecipações, borderôs, assinaturas e alçadas de aprovação.
- MDR, bandeiras, regras de receitas, percentuais e taxas por evento.
- Conciliações externas de gateway, PIX e extrato bancário.
- Estornos, chargebacks e correções por contrapartida.
- Integrações com serviços bancários e execução de transferências.
- DRE, balanço, fiscal, orçamento, provisões e controles contábeis avançados.

Esses itens possuem entrada prevista nos pacotes seguintes e **não foram substituídos por telas simuladas**.
