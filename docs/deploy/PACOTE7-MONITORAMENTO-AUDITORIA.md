# Pacote 7 — Monitoramento e auditoria

Implementação de 24/10/2026, ainda sem implantação em produção. Os arquivos e correções dos pacotes anteriores permanecem incluídos no artefato completo.

## Correlação e logs

Todas as operações HTTP implementadas em `src/app/api` passam por `withMonitoring`. Cada execução recebe UUID v4 gerado pelo servidor e devolvido em `X-Request-ID`; valores fornecidos pelo cliente são ignorados. O contexto assíncrono isola requisições concorrentes. Os registros `AuditLog.create` efetuados pelo cliente Prisma compartilhado, inclusive em transações interativas, recebem esse identificador. O campo é opcional: registros anteriores permanecem sem referência e não são reescritos.

A tela de auditoria permite filtrar por referência e inspecioná-la; o CSV também a inclui. Erros de servidor exibidos pelo cliente financeiro apresentam a referência para suporte. O log JSON de conclusão HTTP contém data UTC, evento, referência, template estático da rota, método, status e duração. Não inclui segmentos reais de IDs, query string, corpo, cookies, Authorization, e-mail, valores financeiros, SQL, mensagem da exceção ou stack. Erros inesperados são convertidos em resposta genérica; os erros de regra já tratados preservam seus códigos HTTP.

O Prisma compartilhado deixa de registrar erros brutos. O worker usa o mesmo formato seguro e contexto próprio, sem imprimir payloads ou lista de trabalhos. Esses controles cobrem os registros produzidos pelo código modificado, não os logs de proxy, plataforma, dependências, processos de bootstrap ou ferramentas de administração. Configure também a coleta e a retenção desses serviços. Páginas fora das APIs, métodos HTTP não implementados e falhas anteriores à entrada no handler não recebem esta correlação.

## Indicadores e painel

O painel fica junto da auditoria avançada e é restrito ao Administrador. O Financeiro Interno e o Produtor recebem 403 em `/api/sistema/monitoramento`. A consulta não cria nem envia notificações, mostra as 20 entregas mais recentes e separa sinais ativos, verificações desativadas, pendências de envio e tentativas esgotadas. A data da última rotina é distinta da consulta atual; ausência de execução nos últimos 10 minutos não aparece como verificação recente.

| Código | Condição |
|---|---|
| `INTEGRATION_DEAD` | Integração com tentativas esgotadas |
| `INTEGRATION_OVERDUE` | PENDING/RETRY com próxima tentativa atrasada além do limite |
| `INTEGRATION_EXPIRED_LEASE` | PROCESSING com prazo de posse expirado |
| `ACCOUNTING_ERROR` | Fato contábil em ERROR |
| `ACCOUNTING_OVERDUE` | Fato PENDING criado há mais tempo que o limite |
| `WORKER_STALE` | Quando exigido: falta ou atraso do registro de execução do worker |
| `BACKUP_STALE` | Quando exigido: falta ou atraso do registro de cópia externa verificada |

O worker registra atividade depois de concluir uma execução, inclusive quando não havia trabalhos. Isso confirma que a rotina rodou, não que toda a fila está saudável; os demais sinais verificam a fila. O backup registra atividade depois de autenticar a cópia externa e antes da retenção local. Esse registro não comprova um ensaio de restauração nem a permanência futura do arquivo no armazenamento. A indisponibilidade posterior do destino precisa de verificação própria.

## Rotinas e configuração

Use `.env.monitor.example` como referência. O arquivo de exemplo não é carregado automaticamente: configure `.env` ou o gerenciador de segredos do host, com a conexão correta do ambiente.

```text
npm run monitor:check
npm run monitor:dispatch
```

O verificador coleta sinais e, em transação, grava mudanças OPEN/RESOLVED na caixa de saída. Um sinal que continua ativo não gera um novo aviso a cada execução; mudanças de contagem também não geram lembretes. Ao normalizar e voltar a falhar, um novo incidente gera novo aviso. O registro do estado e o aviso são gravados juntos. Há proteção contra verificadores concorrentes e repetição limitada em conflito serializável. O código de saída do verificador é 0 sem sinal ativo, 2 quando há atenção e 1 em falha de execução. O despachante retorna 1 em falha de envio/configuração e 0 quando o lote conclui; sem trabalhos, retorna 0. A existência de notificações DEAD antigas deve ser acompanhada no painel.

| Variável | Padrão e uso |
|---|---|
| `MONITOR_QUEUE_MINUTES` | 30; inteiro 1–10080 |
| `MONITOR_ACCOUNTING_MINUTES` | 1440; inteiro 1–43200 |
| `MONITOR_WORKER_MINUTES` | 15; inteiro 1–10080 |
| `MONITOR_BACKUP_HOURS` | 26; inteiro 1–8760 |
| `MONITOR_WORKER_REQUIRED` | `0`; usar `1` depois de configurar a rotina do worker |
| `MONITOR_BACKUP_REQUIRED` | `0`; usar `1` depois de configurar o backup externo |
| `MONITOR_WEBHOOK_URL` | Endpoint HTTPS, sem credenciais, query string ou fragmento |
| `MONITOR_WEBHOOK_TOKEN` | Token de 24–500 caracteres sem espaços; enviado como Bearer |
| `MONITOR_ENVIRONMENT` | `money`; nome de 1–40 letras, números, `_` ou `-` |

Nenhum serviço de mensagens foi provisionado ou contatado nesta entrega. É necessário um receptor HTTPS compatível; URLs nativas de Slack/Discord/Teams podem exigir um adaptador de contrato. URL e token só vêm do ambiente do servidor e nunca da requisição do usuário. O despachante não segue redirecionamentos e limita cada tentativa a cinco segundos.

Sugestão inicial: agendar verificador e despachante a cada minuto no host, como tarefas independentes, com logs e código de saída observados. Não foi criado agendamento nesta entrega. Dimensione a frequência e o lote para o volume; cada despacho seleciona no máximo dez notificações, e notificações bloqueadas pela ordem podem exigir outra execução. Não execute esses comandos dentro de um processo de produção com cliente Prisma de outro provider.

## Entrega e novas tentativas

`OperationalNotification` mantém PENDING/SENDING/SENT/DEAD, tentativas, próxima execução e posse temporária. O despachante adquire posse por comparação de estado, tentativa e token, sem manter uma transação aberta durante a chamada HTTP. Uma posse expira em 60 segundos. Falhas recebem espera progressiva de 1, 2, 4 e 8 minutos; a quinta tentativa encerra em DEAD. Tentativas interrompidas também consomem o limite e podem ser retomadas depois da expiração. Uma normalização aguarda notificações anteriores pendentes do mesmo sinal; uma notificação DEAD anterior não bloqueia as posteriores.

O envio é **pelo menos uma vez**: se o receptor processar a mensagem e a confirmação se perder, o mesmo aviso poderá ser enviado de novo. O receptor deve deduplicar pelo cabeçalho `Idempotency-Key` e pelo campo `id`, ambos estáveis em novas tentativas e reenfileiramentos. Não há promessa de entrega única por rede. O receptor deve autenticar o token e devolver 2xx somente depois de aceitar o evento de forma durável. O corpo tem este contrato:

```json
{"version":1,"id":"identificador-da-notificacao","environment":"money","signal":"BACKUP_STALE","transition":"OPEN","count":1,"createdAt":"2026-10-24T12:00:00.000Z"}
```

O corpo não contém pessoas, valores financeiros ou payload de integração. Depois de corrigir o canal, o Administrador pode reenfileirar uma entrega DEAD no painel. A ação é auditada e preserva o identificador idempotente. Não há edição ou exclusão de auditoria por esta API.

## Implantação, migração e retorno

A migração `202610240001_operational_monitoring` adiciona `AuditLog.requestId`, seu índice e `OperationalNotification`, com índices de seleção da fila. Há paridade SQLite/PostgreSQL; são agora 40 modelos. Execute a migração em homologação antes do código novo. Para PostgreSQL, aplique `npm run db:deploy:pg` no ambiente autorizado e gere o cliente do provider antes do build, conforme o fluxo dos pacotes anteriores. Não use `db push` no banco remoto de produção. Registros antigos recebem referência nula.

Os backups novos incluem a caixa de saída e os estados em `FinanceSetting`. Depois de restaurar, mantenha o despachante desligado até conferir avisos já aceitos pelo receptor após o ponto de recuperação. A chave idempotente preservada permite ao receptor evitar repetições. Backups cifrados do pacote 6 têm impressão de schema anterior: restaure com a versão correspondente e aplique a migração em seguida. Não remova a caixa de saída para forçar compatibilidade.

Para retorno operacional, suspenda verificador/despachante e reverta a aplicação, preservando tabelas e colunas adicionadas. Não apague o histórico de avisos ou auditoria. A manutenção e a retenção desses registros precisam de política de armazenamento; este pacote não os exclui automaticamente.

## Limites e ativação pendente

Monitoramento que depende do mesmo banco não consegue persistir um alerta enquanto ele está indisponível. O processo retorna erro seguro, mas é necessário um monitor externo do agendador, da disponibilidade da aplicação/banco e da coleta de logs. Configure regras no coletor para taxas de HTTP 5xx, latência e ausência de eventos de rotina; o pacote não calcula essas séries históricas nem envia alertas HTTP a partir da memória do processo. Falhas apenas entre duas verificações podem não ser observadas como incidente.

Ainda faltam receptor real, token, agendamento, coleta/retenção de logs, teste do canal e validação visual completa em preview. Testes desta implementação usam dados sintéticos e receptor simulado; nenhuma mensagem foi enviada a pessoas ou canais externos.

## Validação concluída

Tipos, build e validação estática aprovados: 197 arquivos TS/TSX, 40 modelos e 17 enums. Os 90 testes locais incluem concorrência de contexto, ausência de segredos nos logs, correlação real HTTP/transação/auditoria, restrição de acesso ao painel, reenfileiramento administrativo auditado, retenção/backup e preservação de auditoria anterior à migração. A suíte HTTP separada aprovou 81 grupos em SQLite.

O ensaio PostgreSQL 18 executou sete migrações em schemas sintéticos, verificou atualização de estrutura existente, dez grupos de regressão e restauração dos 40 modelos. O novo grupo verifica dois avaliadores e dois despachantes concorrentes, abertura/normalização sem avisos duplicados e receptor simulado. Recorte executado: banco de dados; a suíte HTTP foi validada localmente com SQLite. A ramificação temporária foi excluída e sua credencial local removida. O banco de produção não recebeu alterações.
