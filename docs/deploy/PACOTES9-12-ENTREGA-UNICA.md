# Pacotes 9–12 — entrega única

Esta entrega estende os pacotes 1–8. O escopo foi proposto e implementado em conjunto: listas completas de vendas, repasses e transferências e uma rotina única de qualidade e integridade dos arquivos. Não representa implantação em produção.

## Pacote 9 — vendas

Vendas deixam de ficar limitadas aos 100 registros mais recentes. Busca no servidor por referência externa, evento, produtor, gateway e bandeira; filtro por situação; páginas de 25 itens com limite de até 100 na API. Os indicadores somam todos os resultados dos filtros, não apenas a página visível. Valores monetários são agregados como BigInt e enviados como strings decimais. O acesso permanece exclusivo de ADMIN e FINANCE_DISK.

## Pacote 10 — repasses

Solicitações recebem busca por evento, produtor ou valor exato em centavos, filtro pelas seis situações e paginação completa. Contagem e soma consideram somente os resultados autorizados. A posição financeira dos eventos continua independente dos filtros de solicitações, com explicação na tela.

`GET /api/repasses?somenteLista=1` retorna somente solicitações, totais, papel e metadados; não recalcula a disponibilidade de todos os eventos a cada busca ou mudança de página. A tela carrega a posição separadamente e atualiza ambos os conjuntos após operações. O modo padrão mantém `events` para os clientes existentes. Contas usadas na baixa são obtidas pelo resumo sem histórico do razão. A baixa ainda revalida a posição no servidor conforme as regras anteriores.

## Pacote 11 — transferências

Busca no servidor por origem, destino, justificativa ou valor exato em centavos; filtros pelas seis situações; totais de pendentes e executadas sobre todos os resultados filtrados. Ordem estável por data e identificador evita empates entre páginas em um conjunto sem alterações. Produtores continuam restritos aos próprios registros em itens, contagem e agregados; ausência de vínculo não libera consulta geral. As ações e regras de aprovação, aceite e execução são preservadas.

## Contrato das três listas

`pagina`: inteiro de 1 a 10000; `limite`: inteiro de 1 a 100, padrão 25; `q`: texto aparado de até 100 caracteres; `status`: ALL ou situação válida de cada módulo. Consultas inválidas retornam 400. Respostas incluem `items`, `count`, `page`, `size`, `pages` e `summary`, com Cache-Control privado sem armazenamento. Página além do último resultado é ajustada para a última disponível. Clientes que dependiam de receber 100 itens sem parâmetros precisam adotar os metadados ou explicitar o limite.

As leituras de itens/contagem/agregados de cada lista usam uma transação serializável. Mudanças concorrentes entre requisições podem deslocar registros na paginação por deslocamento; não há snapshot persistente entre páginas. PostgreSQL usa busca sem distinguir maiúsculas/minúsculas; SQLite usa o comportamento nativo de contains, inclusive suas limitações para caracteres acentuados. Não há normalização de acentos. Busca numérica de repasses e transferências aceita centavos inteiros, não valor formatado em reais.

## Pacote 12 — validação e integridade

```text
npm run quality:plan
npm run test:delivery
```

O plano apenas mostra as etapas. A execução roda tipos, verificações estáticas, rotas de interface, build, testes automatizados e homologação HTTP em sequência. Para na primeira falha e grava `homologacao-resultados/entrega-unica-quality.json` e um log por etapa. Esse diretório é ignorado pelo Git e deve permanecer privado. Um processo interrompido pode deixar estado RUNNING; somente PASSED com todas as etapas concluídas comprova aquela execução. Esse comando não executa a suíte PostgreSQL, não publica e não instala rotinas externas.

```text
node scripts/delivery-integrity.mjs --create ../manifesto.json ../entrega.zip ../alteracoes.patch
npm run delivery:verify -- ../manifesto.json
```

O manifesto deve ficar no mesmo diretório dos arquivos e sua criação não sobrescreve um arquivo existente. A verificação compara tamanho e SHA-256; rejeita caminhos fora da pasta, links simbólicos, nomes repetidos, arquivos ausentes ou alterados. SHA-256 detecta corrupção quando comparado com um manifesto confiável; não é assinatura digital nem prova de autoria. Preserve o manifesto por um canal confiável.

## Verificação e limites

Os cenários novos criam 130 registros por lista com datas empatadas, consultam seis páginas sem repetir identificadores, encontram o registro mais antigo, somam valores acima do inteiro seguro JavaScript, filtram situações, ajustam página excessiva e conferem isolamento do produtor e ausência de referência de baixa no DTO externo. Também verificam bloqueio de vendas para produtor e rejeição de vínculo ausente. O teste não executa baixas nem cria movimento bancário.

Os mesmos cenários estão integrados em `npm run test:titles:pg`, com migrações e schema descartável, e no job PostgreSQL do CI. A execução real desta entrega e suas limitações constam em `RESULTADO-ENTREGA-UNICA.md`.

Não foram alterados modelos, migrações ou saldos. Não há novo provedor, recuperação de senha por e-mail, segundo fator, agendamento externo ou ativação de serviços neste escopo. Outros módulos podem continuar com limites de consulta; esta entrega cobre somente as três listas nomeadas. O guia `ATIVACAO-PENDENCIAS.md` continua válido. Para retorno, publique a versão anterior preservando o banco e alinhe os clientes ao contrato de paginação dessa versão.
