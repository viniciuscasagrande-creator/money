# Pacote 3 — Integrações resilientes

Entrega de 21/10/2026, acumulada sobre os pacotes 1 e 2. Código local; produção e agendamento externo não foram alterados.

## Funcionalidades

O formulário de Integração oferece **Processar pela fila**. Sem essa opção, a importação síncrona permanece compatível. Sistemas externos podem enviar o mesmo conteúdo para `POST /api/integracao/ingressos` com `Prefer: respond-async`. A autenticação permanece por sessão interna ou pela chave de integração e operador já configurados. A resposta assíncrona é HTTP 202 com `job.id` e estado; recebimento na fila não significa título criado.

O modelo `IntegrationJob` guarda referência única por provedor, conteúdo normalizado, assinatura, operador, tentativas e estado. A fila usa `PENDING`, `PROCESSING`, `RETRY`, `SUCCEEDED` e `DEAD`. O painel interno exibe esses estados, erros resumidos e próxima tentativa, com paginação de 20 itens. Produtores não têm acesso. As APIs de acompanhamento não retornam conteúdo bruto nem tokens de reserva.

A assinatura canônica não depende da presença de campos opcionais nulos. As assinaturas antigas de `IntegrationDelivery` continuam reconhecidas. Uma referência repetida com outro conteúdo gera conflito; uma referência concluída retorna o título original, inclusive quando a primeira importação foi síncrona.

## Processamento

Cada processador disputa uma reserva de 120 segundos por atualização condicional. O worker confirma que ainda possui essa reserva antes de escrever valores financeiros. O título, a identidade da entrega, a auditoria e a conclusão do item são gravados juntos, em transação serializável. Se o processo interromper antes de confirmar a transação, a reserva vencida pode ser retomada. Um processador antigo não grava após perder sua reserva.

Falhas transitórias recebem até cinco tentativas por ciclo, com espera de 30, 60, 120 e 240 segundos antes das repetições. O horário apenas torna o item elegível: a próxima execução do worker realiza o processamento. Falhas de regra de negócio, conteúdo inválido ou operador desativado encerram o ciclo imediatamente. Erros de infraestrutura não são armazenados como mensagens brutas.

O Administrador pode reabrir uma falha encerrada, informando motivo, depois de corrigir sua causa. O operador original é preservado e precisa continuar ativo e autorizado. A reabertura zera o contador do ciclo, preserva o total de tentativas e deixa auditoria. Não há edição de conteúdo nem troca de referência por essa ação.

## Implantação

1. Faça backup restaurável e valide primeiro em preview.
2. Aplique a migração aditiva `202610210001_integration_queue`, presente nas duas árvores Prisma. O projeto passa a ter 36 modelos. Em PostgreSQL, use `npm run db:deploy:pg`; no SQLite com baseline já registrado, `prisma migrate deploy`. Não use reset em uma base existente.
3. Publique a aplicação e gere o Prisma Client do provedor correto. O workflow do pacote 1 gera o cliente e aplica as migrações na entrega configurada.
4. Configure um agendador ou serviço de execução para chamar, com acesso ao mesmo banco:

   ```text
   npm run integration:work -- --limit=10
   ```

   O comando executa um lote e encerra; o limite permitido é 1 a 20. Não existe processo residente nem agendamento ativado por este pacote. Em infraestrutura que permita jobs, programe uma execução por minuto. O worker deve usar somente as variáveis de conexão necessárias, sem expor a conexão nos logs.
5. Para operação manual, o painel oferece **Processar próximo item**, restrito a perfis internos. Cada chamada processa no máximo um item. A reabertura de falhas é exclusiva do Administrador.

Quando o banco estiver indisponível, a própria gravação da falha pode não ocorrer; a reserva expirada permite recuperação na execução seguinte. Monitore a idade dos itens pendentes e o acúmulo de falhas. Alertas externos são escopo do pacote 7.

## Testes e retorno

Validação concluída em 21/10/2026: build e tipos aprovados, 79 testes aprovados e 81 grupos HTTP aprovados em SQLite. No PostgreSQL Neon, o recorte de banco aprovou as quatro migrações com preservação dos registros anteriores, sete grupos de regressão (incluindo a fila) e snapshot/restauração dos 36 modelos. O recorte desta etapa foi `--database-only`; a suíte HTTP PostgreSQL completa não foi repetida nesta entrega. As definições SQLite/PostgreSQL também passaram na inspeção de paridade e o schema PostgreSQL passou em `prisma validate`.

As regressões cobrem reenvios concorrentes, disputa de reserva, retomada de item interrompido, exclusão do processador antigo, cinco falhas transitórias, espera entre tentativas, reabertura, regras de evento, operador inativo, conteúdo corrompido e auditoria. Os testes HTTP cobrem permissões, aceite assíncrono, processamento e ausência de conteúdo sensível nas respostas. Snapshot e restauração comparam todos os campos dos 36 modelos, incluindo item aguardando processamento.

Para retornar ao código anterior, primeiro interrompa o worker e os produtores de mensagens assíncronas; conclua ou registre os itens pendentes antes da troca. A migração é aditiva e a tabela pode ser mantida. Não apague a tabela para reprocessar: isso perde o histórico. A unicidade das entregas continua protegida por `IntegrationDelivery`.

O patch desta etapa parte da árvore Git `a4d966608871a67be91cedd2aaf990497514df4e`, correspondente ao ZIP acumulado dos pacotes 1 e 2. O novo ZIP inclui os três pacotes. Validação visual completa, ativação GitHub/Vercel e execução do agendador externo permanecem pendentes.
