# Atualização visual — Fintech Premium | Fase inicial

## Objetivo
Aplicação de identidade inspirada no conceito BankOS (referência visual indicada pelo solicitante), implementada no próprio ERP Financeiro dos Pacotes 01–04. **Não é reprodução de código, assets ou elementos proprietários da referência**. O resultado foi desenvolvido com Next.js, React, Tailwind e os componentes shadcn/ui existentes.

## Mudanças implementadas

1. **Menu lateral global:** grafite e coral, recolhível no desktop, gaveta no celular, agrupamento de módulos, estado ativo e seções expansíveis.
2. **Barra superior:** indicação de área e perfil, busca funcional de módulos (Ctrl+K), link para alertas somente para quem possui acesso, menu de usuário e logout.
3. **Dashboard Financeiro:** cartão principal de saldo bancário consolidado (perfil interno) **OU** disponibilidade calculada para solicitação de repasse (Produtor), painel de pendências, quatro indicadores, evolução mensal real de entradas/saídas, atalhos e lista resumida de movimentações.
4. **Gráfico real:** agregação de títulos efetivamente liquidados nos últimos seis meses via API autenticada; valores em `BigInt`; zero quando não existem dados, sem séries simuladas.
5. **Componentes transversais:** temas Tailwind, cartões, botões, campos, tabelas e títulos de página padronizados nas telas existentes.
6. **Login:** estilo premium mantendo exatamente a autenticação e papéis anteriores.
7. **Prévia HTML:** `preview/visual-fintech-premium.html`, mostra a identidade sem login e sem acesso ao banco. É uma PRÉVIA ESTÁTICA, não a aplicação operacional. Todos os números nela estão zerados.

## Regras financeiras e de segurança preservadas

- Produtor não tem menus internos; seções e pesquisa exibem apenas áreas autorizadas.
- Dashboard do produtor não mostra contas bancárias, taxas internas da Disk ou saldo bancário consolidado.
- Dados exibidos vêm das APIs existentes e da agregação de títulos no banco; nenhuma movimentação bancária foi introduzida.
- Os valores de repasse exibidos permanecem informativos, sujeitos a aprovação e disponibilidade bancária.
- Não alteramos modelos Prisma ou migrations. O formato da resposta GET `/api/dashboard` foi ampliado de maneira aditiva com a propriedade `trend`.
- Navegação não modifica alçadas, permissões ou as regras de backend.

## Mapa de arquivos essenciais

- `src/components/financeiro/shell.tsx` — menu e topbar
- `src/components/financeiro/dashboard.tsx` — novo dashboard
- `src/app/api/dashboard/route.ts` — dados de tendências com escopo autorizado
- `src/lib/dashboard-trend.ts` — agregação monetária exata
- `src/app/globals.css` — identidade visual
- `src/components/ui/*` — componentes visuais compartilhados
- `src/components/financeiro/shared.tsx` — cabeçalhos padronizados
- `src/components/financeiro/login.tsx` — login
- `tests/dashboard-trend.test.ts` — novos testes de agregação
- `preview/visual-fintech-premium.html` — prévia estática

## Como rodar no VS Code

No diretório raiz do projeto:

```powershell
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:push
npm run bootstrap
npm run dev
```

**Importante:** os comandos de banco acima são destinados a uma **nova base local de desenvolvimento**. Não aplique `db:push` a um banco existente de produção. Consulte README e documentação dos pacotes para PostgreSQL, backup e homologação.

Abrir `http://localhost:3000` para ver o sistema com login. O arquivo de prévia estática pode ser aberto diretamente no navegador; não requer Node.js.

## Testes nesta entrega

- `node scripts/validacao-estatica.mjs` — verificação sintática de 105 arquivos TS/TSX e equivalência textual de esquema SQLite/PostgreSQL: passou.
- `node scripts/testes-sem-dependencias.mjs` — 23 testes unitários de cálculo/agregação: passaram.
- Instalação npm, `next build`, `prisma generate`, `prisma validate`, testes de fluxo real e revisão de layout renderizado: **não executados com sucesso** neste ambiente. **Não considerar homologado nem aprovado para produção**.

## Notas de escopo

Esta é a primeira implantação do design (layout global, Dashboard e biblioteca visual transversal). Os formulários complexos dos módulos dos Pacotes 01–04 continuam funcionais no código e herdaram o design-base, mas uma revisão visual minuciosa tela a tela ainda deve ser realizada após a homologação do build em ambiente com dependências instaladas.

O gráfico consulta os títulos liquidados dos últimos seis meses; para bases de alta volumetria, a agregação deve evoluir para consultas/visões otimizadas no PostgreSQL, com atenção a índices e paginação.
