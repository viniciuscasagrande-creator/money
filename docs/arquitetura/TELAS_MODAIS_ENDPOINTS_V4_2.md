# SOUL Financeiro — Implementação de telas, modais e endpoints (v4.2)

## Resumo da entrega

Esta atualização evolui o ZIP **ERP Financeiro Fintech Premium v4.1**, integrando as quatro etapas anteriores na **mesma aplicação Next.js/React/TypeScript + Tailwind CSS + shadcn/ui + Prisma**. **Não** importa dados do Conta Azul, modifica schemas Prisma ou realiza transferências bancárias reais.

### Novo ponto de entrada

- Menu lateral → **Central de módulos** (`/modulos`), com busca e seleção de Pacotes 01–04.
- Consulta `GET /api/sistema/modulos`, que devolve somente funcionalidades autorizadas para o usuário autenticado; `Cache-Control: private, no-store`.
- Cada cartão navega para a tela real existente; **nenhum** botão de demonstração foi adicionado.
- Catálogo central: `src/lib/financeiro/constants.ts` (labels, estados, 20 módulos, endpoints, filtro de perfil, tipos de detalhes).

### Inventário de módulos

| Pacote | Telas e rotas |
|---|---|
| **01 — Fundação** | Dashboard `/dashboard`, Recebimentos `/recebimentos`, Contas a pagar `/pagamentos`, Tesouraria `/contas`, Saldos `/saldos`, Cadastros `/cadastros` |
| **02 — Operações** | Repasses `/repasses`, Gateways/MDR `/gateways`, Taxas e divisão `/taxas`, Vendas `/vendas` |
| **03 — Controle** | Conciliação `/conciliacao`, Riscos `/ocorrencias`, Orçamentos `/planejamento`, Contratos `/contratos`, Pré-exportação `/contabilidade` |
| **04 — Inteligência e governança** | Relatórios `/relatorios`, Alertas `/alertas`, Permissões/Alçadas `/governanca`, Auditoria `/auditoria`, Configurações `/configuracoes` |

### Modais implementados nesta atualização

| Tela | Ação de interface | Endpoint conectado |
|---|---|---|
| Recebimentos / Pagamentos | Consulta individual; cadastro e liquidação existentes preservados | `GET /api/registros/titulo/:id`; POST existentes |
| Repasses / Antecipações | Nova solicitação, ações de aprovar/reprovar/aceite/assinatura/baixa, detalhe individual | `GET /api/registros/repasse/:id`; `POST /api/repasses`; `POST /api/repasses/:id/acoes` |
| Vendas | Modal de nova venda e memória de cálculo | `GET /api/registros/venda/:id`; `POST /api/financeiro/vendas` |
| Gateways / Bandeiras | Modais separados de adquirente, modalidade e MDR | `POST /api/financeiro/gateways`, `/bandeiras`, `/mdr` |
| Taxas por evento | Modal de configuração/edição (interno) | `POST /api/financeiro/taxas` |
| Conciliação | Registrar extrato em modal e consultar detalhe | `POST /api/controle/extratos`; `GET /api/registros/extrato/:id` |
| Estornos / Chargebacks | Nova ocorrência, confirmação explícita de decisão e detalhe | `POST /api/controle/riscos`, `/risco-decisao`; `GET /api/registros/ocorrencia/:id` |
| Planejamento | Nova previsão em modal; detalhe | `POST /api/controle/orcamentos`; `GET /api/registros/orcamento/:id` |
| Contratos | Novo contrato em modal; detalhe | `POST /api/controle/contratos`; `GET /api/registros/contrato/:id` |
| Governança | Confirmação de mudança de permissão e de alçada antes de envio | `POST /api/governanca/usuarios`; `POST /api/governanca/alcadas` |

A consulta individual atende sete tipos de registros no **mesmo endpoint dinâmico** de Next.js:

`GET /api/registros/[tipo]/[id]` (`titulo`, `repasse`, `venda`, `ocorrencia`, `contrato`, `orcamento`, `extrato`). O backend exige login. Somente `titulo` e `repasse` admitem perfil Produtor e possuem filtro por produtor/vínculo. Todos os outros tipos são exclusivos do Financeiro Interno. O retorno é um conjunto padronizado de campos para exibição, sem operações de escrita.

### Componentes reutilizáveis

- `src/components/financeiro/record-detail-modal.tsx`: consulta detalhada segura com tratamento de carregamento/erro e apresentação em pt-BR.
- `src/components/financeiro/list-search.tsx`: busca local por registros **já carregados**, contagem e limpeza do filtro (não pesquisa toda a base).
- `src/components/financeiro/module-center.tsx`: cards e filtro por pacotes para navegação.
- `src/components/ui/dialog.tsx`: atualização da aparência dos diálogos para a linguagem Fintech Premium.
- `src/lib/financeiro/constants.ts`: fonte comum de rótulos, perfis e rotas dos módulos.

### Segurança preservada

1. O catálogo visual **não substitui** a autorização de cada rota de API.
2. Vendas, MDR, taxas privadas, conciliações, contratos e informações bancárias internas não ficam disponíveis ao Produtor.
3. O saldo de repasse permanece calculado pelo núcleo financeiro já existente; consultas detalhadas não o alteram.
4. As decisões financeiras exigem o fluxo de aprovação existente; modais de confirmação não representam assinatura digital certificada.
5. Nenhum endpoint novo de escrita financeira foi criado; os modais reutilizam as APIs POST auditáveis e com validações anteriores.
6. Não há pagamentos reais, integração bancária executora, envio automático de dinheiro, importação de dados de terceiros ou valores fictícios.

### Instalação no VS Code

Na pasta raiz do projeto (com `package.json`):

```powershell
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:push
npm run bootstrap
npm run dev
```

**Atenção:** os comandos `db:push` acima são somente para um banco **novo e isolado**. Nunca aplique `db:push` contra a produção sem backup e migração revisada. Configure credenciais com base no README original antes de executar o bootstrap. A URL local padrão é `http://localhost:3000`; a Central de Módulos será `/modulos` após o login.

Para PostgreSQL, utilize o schema em `prisma/postgresql/schema.prisma` e os scripts `db:generate:pg` / `db:push:pg` em ambiente de homologação, sem alterar uma base em produção.

### Validação e limites

Executar sem dependências: `npm run test:static`, `npm run test:unit:isolado`, `npm run test:ui:static` (requer TypeScript global para os dois últimos/validação estática).

Após instalar dependências: `npm run db:generate`, `npm run typecheck`, `npm run build`, `npm test` e `powershell -ExecutionPolicy Bypass -File .\scripts\homologacao-local.ps1`.

**Não confundir validação sintática e testes unitários com compilação e homologação integrada:** esta última continua obrigatória antes de publicação, pois instalação de dependências neste ambiente não concluiu. Os serviços existentes também têm limites de paginação nas listagens; a busca local filtra somente o conjunto retornado, não todo o histórico.

### Homologação sugerida por perfil

- Administrador: login, catálogo, cadastros, permissões, alçadas, auditoria.
- Financeiro Interno: criar conta, título, liquidação com saldo, MDR e taxa por evento, venda real, solicitações, aprovação, conciliação, risco, contrato e orçamento. Conferir razão e audit logs após cada mutação.
- Produtor A: apenas eventos e solicitações do A; ver detalhes de seus próprios títulos (exceto título interno ligado a venda) e repasses.
- Produtor B: tentar consultar por API o identificador de um registro do A; resultado esperado: HTTP 404; tentar consultar venda, risco ou taxa interna: HTTP 403.
- Negativos: requisições sem sessão: HTTP 401; valores monetários inválidos/duplicados: erros de validação; simular dupla liquidação/baixa e verificar que não ocorrem duplicidades.
