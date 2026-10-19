# ERP Financeiro — Fintech Premium (Atualização visual 4.1)

Este projeto é **cumulativo** e inclui os Pacotes 01, 02, 03 e 04, com a identidade visual **Fintech Premium** aplicada ao layout global, Dashboard Financeiro, tela de login e componentes compartilhados.

- [Novidades, arquivos alterados e limitações](VISUAL_FINTECH_PREMIUM.md)
- **Prévia visual estática:** `preview/visual-fintech-premium.html` (sem login nem conexão com banco)
- Os fluxos financeiros e controles originais foram preservados.

---

# ERP Financeiro — Pacote 04 (cumulativo)

Contém os módulos desenvolvidos nos **Pacotes 01, 02, 03 e 04**. Não substitui o núcleo financeiro nem restaura dados fictícios. **Sem conexão bancária real**, sem execução de transferências, sem assinatura digital certificada e sem estornos externos.

**Tecnologias:** Next.js 15, React 19, TypeScript, Tailwind CSS 3, componentes shadcn/ui, Node.js 22+ e Prisma 6 (SQLite e PostgreSQL).

## Novos módulos do Pacote 04

| Menu lateral | Acesso | Função |
|---|---|---|
| Relatórios Executivos | Administrador, Financeiro Interno e Produtor (visão restrita) | Indicadores, filtro por evento/produtor/período, gráficos, CSV |
| Central de Alertas | Interno | Títulos vencidos, repasses, riscos e conciliações pendentes; confirmar leitura |
| Permissões e Alçadas | Administrador | Restrições por usuário e limites de aprovação de repasses e antecipações |
| Configurações Financeiras | Administrador | Dias-limite para alertas, com auditoria |
| Auditoria Completa (consulta ampliada) | Administrador | Pesquisa de trilha existente, paginação e CSV |

A pré-exportação contábil continua no menu **Contabilidade / Exportação** (Pacote 03).

## 1. Executar no VS Code — base SQLite nova

1. Extraia `financeiro-pacote-04.zip` e abra **a pasta extraída inteira** no VS Code.
2. Use Node.js 22+ e acesso à internet para instalação inicial.
3. No PowerShell, execute:

```powershell
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:push
```

O comando `db:push` acima só deve ser usado em uma **base nova ou descartável**. O padrão do `.env.example` é `DATABASE_URL="file:./local.db"`, com banco em `prisma/local.db`. Não execute em bases existentes sem backup e migração aprovada.

Configure no ambiente as variáveis `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (senha forte, pelo menos 12 caracteres) e `BOOTSTRAP_ADMIN_NAME`; veja `scripts/bootstrap.ts`. Não suba `.env` para Git. Execute:

```powershell
npm run bootstrap
npm run dev
```

Acesse `http://localhost:3000` e entre com o administrador cadastrado. Todos os dados financeiros partem vazios, sem simulações.

## 2. PostgreSQL

Use a URL PostgreSQL segura no ambiente (não compartilhar credenciais). Para **nova base descartável**:

```powershell
npm run db:generate:pg
npm run db:push:pg
npm run bootstrap
npm run dev
```

**Banco existente:** faça backup e teste restauração; verifique as quatro tabelas novas com `prisma migrate diff`, prepare migração versionada e passe por homologação antes de aplicar em produção. O Prisma Client deve ser regenerado após troca de provider.

## 3. Operação inicial do Pacote 04

1. No menu **Cadastros e Acessos**, cadastre usuários e produtores; a área administrativa é exclusiva de ADMIN.
2. Em **Permissões e Alçadas**, selecione um usuário do Financeiro Interno, o tipo **REPASSE** ou **ANTECIPACAO** e defina o limite em reais. Ausência de alçada bloqueia aprovações por usuários `FINANCE_DISK`.
3. Em **Relatórios Executivos**, selecione período e escopo para consultar vendas, direitos e repasses. O Produtor vê apenas seus eventos, sem custos MDR/taxas internas. Exportação CSV disponível.
4. Em **Central de Alertas**, consulte as pendências. A confirmação de leitura não baixa nem aprova uma operação.
5. Em **Configurações Financeiras**, defina os limites em dias de cada alerta.
6. Em **Auditoria Completa**, filtre as atividades e exporte CSV para análise.

O Admin é exceção às alçadas individuais; essa atuação permanece registrada no histórico. As telas do Pacote 04 usam dados persistidos pelos Pacotes 01–03.

## 4. Homologação obrigatória (não movimenta dinheiro real)

Execute em um projeto com dependências instaladas:

```powershell
npm run typecheck
npm test
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\homologacao-local.ps1
```

O script abre uma **base SQLite temporária exclusiva**, cria usuários sintéticos, testa isolamento entre dois produtores, registros financeiros, taxas, limites de aprovação, conciliação, riscos, relatórios, governança, auditoria e descarte da base. Ele só roda com URL `localhost`, variável `ISOLATED_HOMOLOGATION=SIM` e identificador temporário. Consulte `homologacao/PLANO_PACOTE_04.md`.

Sem dependências, uma avaliação parcial pode rodar com TypeScript global:

```powershell
node scripts/validacao-estatica.mjs
node scripts/testes-sem-dependencias.mjs
```

**Importante:** esses testes parciais não garantem que o Next.js/Prisma execute corretamente.

## 5. Limites reais do pacote

- Relatórios agregados **não são demonstrativos fiscais ou fechamentos contábeis**; datas por registro, status atuais.
- Auditoria usa trilha de dados da aplicação; **não é registro criptograficamente imutável** ou conformidade regulatória certificada.
- Alertas são consultas sob demanda; **não existe agendamento ou envio automático de mensagens**.
- Sem movimentação bancária automática, execução externa de estorno, assinatura digital certificada, conciliação automática de arquivos reais, integração de ERP contábil ou homologação de produção.
- Falta validar build/typecheck/Prisma/E2E: não liberações operações financeiras reais com base somente na criação deste pacote.

Consulte `ARQUITETURA_PACOTE_04.md` para detalhes técnicos e as arquiteturas anteriores para a continuidade dos três pacotes originais.
