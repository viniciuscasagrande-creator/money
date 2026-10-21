# Guia de Publicação em Nuvem (Link Público) — ERP Financeiro

O build gera o cliente Prisma e compila o Next.js. Ele não altera o banco nem cria administrador. Para a entrega atual, siga [CI/CD e homologação PostgreSQL](CI-CD-E-HOMOLOGACAO-POSTGRESQL.md) e o [guia de atualização](ATUALIZACAO-AUDITORIA-V5.2.1.md). Migrações são versionadas e executadas separadamente.

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
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha única com pelo menos 12 caracteres; usada apenas no bootstrap explícito |
| `BOOTSTRAP_ADMIN_NAME` | `Administrador Geral` |
| `EXTERNAL_TICKETING_API_KEY` | Chave secreta para a integração de venda de ingressos |

4. Clique em **Deploy**.

---

## O que acontece automaticamente no Deploy

Durante o deploy, o comando `npm run deploy:build` ([scripts/deploy-build.mjs](file:///E:/MONEY/scripts/deploy-build.mjs)) executa:
1. `npx prisma generate --schema=prisma/postgresql/schema.prisma`
2. Executa `npx next build`.

A aplicação do schema usa `prisma migrate deploy`, depois da homologação. Um banco existente precisa de baseline validado. O primeiro administrador é criado exclusivamente por `npm run bootstrap`, com credenciais fornecidas pelo operador. A publicação revisada está no workflow manual `release.yml`; por padrão o destino é preview.
