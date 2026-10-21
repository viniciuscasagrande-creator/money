# Homologação PostgreSQL e processo de entrega

## Arquivos novos

- `.github/workflows/quality.yml`: valida SQLite e PostgreSQL 18 em jobs independentes. O banco do CI é um serviço descartável, sem credenciais da empresa.
- `.github/workflows/release.yml`: publicação manual de um commit validado. O padrão é preview. Produção exige branch main, confirmação PUBLICAR e o ambiente GitHub production.
- `scripts/postgres-homologation-runner.mjs`: migração de uma base antiga preenchida, regressões concorrentes, backup/restauração e homologação HTTP completa em schemas exclusivos.
- `scripts/release-vercel.mjs`: plano revisável, build antes de migração, conferência de destino, migrações versionadas, migração de JSON legado e publicação de artefato pré-compilado.

## Executar o ensaio PostgreSQL

Não utilize a URL de produção. Use um banco local ou uma branch dedicada:

```powershell
Copy-Item .env.homologacao.example .env.homologacao
# Edite apenas POSTGRES_TEST_URL e, se necessário, POSTGRES_TEST_ALLOW_REMOTE.
npm run test:homologacao:pg
```

O executor não lê DATABASE_URL de `.env`. Ele exige POSTGRES_TEST_URL e a marca ISOLATED_HOMOLOGATION=SIM. Conexões remotas precisam de autorização explícita na configuração. O hostname não pode ser um pooler, pois migrações usam conexão direta.

Cada execução usa schemas com identificadores aleatórios. Os testes de upgrade, concorrência e HTTP têm schemas diferentes. As tabelas da aplicação não são reutilizadas. O executor encerra seu servidor local, remove somente os schemas gerados e restaura o cliente Prisma SQLite quando esse era o provider anterior. O build de teste é substituído; gere novamente o build da aplicação depois do ensaio se for iniciar um servidor local duradouro.

Saídas sem credenciais ficam em `homologacao-resultados/postgresql.json` e `postgresql-regressions.json`.

## O que o ensaio cobre

1. Aplicação do baseline v5.2 a um schema vazio e inserção de reservas/transferências no formato antigo.
2. Registro do baseline e aplicação da migração aditiva, preservando valores e identificadores.
3. Pedidos simultâneos de repasse sem exceder saldo.
4. Cinco entregas concorrentes da mesma referência externa produzindo um único recebível.
5. Retenções simultâneas preservadas individualmente.
6. Permissões, segregação e migração do JSON legado.
7. Exportação e restauração de todos os modelos PostgreSQL com comparação de conteúdo.
8. Fluxos HTTP da homologação financeira, incluindo processamento e fechamento contábil.

## Ativar no GitHub

Os workflows estão preparados no repositório local. Para executá-los, publique os arquivos no repositório GitHub escolhido. Esta entrega não cria repositório nem configura credenciais externas automaticamente.

No repositório, crie ambientes separados `preview` e `production`. Configure, para cada ambiente:

| Secret | Uso |
|---|---|
| VERCEL_TOKEN | Acesso do processo de publicação à Vercel |
| VERCEL_ORG_ID | Organização/equipe do projeto |
| VERCEL_PROJECT_ID | Projeto que recebe o artefato |
| DATABASE_URL_UNPOOLED | Conexão direta do banco desse ambiente |

Configure aprovação obrigatória e restrição à branch main no ambiente production. Ative os jobs SQLite e PostgreSQL como verificações obrigatórias da branch principal. Para a primeira atualização de uma base existente, siga o guia de baseline e migração já incluído no projeto; o workflow não marca baselines automaticamente.

A configuração Vercel do ambiente precisa conter a conexão normal da aplicação. O processo confere que hostname, banco e schema correspondem à conexão direta usada pelas migrações. Diferenças bloqueiam a entrega. A conexão pode ser pooled no runtime e direta nas migrações.

Antes de uma atualização que migre JSON legado, mantenha uma janela sem gravações e um backup restaurável. O workflow compila antes de alterar o banco; se a migração falhar, a publicação não ocorre. Migrações já aplicadas não são desfeitas automaticamente. Caso a publicação falhe depois da migração, use a compatibilidade aditiva para restaurar a versão anterior ou corrija e republique; não execute reset do banco.

```powershell
npm run release:plan
```

O comando apenas descreve a sequência. `release:execute` realiza a publicação e deve ser executado pelo job Linux de entrega com os secrets configurados. A CLI Vercel está fixada em 56.4.1 para esse job.

## Limitação encontrada no Neon

O projeto money recusou a modalidade schema-only porque possui a role legada `anonymous`. A configuração da produção não foi alterada para contornar essa limitação. O teste pode usar PostgreSQL local descartável ou uma branch normal temporária; a segunda opção replica o estado do banco, mesmo que os testes usem apenas schemas sintéticos. A modalidade schema-only está em beta: problemas podem ser reportados pelo [feedback do Console Neon](https://console.neon.tech/app/projects?modal=feedback) ou pelo [suporte no Discord](https://neon.com/discord).

## Referências técnicas

- [Prisma ORM 6: desenvolvimento e produção](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production).
- [Vercel: build em CI e publicação prebuilt](https://vercel.com/docs/cli/build).
