# MONEY / SOUL Financeiro — v5.2.1

Etapa de homologação PostgreSQL e entrega automatizada: veja [CI/CD e homologação](docs/deploy/CI-CD-E-HOMOLOGACAO-POSTGRESQL.md). Os workflows validam SQLite e PostgreSQL em ambientes separados e deixam a publicação em produção condicionada à revisão do ambiente.

Correções de integridade, autorização, build e recuperação aplicadas em 20/10/2026.

- [Guia de atualização e restauração](docs/deploy/ATUALIZACAO-AUDITORIA-V5.2.1.md)
- [Relatório de correções e validação](docs/homologacao/CORRECOES-AUDITORIA-V5.2.1.md)

O build não cria banco ou administrador. Siga o guia para migrar a base existente antes de executar os fluxos financeiros.

---

## Documentação histórica da versão anterior

# ERP Financeiro — Fintech Premium (v4.1)

Sistema ERP Financeiro completo (**Pacotes 01 + 02 + 03 + 04**) com identidade visual **BankOS — Fintech Premium**, estruturado em **17 menus principais e 172 submenus**, conectado ao **Lakebase Postgres (Neon)** e publicado na **Vercel**.

- **Acesso Oficial em Produção**: [https://money-alpha-nine.vercel.app/login](https://money-alpha-nine.vercel.app/login)
- **Stack Tecnológica**: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui · Prisma ORM (PostgreSQL / SQLite) · Lakebase Postgres (Neon)

---

## Estrutura Organizada do Projeto

```text
E:\MONEY
├── .agents/skills/                   # Agent Skills oficiais do Neon (neon, neon-postgres, neon-postgres-branches)
├── docs/                             # Documentação centralizada do sistema
│   ├── arquitetura/                  # Documentação técnica dos Pacotes 01 a 04 e identidade visual
│   │   ├── ARQUITETURA_PACOTE_01.md
│   │   ├── ARQUITETURA_PACOTE_02.md
│   │   ├── ARQUITETURA_PACOTE_03.md
│   │   ├── ARQUITETURA_PACOTE_04.md
│   │   ├── HISTORICO_PACOTE_01.md
│   │   └── VISUAL_FINTECH_PREMIUM.md
│   ├── deploy/                       # Guia de publicação em nuvem (Neon + Vercel)
│   │   └── PUBLICACAO_NUVEM.md
│   ├── especificacao/                # Planilha oficial dos 17 menus e 172 submenus
│   │   └── modulo_financeiro_especificacao.xlsx
│   ├── homologacao/                  # Planos, guias e relatórios de homologação e validação
│   │   ├── GUIA_DE_HOMOLOGACAO.md
│   │   ├── PLANO_PACOTE_03.md
│   │   ├── PLANO_PACOTE_04.md
│   │   ├── RESULTADO_DA_REVISAO.md
│   │   ├── VALIDACAO_PACOTE_02.txt
│   │   └── VALIDACAO_PACOTE_04.md
│   └── preview/                      # Prévia visual estática em HTML
│       └── visual-fintech-premium.html
├── prisma/                           # Modelos e schemas de banco de dados (23 modelos, 15 enums)
│   ├── schema.prisma                 # Schema SQLite para homologação local isolada
│   └── postgresql/
│       └── schema.prisma             # Schema PostgreSQL oficial (Lakebase Postgres / Neon)
├── scripts/                          # Automação de build, bootstrap, migração e testes E2E
│   ├── bootstrap.ts                  # Criação segura do Administrador inicial
│   ├── deploy-build.mjs              # Pipeline de build para produção (Vercel + Neon)
│   ├── prepare-prisma.mjs            # Sincronização automática do Prisma (pooled vs unpooled)
│   ├── smoke-test.mjs                # Teste de integração não destrutivo (12 endpoints)
│   ├── homologacao-integrada.mjs     # Suíte E2E completa (47 verificações)
│   ├── homologacao-local.ps1         # Executor local de homologação isolada
│   ├── testes-sem-dependencias.mjs   # Executor rápido de testes unitários
│   └── validacao-estatica.mjs        # Verificador estático de sintaxe TS/TSX e paridade Prisma
├── src/                              # Código-fonte da aplicação
│   ├── app/                          # Rotas de páginas (Workspace/Auth) e 32 rotas de API REST
│   │   ├── (auth)/login/             # Tela dupla de Login (1. Administrador / 2. Produtor)
│   │   ├── (workspace)/              # Módulos operacionais dos Pacotes 01 a 04 + 172 submenus
│   │   └── api/                      # Endpoints REST autenticados com controle de alçada
│   ├── components/                   # Componentes React organizados por domínio
│   │   ├── financeiro/               # Componentes de negócio dos Pacotes 01 a 04 e Shell BankOS
│   │   └── ui/                       # Primitivos visuais reutilizáveis (shadcn/ui Fintech Premium)
│   ├── config/                       # Catálogo estruturado dos 17 menus e 172 submenus
│   │   └── navigation.ts
│   └── lib/                          # Regras de negócio, cálculos em centavos (BigInt) e Prisma
└── tests/                            # 23 testes unitários automatizados
```

---

## Comandos Principais

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Sincroniza o Prisma e inicia o servidor de desenvolvimento (`http://localhost:3000`) |
| `npm run build` | Sincroniza o Prisma (PostgreSQL/SQLite) e compila a aplicação para produção |
| `npm test` | Executa testes de regras de negócio, segurança e regressões com persistência e HTTP |
| `npm run typecheck` | Valida a tipagem TypeScript (`tsc --noEmit`) |
| `npm run test:static` | Verifica a sintaxe de todos os arquivos TS/TSX e a paridade SQLite/PostgreSQL |
| `npm run test:smoke` | Executa o smoke test ponta a ponta nas 12 APIs principais |
| `neon deploy` | Aplica a infraestrutura definida em `neon.ts` ao projeto Lakebase Postgres |

## Entregas incrementais

- [Pacote 2: segurança da conta](docs/deploy/PACOTE2-SEGURANCA.md).
- [Pacote 3: integrações resilientes](docs/deploy/PACOTE3-INTEGRACOES.md).
- [Pacote 4: conciliação e fechamento financeiro](docs/deploy/PACOTE4-CONCILIACAO-FECHAMENTO.md).
- [Pacote 5: contabilidade e demonstrativos](docs/deploy/PACOTE5-CONTABILIDADE-DEMONSTRATIVOS.md).
- [Situação dos próximos pacotes](docs/deploy/PROXIMOS-PACOTES.md).
