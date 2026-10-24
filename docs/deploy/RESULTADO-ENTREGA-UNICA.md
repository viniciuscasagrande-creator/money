# Resultado da entrega única — 24/10/2026

Pacotes 9–12 implementados em conjunto, sobre a base dos pacotes 1–8. O ZIP cumulativo contém os fontes completos; o patch incremental parte da árvore final do pacote 8 (`d431cfbdf6e6498f6b5753c8c59501850deae35b`).

## Evidências locais

- Rotina `npm run test:delivery`: PASSED nas seis etapas — tipos, análise estática, rotas de interface, build, testes e HTTP.
- Testes automatizados: 94 aprovados, zero falhas.
- Homologação HTTP: 81 grupos aprovados, com banco SQLite novo e exclusivamente sintético.
- Regressões adicionais HTTP verificaram parâmetros inválidos, limite de página, metadados, resumo e restrição do produtor nas novas consultas.
- Cenários específicos: 130 vendas, 130 repasses e 130 transferências do produtor principal, seis páginas por lista, busca do registro antigo, datas empatadas, valores monetários acima de Number.MAX_SAFE_INTEGER, filtro de situação e segregação de dados.
- Verificação de integridade testada contra alteração, ausência, duplicação e tentativa de caminho fora do diretório.

Os logs e relatórios completos permanecem no diretório local ignorado `homologacao-resultados`. Logs de execução não fazem parte do ZIP público dos fontes.

## PostgreSQL

Ensaio aprovado em 24/10/2026 às 17:00:56 (Brasília): os mesmos cenários de 130 registros e seis páginas em cada lista, totais BigInt, situações, vínculo do produtor e busca sem distinguir maiúsculas/minúsculas, inclusive com texto acentuado. Sete migrações existentes aplicadas em schema descartável de uma branch temporária Neon. A primeira execução foi interrompida na retomada da conversa; a carga sintética foi otimizada para inserção em lote e a execução completa subsequente passou. O relatório é `homologacao-resultados/pacotes9-12-postgresql.json`.

A branch temporária foi excluída após o ensaio, abrangendo também o schema da execução interrompida. A credencial temporária foi removida e o cliente Prisma SQLite foi restaurado. Não foram consultadas ou alteradas tabelas de produção. Esse teste dirigido complementa os testes HTTP locais; não equivale a uma nova execução completa do fluxo HTTP sobre PostgreSQL.

## Limites

Não houve publicação em produção, execução do pipeline GitHub remoto, envio de alertas reais ou instalação de agendamentos. Não foram modificados modelos ou criadas migrações. As interfaces novas foram compiladas e suas rotas verificadas; a navegação visual completa das três telas deve ser conferida no preview com dados representativos. O ensaio visual anterior do pacote 8 permanece uma evidência daquele pacote.

A validação local não comprova latência em produção nem resolve as configurações externas pendentes. As instruções de implantação e retorno estão em `PACOTES9-12-ENTREGA-UNICA.md` e `ATIVACAO-PENDENCIAS.md`.
