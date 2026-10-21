# Etapa 1 — PostgreSQL e automação de entrega

Data: 20/10/2026. Base preservada: `main` em `56d2eb8a58a5cc9b6c298b5e0d56c18e39034bd1`, incluindo as políticas da versão 5.3, os 35 modelos e as três migrações existentes.

## Entrega

- Validação automática de tipos, build, regressões financeiras e HTTP em SQLite e PostgreSQL 18.
- Ensaio de atualização com dados anteriores às migrações, concorrência, idempotência e restauração de todos os modelos.
- Workflow manual de publicação Vercel, com preview como padrão, confirmação de produção, verificação do destino das migrações e compilação anterior às alterações no banco.
- Correção da revalidação de repasses: transferências já incluídas nos compromissos deixaram de ser descontadas novamente. A posição financeira calculada na transação é reutilizada para reduzir consultas repetidas.
- Tratamento de conflito serializável como HTTP 409, sem expor detalhes internos.

## Evidência local

- Checagem de tipos e build aprovados.
- 76 testes aprovados, incluindo regressão da política 5.3 com transferências próximas ao limite.
- Estrutura das duas definições YAML validada.
- PostgreSQL: atualização pelas três migrações preservou reservas e transferências anteriores.
- PostgreSQL: seis cenários aprovados, incluindo cinco reenvios concorrentes da integração, retenções paralelas e comparação integral de snapshot/restauração dos 35 modelos.
- PostgreSQL: 81 grupos HTTP aprovados após a correção da revalidação. O ensaio final HTTP foi executado separadamente das etapas anteriores de migração e concorrência.

Os ensaios PostgreSQL usam schemas descartáveis de uma branch temporária Neon. A produção não recebeu migrações nem publicação. A modalidade schema-only foi recusada pelo Neon devido à role legada `anonymous`; não foi alterada a configuração de produção para contornar essa restrição.

## Ativação pendente

O conector GitHub recusou a criação da branch com HTTP 403 e a autenticação do CLI local estava inválida. Portanto, os workflows estão preparados no código, mas não foram ativados no GitHub e não houve criação de PR. A execução completa do workflow no runner Linux e a publicação Vercel permanecem pendentes.

Para ativar, aplique o patch sobre a base indicada, envie a branch e configure os ambientes, secrets e verificações obrigatórias conforme [o guia de implantação](CI-CD-E-HOMOLOGACAO-POSTGRESQL.md). O pacote não contém as credenciais temporárias usadas no ensaio. A navegação visual completa da aplicação publicada não foi validada nesta etapa.
