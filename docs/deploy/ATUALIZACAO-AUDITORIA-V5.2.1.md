# Atualização e recuperação — correções v5.2.1

## Preparação local

Execute na pasta do projeto:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
```

Defina DATABASE_URL no arquivo local. Para uma base SQLite nova, crie antes um arquivo vazio no destino e use `npx prisma migrate deploy`. Isso aplica as migrações versionadas. O build não cria schema nem administrador.

Para o primeiro administrador, defina BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD e, opcionalmente, BOOTSTRAP_ADMIN_NAME e execute `npm run bootstrap`. Não há credencial padrão. O bootstrap recusa banco que já possui administrador.

```powershell
npm run typecheck
npm test
npm run build
node scripts/run-http-homologation.mjs
```

Os testes HTTP usam loopback e bancos temporários. Execute-os em ambiente que permita conexões locais. O executor não acessa banco real e encerra seu servidor ao terminar.

## Base existente

1. Faça backup consistente e confirme a restauração em ambiente separado.
2. Suspenda gravações durante a atualização e a migração de JSON.
3. Compare o schema existente com o baseline v5.2. A base precisa corresponder aos 32 modelos originais antes de marcar o baseline como aplicado. O SQLite antigo de 23 tabelas incluído no ZIP não satisfaz esse requisito; para ele, prefira restaurar o dump JSON em base nova.
4. Somente depois da comparação, marque `202610200001_baseline_v52` como aplicado e aplique `202610200002_audit_fixes`.

Para SQLite:

```powershell
npx prisma migrate resolve --applied 202610200001_baseline_v52
npx prisma migrate deploy
npm run db:migrate:legacy
```

Para PostgreSQL, use conexão direta de uma cópia isolada e o schema PostgreSQL:

```powershell
npx prisma migrate resolve --schema=prisma/postgresql/schema.prisma --applied 202610200001_baseline_v52
npx prisma migrate deploy --schema=prisma/postgresql/schema.prisma
npm run db:generate:pg
npm run db:migrate:legacy
```

Os comandos acima modificam o banco apontado por DATABASE_URL; não os execute em produção sem o ensaio e a conferência do destino. Para a aplicação, volte à conexão pooled quando apropriado. A migração de JSON grava snapshot em `backups/pre-migration-*.json`, preserva o JSON em chaves `legacy_archive:*` e rejeita colisões ou dados inválidos, em vez de sobrescrevê-los.

Pedidos de transferência previamente aprovados passam a exigir aceite do produtor antes da execução. Um solicitante não pode aprovar o próprio pedido, e o executor deve ser outra pessoa. Revise usuários, capacidades e alçadas antes de reabrir a operação.

## Integração externa

Configure EXTERNAL_TICKETING_API_KEY e EXTERNAL_TICKETING_ACTOR_ID. O segundo valor deve identificar um usuário interno ativo destinado aos registros da integração. Não use a senha do usuário como chave de API.

Contrato de importação de recebível:

```json
{
  "externalReference": "PROVEDOR-PEDIDO-2026-001",
  "producerName": "Produtor exemplo",
  "producerDocument": "DOCUMENTO-EXEMPLO",
  "eventName": "Evento exemplo",
  "description": "Recebível do pedido 2026-001",
  "amountCents": "15000",
  "dueDate": "2026-12-15"
}
```

POST `/api/integracao/ingressos` aceita a chave em `x-api-key`; operadores autenticados também podem importar pela tela. A referência pode vir no corpo ou no cabeçalho Idempotency-Key; se ambos forem enviados, devem coincidir. Mesmo identificador com conteúdo diferente retorna conflito. As referências são únicas por provedor e precisam ser estáveis nos reenvios.

## Restauração isolada

```powershell
npm run backup:restore -- db-dump-soul-v5.2-completo.json prisma/restore-ensaio.db --isolated
```

O destino deve ser novo arquivo `prisma/restore-NOME.db`. A importação aborta se o arquivo existir ou se o banco não estiver vazio. Por padrão as sessões são invalidadas. Para comparação integral de um ensaio sem exposição de rede:

```powershell
npm run backup:restore -- db-dump-soul-v5.2-completo.json prisma/restore-integral.db --isolated --include-sessions
npx tsx scripts/verify-restoration.ts db-dump-soul-v5.2-completo.json prisma/restore-integral.db
```

O verificador compara todos os campos originais e reconcilia o saldo com o razão. A senha do administrador já existente continua sendo a do dump; o restaurador não cria outra senha. Não coloque o banco de ensaio em servidor público. Os bancos restaurados são cópias locais; os comandos não sobrescrevem o SQLite original.

## Backup novo

`npm run backup` exige repositório Git e DATABASE_URL configurado. Exporta todos os modelos em snapshot transacional e falha se a exportação não terminar. O pacote inclui os fontes atuais, documentos, configuração, migrações, dump, bundle e hashes. Bancos `.db` locais ficam fora do pacote para não confundir snapshots. O manifesto informa se há alterações locais não commitadas; nesse caso, o bundle corresponde ao histórico e os arquivos soltos contêm as alterações atuais.
