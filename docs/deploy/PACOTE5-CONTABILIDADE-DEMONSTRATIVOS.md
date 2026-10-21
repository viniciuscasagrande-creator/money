# Pacote 5 — Contabilidade e demonstrativos

Entrega de 21/10/2026, acumulada sobre os pacotes 1 a 4. Implementação local; nenhuma regra, conta ou contabilização foi aplicada à produção.

## Regras e processamento

Na aba **Regras Versionadas**, o Administrador cria uma versão inativa com tipo do fato, contas padrão e vigência. A ativação é explícita e substitui a regra ativa daquele tipo. Ativações concorrentes são serializadas; um conflito exige atualização e nova tentativa. Cadastro e auditoria agora são confirmados na mesma transação.

Na aba **Eventos de Negócio**, selecione um fato pendente, sua regra ativa e as partidas. Cada linha informa conta, débito, crédito e, se necessário, evento de destino. A prévia confere contas analíticas ativas, vigência, competência aberta, balanceamento, valor do fato e ligação com a operação original. A prévia não grava um lançamento nem altera dinheiro.

Vendas e transferências integradas exigem partidas explícitas. As contas e a distribuição econômica precisam de revisão contábil: não foi criada uma política fiscal ou classificação automática dos valores. Transferências internas vinculadas à operação financeira só admitem contas do passivo, com débito na origem e crédito no destino; a reversão usa o sentido inverso. Não podem gerar receita, despesa ou caixa e podem usar a mesma conta com centros de evento diferentes.

O Financeiro pode consultar prévias; a confirmação exige Administrador. A tela envia a assinatura da prévia para detectar alterações da regra, contas, fato ou partidas antes da confirmação. Chamadas anteriores à API sem assinatura continuam compatíveis, respeitando as validações atuais. Reenvio de um fato contabilizado retorna o diário original; outra regra não substitui uma contabilização existente.

As partidas, o estado do fato, a cópia da regra e a auditoria são gravados juntos. Esse processamento não escreve no saldo bancário nem no razão operacional. O fechamento contábil confere eventos pendentes ou em erro, existência dos diários, datas, balanceamento e correspondência de valores por lançamento. Emissão e fechamento usam uma trava comum da competência, inclusive para fatos que começaram antes da criação do período. Na aba **Períodos Contábeis**, o Administrador acessa a conferência e confirma o fechamento; a reabertura não está disponível.

## Rastreabilidade

O diário oferece **Consultar** para abrir origem e partidas. Os novos lançamentos guardam identificador e cópia da regra, contas utilizadas, distribuição, metadados do fato e responsável. A tela usa os nomes de conta dessa cópia histórica. Mudanças posteriores de cadastro não reescrevem a cópia.

São reconhecidos vínculos automáticos com venda, título liquidado, repasse, retenção e transferência, a partir de tipos e chaves reservadas. Valor, evento e produtor são conferidos contra a operação, quando esses campos existem na origem. Partidas integradas mantêm o evento da operação; a distribuição entre origem e destino é reservada às transferências. Registros manuais são identificados como manuais; um identificador informado não é tratado como prova de vínculo operacional. O endpoint manual não aceita prefixos reservados às integrações e rejeita reutilização da mesma referência com outro conteúdo.

Lançamentos anteriores ao pacote permanecem intactos, com campos históricos nulos. A tela avisa quando não existe cópia histórica; não foi inventada uma regra ou um responsável para o legado.

## Demonstrativos

- **Balancete:** saldo inicial acumulado, débitos e créditos do mês e saldo final devedor. `saldoDevedorCents` passa a representar o fechamento; `movimentoDevedorCents` mantém explícito o movimento do mês. As verificações de saldo inicial, movimento e fechamento são separadas.
- **Passivos:** agrupamento por conta, evento e produtor, com saldo inicial credor, movimento e saldo final. `saldoCredorCents` é acumulado até o fim do mês, e não apenas a variação mensal.
- **DRE:** usa exclusivamente a natureza cadastrada (`REVENUE`, `DEDUCTION`, `EXPENSE`) para o movimento do mês. Prefixos parecidos não transformam ativo em receita nem despesa em dedução.
- **Volumes maiores:** totais usam agregação no banco, sem truncamento em dez mil partidas. O diário possui paginação de cem lançamentos. A consulta de contas, regras e fatos conserva os limites anteriores de 500, 200 e 100 registros, respectivamente; o seletor de processamento informa o limite de eventos recentes.
- **Valores:** a formatação de dinheiro da tela evita conversão de centavos para ponto flutuante.

O botão do plano padrão permanece uma ação explícita. Abrir a consulta não cria contas. O cadastro padrão agora preserva a natureza `DEDUCTION`. A migração corrige somente as duas contas conhecidas do plano padrão que foram gravadas como `EXPENSE`, comparando código e nome exatos; classificações personalizadas precisam de revisão própria. Os relatórios usam a natureza atual do cadastro; a trilha preserva a classificação capturada no lançamento.

## Implantação e APIs

A migração aditiva `202610210003_accounting_trace` acrescenta `ruleId`, `ruleSnapshotJson` e `postedById` ao diário e corrige as contas padrão mencionadas. O projeto continua com **39 modelos** e passa a ter seis migrações versionadas em cada provedor. Faça backup restaurável e valide em preview; em PostgreSQL, aplique `npm run db:deploy:pg`. Não substitua migrações por `db push` em uma base existente.

- `POST /api/contabilidade/previa`: mesmo corpo de processamento, sem gravar diário.
- `POST /api/contabilidade/processar`: aceita `previewHash` e evento opcional em cada partida.
- `GET /api/contabilidade/trilha?journalId=...`: origem, diário, cópia histórica e responsável.
- `GET /api/contabilidade?visao=razao&periodo=AAAA-MM&page=1`: diário paginado, com total.
- Balancete, DRE e passivos continuam nas URLs anteriores, com as bases de saldo descritas acima.

Produtores não têm acesso a esses endpoints. Revisão fiscal das contas, alíquotas e fatos a contabilizar continua necessária antes do uso real. Este pacote não inclui estorno persistente, reabertura de competência, geração de obrigações fiscais nem cálculo automático de tributos; parâmetros cadastrados não significam provisões lançadas.

Para retornar ao código anterior, preserve as colunas novas e os registros já contabilizados. A versão anterior voltaria a apresentar as limitações dos demonstrativos; não reverta tipos de conta ou exclua lançamentos para contornar divergências. As proteções de períodos financeiros do pacote 4 devem permanecer ativas.

O ZIP é acumulado. O patch desta etapa parte da árvore Git `f3cb1b445131911b807b40080b68506c22d506cb`, correspondente à entrega dos pacotes 1 a 4. Publicação, ativação GitHub/Vercel e validação visual completa permanecem pendentes.

## Ensaios

Validação final: build e tipos aprovados; 81 testes e 81 grupos HTTP aprovados em SQLite. No PostgreSQL Neon, o recorte `--database-only` aprovou as seis migrações, nove grupos de regressão e snapshot/restauração dos 39 modelos, incluindo a confirmação final da trava de competência. A branch temporária foi removida. A suíte HTTP PostgreSQL completa não foi repetida nesta entrega. As verificações estáticas de sintaxe, rotas e paridade e o `prisma validate` do schema PostgreSQL passaram.

As regressões cobrem prévia sem gravação, alteração de cadastro entre prévia e confirmação, permissões, referência conflitante, emissão de origem real, processamento concorrente sem duplicação, preservação da cópia histórica, passivo entre meses, natureza das contas, relatório com 10.002 partidas e fechamento que rejeita fatos em erro ou lançamentos desbalanceados. As alocações do ensaio HTTP são mapeamentos técnicos de uma base sintética, não uma política contábil aprovada para produção.
