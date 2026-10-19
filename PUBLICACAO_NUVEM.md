# Guia de Publicação em Nuvem (Link Público) — ERP Financeiro

O sistema já está configurado com o pipeline automático [scripts/deploy-build.mjs](file:///E:/MONEY/scripts/deploy-build.mjs) e [vercel.json](file:///E:/MONEY/vercel.json), que detectam automaticamente o banco **PostgreSQL** em nuvem, criam as **23 tabelas** do modelo financeiro, cadastram o **Administrador inicial** (apenas no primeiro deploy) e compilam o Next.js.

---

## Passo 1 — Criar o Banco PostgreSQL Gratuito (Neon ou Supabase)

1. Acesse [https://neon.tech](https://neon.tech) (ou [https://supabase.com](https://supabase.com)) e crie um projeto gratuito.
2. Copie a string de conexão (**Connection String**) do PostgreSQL:
   ```text
   postgresql://usuario:senha@ep-exemplo.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

---

## Passo 2 — Publicar na Vercel (ou Railway / Render)

1. Acesse [https://vercel.com/new](https://vercel.com/new) e entre com sua conta do **GitHub**.
2. Clique em **Import** no repositório `viniciuscasagrande-creator/money`.
3. Na seção **Environment Variables**, adicione as seguintes variáveis:

| Nome da Variável | Valor Recomendado |
| :--- | :--- |
| `DATABASE_URL` | Sua URL do PostgreSQL copiada no Passo 1 (`postgresql://...`) |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@suaempresa.com.br` (ou `admin@financeiro.local`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Uma senha forte com **pelo menos 12 caracteres** (ex.: `Admin@Financeiro2026!`) |
| `BOOTSTRAP_ADMIN_NAME` | `Administrador Geral` |
| `EXTERNAL_TICKETING_API_KEY` | Chave secreta para a integração de venda de ingressos |

4. Clique em **Deploy**.

---

## O que acontece automaticamente no Deploy

Durante o deploy, o comando `npm run deploy:build` ([scripts/deploy-build.mjs](file:///E:/MONEY/scripts/deploy-build.mjs)) executa:
1. `npx prisma generate --schema=prisma/postgresql/schema.prisma`
2. `npx prisma db push --schema=prisma/postgresql/schema.prisma --skip-generate`
3. Verifica se já existe um usuário `ADMIN`:
   - Se o banco for novo, cria o Administrador configurado em `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (sem nenhum dado financeiro fictício).
   - Nos próximos deploys, mantém os usuários e dados existentes intactos.
4. Executa `npx next build` e disponibiliza o link público `https://seu-projeto.vercel.app`.
