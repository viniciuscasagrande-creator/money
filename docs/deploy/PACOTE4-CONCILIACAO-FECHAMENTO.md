# Pacote 4 — Conciliação e fechamento financeiro

Entrega de 21/10/2026, acumulada sobre os pacotes 1, 2 e 3. Implementação local; nenhuma competência de produção foi fechada.

## Conciliação parcial

A página **Conciliação** mantém o vínculo integral existente e acrescenta o painel de conciliação parcial e fechamento mensal. Cada alocação informa extrato, lançamento do razão e valor em centavos. Uma linha pode ser vinculada a vários lançamentos e um lançamento pode receber várias linhas, respeitando o valor restante de ambos. Conta e direção devem coincidir. Saldos de abertura não são movimentos sujeitos a pareamento.

As alocações não criam títulos, baixas nem lançamentos bancários. O extrato passa a `MATCHED` somente quando todo o valor estiver alocado; enquanto isso, permanece pendente. As consultas de extrato e razão informam `remainingCents`. O método integral anterior exige valores idênticos e ausência de alocações anteriores. Use **Atualizar competência** para buscar alterações feitas pelo pareamento integral ou por outra sessão.

O novo endpoint exige um `requestKey` UUID. Repetir a mesma operação com a mesma chave confirma o registro anterior; reutilizar a chave para outro valor ou vínculo gera conflito. A tela preserva a chave ao repetir uma requisição com o mesmo conteúdo após erro. Os limites de conciliação são protegidos pela trava da conta e pela transação serializável; conflito concorrente retorna 409 e exige atualização dos dados.

## Divergências

O Financeiro ou Administrador pode abrir uma divergência para o extrato selecionado e registrar sua resolução com justificativa. Uma linha só admite uma divergência aberta por vez. Enquanto houver divergência aberta, novas alocações dessa linha e o fechamento de sua competência ficam bloqueados. Resolver a divergência não cria movimentação nem altera valores; o histórico e os responsáveis permanecem registrados.

## Fechamento mensal

O fechamento é por **conta bancária e mês em UTC**, separado do fechamento contábil já existente. Apenas Administrador pode fechar, depois do fim do mês. São exigidos:

- Todos os extratos do mês integralmente alocados.
- Todos os lançamentos do mês conciliados, exceto abertura.
- Nenhuma divergência aberta nos extratos do mês.
- Saldo atual da conta igual ao total acumulado do razão, para detectar inconsistências.
- Saldo final informado pelo operador igual ao saldo do razão no fim do mês.

O saldo informado é uma conferência manual com o banco; não há consulta bancária externa. O fechamento registra saldo inicial, créditos, débitos, saldo final, saldo declarado, responsável e data. Ele não modifica o saldo bancário.

Fechar um mês bloqueia importações de extrato e alterações de conciliação com data anterior ao primeiro dia do mês seguinte, inclusive meses anteriores ainda sem registro individual de fechamento. Não se pode fechar um mês anterior ao último fechamento da conta. Esse corte cumulativo evita que dados retroativos alterem os saldos de uma competência já encerrada.

Importações, alocações, divergências, liquidações de títulos, baixas de repasses e fechamento usam a mesma trava da conta antes da verificação do corte. Movimentos de meses seguintes continuam permitidos. Não foi implementada reabertura nem exclusão de alocações: correções depois do fechamento exigem um fluxo próprio de ajuste, ainda fora deste pacote.

## APIs e implantação

`GET /api/controle/fechamento?bankAccountId=...&month=AAAA-MM` retorna resumo, fechamento e até 100 linhas de cada tipo para os seletores. O resumo e a validação de fechamento consideram a competência inteira. O painel filtra por mês; vínculos entre meses diferentes são aceitos pela API quando ambos estiverem abertos.

`POST /api/controle/fechamento` recebe `action: ALLOCATE`, `ISSUE`, `RESOLVE` ou `CLOSE`. Produtores são bloqueados em todas essas operações. O endpoint integral `/api/controle/conciliar` permanece disponível.

A migração aditiva `202610210002_financial_close` cria três modelos, totalizando **39**, e converte as conciliações integrais anteriores em alocações sem alterar seus vínculos ou valores. Há migrações equivalentes para SQLite e PostgreSQL. Em PostgreSQL, use `npm run db:deploy:pg`, com backup restaurável e validação prévia em preview. Não use `db push` no lugar da migração em uma base existente, pois ele não executa a conversão de dados históricos. A restauração de um snapshot anterior a este pacote também exige conferir e migrar os vínculos antigos antes de operar a conciliação.

Após utilizar fechamentos, o retorno puro ao código anterior removeria as verificações do corte. Em caso de falha, interrompa gravações e preserve as travas enquanto corrige a versão; não exclua fechamentos ou alocações para contornar uma divergência.

O ZIP desta entrega contém os quatro pacotes. O patch desta etapa parte da árvore Git `aa0a262109c98925882ee39d27aa909ec0da63ed`, correspondente à entrega acumulada dos pacotes 1 a 3.

## Verificação

Build final e checagem de tipos aprovados; 80 testes aprovados e 81 grupos HTTP aprovados em SQLite. As verificações estáticas de sintaxe, rotas e paridade dos schemas passaram, e o schema PostgreSQL passou em `prisma validate`.

No ensaio PostgreSQL, as cinco migrações foram aprovadas com preservação de uma conciliação integral anterior. O recorte `--database-only` aprovou oito grupos de regressão e a restauração integral dos 39 modelos. A branch temporária foi removida; apenas a branch de produção permaneceu no projeto. A suíte HTTP PostgreSQL completa não foi repetida nesta etapa.

Os testes exercitam alocações em ambas as direções de agrupamento, limites concorrentes, reenvio idempotente, excesso de valor, direção incompatível, abertura e resolução de divergência, permissões, saldo declarado divergente, inconsistência entre banco e razão, fechamento concorrente, bloqueio retroativo e mês ainda não encerrado. A migração é ensaiada com uma conciliação integral antiga. Snapshot e restauração comparam os campos dos 39 modelos.

Ativação GitHub/Vercel, validação visual completa e uso com extratos bancários reais permanecem pendentes.
