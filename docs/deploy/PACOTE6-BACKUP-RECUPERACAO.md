# Pacote 6 — Backup e recuperação operacional

Implementação local de 21/10/2026. Não instala agendamento nem acessa o banco publicado. O ZIP original recebido permanece preservado.

## Entrega

`npm run backup` agora produz um snapshot consistente dos 39 modelos em `.moneybak`, comprimido e cifrado com AES-256-GCM. A autenticação protege o conteúdo e o cabeçalho; o manifesto cifrado inclui SHA-256 e a impressão dos campos do schema. Chave errada, adulteração, truncamento, modelo ausente ou schema incompatível bloqueiam a leitura antes de criar o destino de restauração. Cada execução usa IV aleatório e nome exclusivo. O limite atual é 512 MiB por arquivo e por conteúdo descomprimido; o processo trabalha em memória, portanto dimensione o host e reavalie esta solução para volumes grandes.

O arquivo é escrito e sincronizado em `.partial`, validado e publicado por link exclusivo. O destino precisa aceitar hard links no mesmo volume. Uma falha não substitui uma cópia anterior. Arquivos parciais não são considerados backups e não entram na retenção. Podem ser removidos manualmente depois de confirmar que não há execução ativa.

A cópia externa exige diretório absoluto existente, fora do projeto e da pasta local, inclusive após resolver links de diretórios. O arquivo copiado é lido e autenticado antes de anunciar sucesso. Diretório local em outra pasta só simula esse transporte; para recuperação contra perda do host, use volume remoto de fato, com disponibilidade e permissões monitoradas. Não há integração S3/API nem provisionamento de armazenamento nesta entrega.

Após copiar, a retenção local mantém as 14 cópias válidas mais recentes por data do snapshot (configurável, mínimo 2). Apenas arquivos com nome próprio e conteúdo autenticado pela chave atual podem ser apagados. Arquivos inválidos, de outra chave e arquivos alheios são preservados e os inválidos aparecem no plano. Retenção externa é explícita e deve usar conta com permissão de exclusão restrita; mantenha também política de imutabilidade/versões do serviço quando disponível. Autenticação não equivale a ensaio de restauração aprovado.

O ensaio cria um SQLite exclusivo, aplica o schema, restaura todas as tabelas exceto sessões, compara campos, datas, centavos, referências e identificadores e confere cada saldo bancário contra o razão. Não inicia aplicação, workers, webhooks ou integrações. O banco temporário é removido ao final e o relatório sem dados pessoais fica em `backups/rehearsals`. Não promove um banco automaticamente. Regras fiscais, navegação visual e disponibilidade dos serviços externos ficam fora desse ensaio.

## Configuração

Use `.env.backup.example` como referência; o processo carrega `.env`, não carrega esse exemplo automaticamente. Forneça `DATABASE_URL` pelo gerenciador de segredos. Gere `BACKUP_ENCRYPTION_KEY` uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Guarde uma cópia recuperável da chave separada dos arquivos e com acesso restrito. Perder a chave impede a recuperação. Não registre a saída desse comando em logs públicos.

- `BACKUP_ENCRYPTION_KEY`: 64 caracteres hexadecimais, obrigatória.
- `BACKUP_EXTERNAL_DIR`: diretório remoto previamente montado e existente, obrigatório na criação.
- `BACKUP_KEEP`: número de cópias válidas locais, padrão 14, mínimo 2.
- `BACKUP_LOCAL_DIR`: opcional, padrão `backups/operacional`; inclua qualquer caminho alternativo na política de exclusão de publicação e de permissões.

Use o cliente Prisma correspondente ao banco de origem na captura. Em uma instalação de produção PostgreSQL, gere com `npm run db:generate:pg`. Execute os ensaios SQLite em uma instalação separada do mesmo código, com `npm ci` e `npm run db:generate`; não troque o cliente gerado do processo de produção em execução. O snapshot lógico tem impressão de campos independente do provider, mas a migração e retomada no PostgreSQL de produção exigem homologação específica. Este pacote não oferece comando que sobrescreva PostgreSQL remoto.

```text
npm run backup
npm run backup:check -- CAMINHO/arquivo.moneybak
npm run backup:retention
npm run backup:retain
npm run backup:retention -- --external
npm run backup:retain -- --external
npm run backup:rehearse -- CAMINHO/arquivo.moneybak
```

Os comandos de retenção sem `retain` apenas mostram o plano. Em erro, o processo retorna código diferente de zero. Na criação, o erro identifica a fase sem expor credenciais ou registros. Falha de cópia preserva o arquivo local e interrompe a retenção. Não interprete a mera existência de arquivo como sucesso: exija saída `COPIADO_E_VERIFICADO` e, separadamente, relatório de ensaio `APROVADO`.

## Restauração manual isolada

```text
npm run backup:restore -- CAMINHO/arquivo.moneybak prisma/restore-incidente.db --isolated
npm run backup:verify -- CAMINHO/arquivo.moneybak prisma/restore-incidente.db
```

O destino deve ser novo, diretamente dentro de `prisma`, com nome `restore-NOME.db`. Um destino existente é recusado. Sessões são omitidas por padrão: usuários precisarão entrar novamente. `--include-sessions` em ambos os comandos só serve para comparação exata em laboratório isolado e não deve ser usado numa retomada operacional. Dumps JSON antigos exigem `--legacy-json` em ambos os comandos; não recebem garantia criptográfica retroativa e podem exigir migrações. Use a versão de código correspondente ao backup, preservada junto ao artefato de release e identificada pelo commit da implantação.

Se a restauração manual falhar, o arquivo isolado pode permanecer para investigação. Não o reutilize: remova apenas esse destino após conferir o caminho, ou escolha outro nome. O ensaio automático cuida dos seus próprios temporários.

## Ativação e rotina sugerida

Ainda é necessário configurar um destino remoto real, custodiar a chave e cadastrar tarefas no agendador do host. Não foi criado um agendamento nesta entrega. Sugestão inicial a ajustar ao objetivo de perda aceitável: snapshot diário e ensaio semanal da cópia externa mais recente, sempre no ambiente de recuperação separado. Guarde relatórios e registre data do último sucesso. Uma falha ou ausência de execução precisa de alerta pelo canal operacional configurado. Não publique chaves, snapshots nem relatórios contendo dados reais em artifacts do CI.

Antes de promover uma recuperação: suspenda gravações e workers, escolha ponto de recuperação, valide a cópia externa e restaure em ambiente separado. Confira usuários/permissões, bancos/razão, títulos/baixas, fechamentos, reservas, transferências, contabilidade e idempotência. A retomada pode conter jobs pendentes ou leases do instante do snapshot; mantenha workers desligados até conferir efeitos já enviados após esse instante e resolver eventuais divergências com o provedor externo. Só então planeje a troca do banco com backup do destino atual e caminho de retorno. Sessões antigas devem permanecer invalidadas.

## Compatibilidade e retorno

O novo backup operacional contém o banco lógico, não arquivos enviados, código, histórico Git ou serviços externos. Preserve o ZIP de release e backups próprios de uploads. O gerador anterior continua disponível como `npm run backup:legacy`, produzindo ZIP/JSON em texto claro e sobrescrevendo nomes históricos; destina-se apenas à compatibilidade consciente, em ambiente protegido. Não utilize seus arquivos como substituto da rotina cifrada. A restauração antiga por JSON exige agora `--legacy-json` explícito.

Nenhum modelo ou migração foi alterado. Reverter o código não altera o banco, mas versões anteriores não conseguem abrir `.moneybak`; preserve este utilitário, a versão do schema, a chave e o código de recuperação. Trocas de chave exigem custodiar chaves antigas enquanto existirem cópias correspondentes; a retenção da chave atual não apaga cópias antigas.

## Validação desta entrega

Testes cobrem adulteração, truncamento, chave errada, schema/modelos incompletos, retenção não destrutiva, cópia sem sobrescrita e preservação local em falha externa. O teste de CLI exporta um banco sintético, copia o arquivo cifrado, executa restauração real, valida conteúdo, invalida sessões e recusa sobrescrever o destino. A regressão financeira também faz ida e volta cifrada do snapshot populado de todos os modelos. Cópia remota real, agendamento e uma nova homologação PostgreSQL de produção não fazem parte da validação local deste pacote.

Resultado local: `typecheck`, validação estática (190 arquivos TS/TSX, 39 modelos, 17 enums), build, 86 testes e 81 grupos HTTP aprovados. Os cinco testes específicos de backup estão incluídos nos 86. Os ensaios usaram apenas dados sintéticos; não houve acesso ao banco remoto nesta etapa.
