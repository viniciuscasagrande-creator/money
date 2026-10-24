# Pacote 8 — Experiência, listagens e homologação visual

Entrega local de 24/10/2026. Esta etapa começa pela conferência de ativação dos pacotes anteriores e melhora recebimentos/pagamentos. Não publica a aplicação nem configura destinos externos ainda indefinidos.

## Problemas corrigidos

A tela carregava somente os primeiros 100 títulos. Busca, filtros, contagem e somatórios eram calculados sobre esse recorte, deixando títulos antigos inacessíveis pela busca e apresentando valores parciais como totais. Agora há busca no banco e paginação de 25 itens na interface, com ordem estável por criação e identificador. Os somatórios e as contagens por situação abrangem toda a busca autorizada, independentemente da página. Todos os indicadores incluem todos os status da busca; o filtro de status altera a tabela. Valores continuam em centavos inteiros, inclusive somas acima do limite seguro de Number.

O escopo do produtor é aplicado igualmente à tabela, à contagem e aos somatórios. Continua excluindo recebíveis derivados de vendas com informações internas, conforme a regra já existente. O DTO do produtor não contém conta bancária. Cancelados agora têm filtro explícito e não oferecem liquidação.

As rotas `GET /api/recebimentos` e `/api/pagamentos` mantêm `items` e acrescentam `count`, `page`, `size`, `pages` e `summary`. Parâmetros: `pagina` (1–10000), `limite` (1–100, padrão 25), `status` (ALL/OPEN/SETTLED/CANCELED) e `q` (até 100 caracteres). Consumidores externos precisam percorrer as páginas para obter o conjunto completo. A busca cobre descrição, nome do produtor/evento e valor exato em centavos quando numérico. Não é pesquisa por valor formatado em reais. PostgreSQL usa busca insensível a caixa; SQLite depende de suas regras nativas de comparação, inclusive para letras acentuadas. Não há remoção de acentos.

As leituras da página, contagem e agrupamento compartilham uma transação serializável. Páginas consultadas em momentos diferentes podem mudar se houver inserções ou exclusões concorrentes; não são uma exportação congelada. A paginação por deslocamento limita o payload, mas não elimina o custo de varreduras para buscas e agregações. Os índices existentes permanecem; não há migração de schema neste pacote.

## Carregamento e acessibilidade

O hook compartilhado `useApi` cancela a requisição do cliente ao trocar a consulta ou desmontar a tela. Dados e erros são vinculados à URL/revisão, para uma resposta antiga não aparecer como resultado de um novo filtro. Isso não promete cancelamento da consulta SQL já iniciada. A busca espera 300 ms após a digitação e volta à primeira página quando o texto muda. A carga inicial não dispara uma volta tardia para a página 1.

Cadastros de produtores/eventos só são consultados ao abrir o formulário. Contas ativas só são buscadas ao abrir a liquidação, usando `/api/contas?resumo=1`, que não carrega nem devolve o razão. A autorização continua restrita aos perfis internos. O endpoint completo de Tesouraria permanece disponível para a tela que precisa do razão. Falhas de consulta aparecem como falhas, sem apresentar zero monetário como total confirmado.

Os campos dos formulários de título receberam nomes acessíveis explícitos. No celular, o menu fechado também fica oculto para navegação assistiva, mantendo sua visibilidade no desktop. Não foi realizada certificação completa de acessibilidade ou teste de todas as combinações de tecnologias assistivas.

## Login pelo navegador

O ensaio descobriu que a própria página em `127.0.0.1` era recusada por comparação com `NextURL`, que normaliza loopback para `localhost`. A validação agora compara o Origin com o Host efetivo e o protocolo, incluindo porta. Não confia em `X-Forwarded-Host` e não introduz uma lista ampla de origens aceitas. Domínios, portas e protocolos diferentes continuam recusados. Em topologias que reescrevem Host/protocolo no proxy, valide a configuração real em preview; não desative a proteção para contornar diferenças.

## Validação e medida

- Tipos, build e validação estática aprovados; 40 modelos preservados.
- 92 testes locais e 81 grupos HTTP aprovados. Incluem busca além de cem itens, ordenação com datas iguais, filtros, isolamento entre produtores, somas BigInt e origem legítima versus externa.
- Fixture de leitura com 130 títulos: itens serializados da página anterior de 100 registros somaram 28.462 bytes; página de 25 registros somou 7.132 bytes. A medida é apenas o JSON dos itens sintéticos, não o payload HTTP completo nem um benchmark de latência de produção.
- A verificação PostgreSQL direcionada está em `npm run test:titles:pg`, também adicionada ao job de qualidade. Usa schema sintético exclusivo e restaura o cliente Prisma após o ensaio.

O ensaio PostgreSQL foi aprovado com 131 registros sintéticos e seis páginas: confirmou paginação, ausência de IDs repetidos, soma exata acima do limite de Number, busca com diferença de caixa inclusive em palavra acentuada e isolamento entre produtores. Foram aplicadas as sete migrações existentes no schema descartável. O schema e a ramificação temporária foram removidos e a credencial local apagada. Não houve alteração no banco de produção.

No navegador foram verificados login/logout de Administrador, Financeiro Interno e Produtor; paginação; busca de registro antigo; detalhes; filtro de cancelados; busca vazia; abertura do seletor de conta e do formulário de pagamento; e painel administrativo de monitoramento. Nenhuma baixa ou transferência foi confirmada pelo navegador. O Financeiro não recebeu os menus administrativos. O Produtor viu 135 registros próprios e não encontrou o registro exclusivo do outro produtor; botões de cadastro e liquidação não apareceram. Os testes HTTP continuam cobrindo as autorizações no servidor.

Em viewport de 390 × 844, foram conferidos cartões, menu e largura da página; a largura medida do documento foi 375 px, sem extravasamento horizontal global. Tabelas mantêm rolagem própria. A revisão final confirmou zero navegações financeiras visíveis para tecnologia assistiva com menu fechado e uma com menu aberto. Foram salvas evidências locais com dados sintéticos, sem credenciais.

Essa revisão não percorreu todos os 172 submenus nem substitui homologação na aplicação publicada com dados representativos. A conferência visual foi feita em SQLite local; a conferência direcionada PostgreSQL é de leitura/consulta, não de interface publicada.

## Reproduzir e limpar

```text
npm run db:generate
npm run build
npm run test:visual:serve
```

O servidor escuta somente em loopback, em porta livre. O executor cria um banco novo `prisma/visual-UUID.db`, três usuários e dados sintéticos. Gera uma senha efêmera, gravada no arquivo ignorado `homologacao-resultados/visual-session.json`. Nunca use essas credenciais em produção. Após concluir, encerre com Ctrl+C; o executor encerra o servidor e remove o banco e a credencial. Em encerramento forçado do processo/host, confira os temporários antes de removê-los manualmente. Não execute a geração de cliente de outro provider enquanto o servidor visual estiver em uso.

O ensaio PostgreSQL usa `.env.homologacao`, `ISOLATED_HOMOLOGATION=SIM` e, para conexão remota, `POSTGRES_TEST_ALLOW_REMOTE=SIM`; as mesmas proteções de schemas exclusivos da etapa anterior são reaproveitadas. Não usa a conexão de produção de `.env`. Receptores de alertas e armazenamento real não são acessados por este ensaio.

## Ativação e retorno

Execute `npm run ops:preflight` para um relatório de presença de configuração, sem exibir valores. O resultado atual e o que precisa ser definido estão em `ATIVACAO-PENDENCIAS.md`. Presença não prova validade de credenciais, funcionamento de serviços ou instalação de agendamentos.

Para retorno, reverta a aplicação preservando o banco. Este pacote não altera modelos ou saldos. Clientes que adotarem a paginação devem manter tratamento de metadados compatível com a versão implantada. Preserve os artefatos anteriores e os backups restauráveis antes de qualquer atualização publicada.
