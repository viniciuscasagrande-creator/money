# ERP Financeiro — Pacote 03 (cumulativo)

**Tecnologias:** Next.js 15 + React 19 + TypeScript + Tailwind CSS + shadcn/ui + Node.js + Prisma 6. Os módulos do Pacote 01 e Pacote 02 permanecem incluídos.

## 1. Novidades

- Conciliação manual entre linhas importadas de extrato e razão interno, com referências únicas, sem alterar caixa.
- Estornos/chargebacks como ocorrências de risco, retendo ou abatendo o direito do produtor por evento.
- Planejamento orçamentário de receitas e despesas por evento (dados projetados, sem lançamentos reais).
- Controle documental de contratos.
- Pré-exportação contábil CSV em partidas sugeridas para revisão.
- Cinco novos menus disponíveis somente ao Financeiro Interno e Administrador.

**ATENÇÃO:** este pacote não executa transações bancárias reais, estorno em adquirente, assinatura digital certificada, conciliação automática de arquivo oficial, integração contábil externa ou declarações fiscais.

## 2. Executar um ambiente novo de desenvolvimento no Windows / VS Code

Requer Node.js 22+ e npm, internet para instalar as dependências e uma pasta de trabalho local. Extraia o ZIP, abra a pasta raiz no VS Code e execute no PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:push
```

`DATABASE_URL="file:./local.db"` mantém os dados em `prisma/local.db`. Configure `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` e `BOOTSTRAP_ADMIN_NAME` **somente na sessão atual de terminal**, não registre credenciais em arquivos versionados, e execute:

```powershell
npm run bootstrap
npm run dev
```

Acesse `http://localhost:3000`. A base nova deve iniciar sem dados financeiros preenchidos. Crie seus produtores, eventos e taxas de homologação manualmente.

## 3. Banco PostgreSQL

Use conexão PostgreSQL em `DATABASE_URL` e os comandos:

```powershell
npm run db:generate:pg
npm run db:push:pg
```

**Somente em banco de desenvolvimento descartável.** No banco existente ou em produção, faça backup + restauração de ensaio e gere uma **migração Prisma versionada e revisada** para os novos modelos antes de executar. Os comandos `db:push` não são processo adequado para upgrade de produção.

O cliente Prisma é gerado para o último schema selecionado. Não alterne entre SQLite e PostgreSQL usando a mesma instância sem regenerá-lo.

## 4. Testar

Com dependências:

```powershell
npm run db:generate
npm run typecheck
npm test
npm run build
```

Para executar validação isolada e cenário HTTP/Prisma em SQLite temporário no Windows (sem tocar no banco local ou produção):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\homologacao-local.ps1
```

O script cria um SQLite temporário, instancia usuários de homologação, roda testes de cadastro, acesso, venda, repasse, saldos, conciliação, ocorrências, orçamento, contratos e pré-exportação contábil. Depois remove o banco temporário. A execução E2E **ainda não foi confirmada neste ambiente de geração**.

Sem npm instalado, apenas para revisão de lógica pura, execute `node scripts/validacao-estatica.mjs` e `node scripts/testes-sem-dependencias.mjs` caso haja TypeScript global.

## 5. Fluxo resumido de uso

1. Acesse com um usuário **Financeiro Interno**.
2. Cadastre produtores, eventos, gateways, MDR e taxa por evento; registre vendas e liquide recebíveis apenas quando confirmado.
3. Cadastre contas internas e observe os saldos.
4. Em **Conciliação Bancária**, registre uma linha de extrato e faça vínculo com um lançamento do razão da mesma conta, sinal e valor.
5. Em **Estornos e Chargebacks**, escolha uma venda, registre o impacto cautelar do produtor, confirme ou rejeite. Consulte como o bloqueio altera os limites em **Saldos** e **Repasses**.
6. Crie orçamentos e contratos sem afetar caixa.
7. Em **Contabilidade / Exportação**, selecione período de até 93 dias e exporte CSV para análise contábil.

## 6. Controles de acesso

| Tela/ação | Administrador | Financeiro Interno | Produtor |
| --- | --- | --- | --- |
| Extratos bancários / conciliação | Sim | Sim | Não |
| Ocorrências de risco | Sim | Sim | Não |
| Contratos, orçamentos | Sim | Sim | Não |
| Pré-exportação contábil | Sim | Sim | Não |
| Saldo informacional próprio | Sim (todos) | Sim (todos) | Somente seus eventos |
| Taxas/MDR e receita própria | Sim | Sim | Não |

O Produtor não recebe novas permissões internas neste pacote.

## 7. Status desta entrega

Foi executada uma validação **sintática** da árvore TS/TSX e foram aprovados **13 testes matemáticos isolados**, incluindo os novos cenários de disponibilidade e conciliação. **Não foi possível executar `npm install`, `prisma validate`, `prisma db push`, `typecheck`, `next build` ou os testes reais HTTP/Prisma nesta sessão**; faltam instalação das dependências e homologação de banco antes de aprovação operacional.

Consulte `ARQUITETURA_PACOTE_03.md` e `homologacao/PLANO_PACOTE_03.md` para detalhes.
