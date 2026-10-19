# FINANCEIRO — Pacote 01 | Fundação do ERP

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · componentes shadcn/ui (Radix) · Node.js (Route Handlers) · Prisma ORM 6 · SQLite / PostgreSQL.

Projeto **novo e independente**, com front-end e backend integrados na aplicação Next.js e persistência em banco relacional. Todos os textos visíveis estão em português do Brasil. **Não existem produtores, eventos, lançamentos ou saldos fictícios.** Somente o primeiro administrador é criado pelo comando de bootstrap, com credenciais escolhidas pelo responsável.

## Entregas do Pacote 01

| Área | Funcionalidades entregues |
| --- | --- |
| Login e segurança | Login com senha bcrypt, sessão com cookie HttpOnly e SameSite, expiração, bloqueio básico de tentativas, segregação por perfil em páginas e APIs |
| Dashboard financeiro | Caixa consolidado para Financeiro Interno, recebimentos e pagamentos em aberto/liquidados, eventos, últimas movimentações |
| Contas a receber | Cadastro de títulos, vínculo opcional a produtor/evento, vencimento, consulta e liquidação |
| Contas a pagar | Cadastro, pendências e liquidação em conta com verificação de saldo |
| Tesouraria e contas bancárias | Cadastro de conta, saldo inicial informado pelo operador e lançamentos de crédito/débito |
| Razão financeiro | Lançamentos persistidos em centavos (BigInt), origens e direção, uma entrada por título liquidado |
| Saldos | Verificação do saldo da conta contra as somas do razão; consulta informativa por evento para produtor |
| Cadastros | Produtores, eventos, usuários e suas vinculações |
| Permissões | Administrador, Financeiro Interno e Produtor; telas e endpoints protegidos |
| Auditoria básica | Registro de cadastros e liquidações, associado ao operador responsável |

**Importante:** “Liquidar” registra uma operação financeira informada pelo operador no ERP; **não executa PIX, transferência bancária ou cobrança em adquirente**. Integrações bancárias, reconciliação externa, taxas/MDR, split, obrigações de repasse, aprovações e assinaturas são próximos pacotes.

## 1. Executar no VS Code — SQLite local (Windows PowerShell)

**Requisitos:** Node.js 22+, npm e VS Code. Abra a pasta `financeiro-pacote-01` no VS Code e execute:

```powershell
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:push
```

O `.env` de SQLite deve conter:

```dotenv
DATABASE_URL="file:./local.db"
```

**Criação do primeiro administrador (necessária, sem usuário/senha padrão):**

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL="admin@seudominio.com.br"
$env:BOOTSTRAP_ADMIN_PASSWORD="CRIE_AQUI_UMA_SENHA_FORTE_COM_12_OU_MAIS_CARACTERES"
$env:BOOTSTRAP_ADMIN_NAME="Administrador"
npm run bootstrap
Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
Remove-Item Env:BOOTSTRAP_ADMIN_NAME
npm run dev
```

Acesse **http://localhost:3000** e faça login. O bootstrap é intencionalmente bloqueado se já existir um administrador, para impedir recriação indevida de acesso. Não copie uma senha de exemplo como senha definitiva.

### macOS/Linux

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
BOOTSTRAP_ADMIN_EMAIL='admin@seudominio.com.br' BOOTSTRAP_ADMIN_PASSWORD='SENHA_FORTE_COM_12_OU_MAIS_CARACTERES' npm run bootstrap
npm run dev
```

## 2. PostgreSQL (alternativa a SQLite)

O projeto fornece esquemas equivalentes em `prisma/schema.prisma` (SQLite) e `prisma/postgresql/schema.prisma` (PostgreSQL). **Não basta trocar a URL:** gere o cliente para o provider correspondente.

```powershell
# Alterar DATABASE_URL em .env:
# DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/financeiro?schema=public"
npm run db:generate:pg
npm run db:push:pg
npm run bootstrap
npm run dev
```

Para PostgreSQL, configure previamente um banco e usuário com permissões adequadas, credenciais fortes, conexão TLS em ambientes externos e backups. O comando `db:push` é adequado para um banco novo de desenvolvimento/homologação; **não é um plano de migração segura de banco com dados existentes**. Depois de gerar o cliente de um provider, não execute o comando de geração para o outro provider sem também alterar a URL/ambiente.

**SQLite não é indicado para publicação serverless em Vercel:** o sistema de arquivos pode não ser persistente. Para produção/serverless, escolha PostgreSQL hospedado com conexões adequadamente gerenciadas. Este pacote **não foi publicado nem homologado em produção**.

## 3. Primeiro acesso — fluxo

1. Entre com o administrador inicial.
2. Em **Cadastros e Acessos**, crie um **Produtor**.
3. Crie um **Evento** vinculado ao produtor.
4. Cadastre um **Usuário Produtor** associado ao mesmo produtor.
5. Crie uma **Conta Bancária** com o saldo inicial verdadeiro. Pode começar em R$ 0,00.
6. Cadastre um **Recebível** e/ou **Pagamento**, vinculando a produtor/evento se necessário.
7. Use **Liquidar** para registrar entrada/saída de caixa; os saldos e a auditoria serão atualizados.
8. Entre como Produtor e confirme que só aparecem títulos e eventos do produtor associado, sem contas bancárias internas.

O saldo inicial declarado pelo operador gera lançamento de abertura para permitir conferir o razão. O sistema **não importa saldo de bancos nem adivinha saldos**.

## 4. Regras financeiras do núcleo

- Quantias armazenadas em **centavos inteiros (`BigInt`)**; não se usa ponto flutuante para somas financeiras.
- Cada título tem situação `OPEN`, `SETTLED` ou `CANCELED`; este pacote expõe criação e liquidação, não cancelamento.
- Na criação do título não ocorre movimentação no caixa.
- Na liquidação de um recebível, o saldo aumenta e é criado um `LedgerEntry/CREDIT`.
- Na liquidação de um pagamento, o saldo diminui e é criado um `LedgerEntry/DEBIT` somente se o saldo da conta for suficiente.
- A alteração do título, atualização do saldo, lançamento no razão e auditoria são executados na **mesma transação de banco**. Não é possível liquidar um título duas vezes com êxito.
- O produtor vê **movimentos associados a seus eventos**, não as contas da empresa. **Não há saldo para repasse** até implementar separação entre receita, taxas, passivos e retenções.
- Não existe tela de acesso direto ou edição de lançamento contábil/razão; correções e estornos auditados requerem regras próprias nos próximos pacotes.

## 5. Menu conforme perfil

| Menu | Administrador | Financeiro Interno | Produtor |
| --- | :---: | :---: | :---: |
| Dashboard Financeiro | ✓ | ✓ | Limitado |
| Recebimentos | ✓ | ✓ | Consulta própria |
| Contas a Pagar | ✓ | ✓ | Consulta própria |
| Tesouraria e Bancos | ✓ | ✓ | — |
| Saldos e Posições | ✓ | ✓ | Informativo |
| Cadastros e Acessos | ✓ | — | — |
| Auditoria Inicial | ✓ | — | — |

O login protege as **rotas do servidor** e as **APIs**, não apenas os menus ocultos. Acesso do produtor é filtrado pelo `producerId` da sessão em consultas de títulos e eventos.

## 6. Organização do código

```
prisma/
  schema.prisma                # SQLite
  postgresql/schema.prisma     # PostgreSQL
scripts/
  bootstrap.ts                 # Primeiro administrador
  smoke-test.mjs              # Teste de API não destrutivo
src/
  app/
    (auth)/login/             # Login
    (workspace)/              # Telas protegidas
    api/                      # Backend Node.js/Route Handlers
  components/
    financeiro/               # Dashboard, formulários e navegação
    ui/                       # Componentes no padrão shadcn/ui
  lib/
    auth.ts                   # Sessões e autorização
    finance.ts                # Regras transacionais financeiras
    money.ts                  # Conversão de moeda segura
    prisma.ts                 # Cliente ORM compartilhado
    validation.ts             # Validação de payloads
```

## 7. Testes e verificação

```powershell
npm run typecheck
npm test
npm run build
```

Com o servidor iniciado, é possível executar o smoke test não destrutivo (usa login existente e faz somente consultas):

```powershell
$env:TEST_EMAIL="admin@seudominio.com.br"
$env:TEST_PASSWORD="SUA_SENHA_REAL"
npm run test:smoke
Remove-Item Env:TEST_EMAIL
Remove-Item Env:TEST_PASSWORD
```

O teste de smoke lê cinco endpoints, depois encerra a sessão. Ele não cria eventos, contas nem títulos. O teste unitário cobre parsing e formatação monetária.

## 8. APIs implementadas

| Método | Endpoint | Permissão |
| --- | --- | --- |
| POST | `/api/auth/login`, `/api/auth/logout` | Autenticação |
| GET | `/api/dashboard` | Todos, com recorte por perfil |
| GET | `/api/recebimentos`, `/api/pagamentos` | Todos, com recorte por perfil |
| POST | `/api/recebimentos`, `/api/pagamentos` | Interno |
| POST | `/api/titulos/:id/liquidar` | Interno |
| GET/POST | `/api/contas` | Interno |
| GET | `/api/saldos` | Todos, resposta segregada |
| GET | `/api/admin/produtores` | Interno |
| POST | `/api/admin/produtores` | Administrador |
| GET | `/api/admin/eventos` | Todos, com recorte por perfil |
| POST | `/api/admin/eventos` | Administrador |
| GET/POST | `/api/admin/usuarios` | Administrador |
| GET | `/api/auditoria` | Administrador |

## 9. Pendências para homologação e produção

Esta é uma **fundação funcional em código-fonte, não uma certificação de produção**. Antes de usar com valores operacionais reais, realizar instalação, compilação, testes completos em banco real, homologação e auditoria de segurança. Em especial:

- Implantar HTTPS/TLS, WAF e limitação de tentativas também na borda, MFA, política de troca de senhas e gerenciamento de sessões.
- Usar PostgreSQL gerenciado com backup, restaurabilidade testada, migrações versionadas e proteção de credenciais.
- Criar testes de integração transacionais e de concorrência, permissões por evento e contas, e testes ponta a ponta dos formulários.
- Implementar cancelamento/estorno via contralançamentos, nunca edição ou exclusão de entradas financeiras.
- Garantir revisão de alçadas/aprovações antes de efetuar processos financeiros regulados ou integração bancária.
- Desenvolver pagamentos/repasses reais apenas depois das regras de split, taxas, retenções, obrigações e conciliação.
- Implementar trilha de auditoria reforçada e políticas de retenção/LGPD, monitoramento e alertas.

**Status da entrega:** código-fonte gerado e verificado sintaticamente. A compilação, instalação das dependências e testes end-to-end precisam ser executados em ambiente com acesso ao registro npm e banco configurado. Nenhum deploy foi realizado.
