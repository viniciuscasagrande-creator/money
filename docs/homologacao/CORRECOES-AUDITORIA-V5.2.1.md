# Correções da auditoria — 20/10/2026

## Resultado

Correções implementadas na cópia local extraída do backup. ZIP original preservado. Nenhuma implantação ou alteração no banco remoto foi realizada.

1. **Build e tipos:** removida a conversão incompatível do exportador. Recuperados os arquivos omitidos da extração direta, incluindo PostCSS, configuração e documentação. TypeScript e build Next.js aprovados.
2. **Administrador:** removidas criação automática de usuário e senha fixa do preparo do Prisma. Build gera o cliente sem aplicar schema ou criar usuários. Bootstrap continua explícito, com senha fornecida pelo operador.
3. **Transferências e retenções:** APIs antigas e novas utilizam os mesmos serviços e tabelas. Transferências exigem capacidade, alçada, segregação de solicitante/aprovador/executor e aceite do produtor. JSON legado é migrado transacionalmente e arquivado; sua presença bloqueia a operação até a migração.
4. **Integração:** referência externa obrigatória e índice único de entrega. Reenvio idêntico retorna o título existente; conteúdo diferente na mesma referência é rejeitado. A transação evita duplicação sob concorrência. Webhooks exigem operador configurado em EXTERNAL_TICKETING_ACTOR_ID. A tela agora corresponde ao contrato da API e informa que importa recebíveis; vendas com split continuam no módulo Vendas.
5. **Baixas:** disponibilidade recalculada com riscos e retenções atuais, excluindo apenas a reserva do próprio pedido. Permissão do produtor revalidada. Dupla aprovação de repasse exige pessoas distintas. Conciliação configurada como pendente bloqueia a baixa.
6. **Contabilidade:** fatos de venda, liquidação, retenção, liberação, repasse, transferência e estorno são emitidos na mesma transação operacional. Permanecem pendentes até processamento por regra contábil aprovada. DRE, razão e passivos filtram a competência. Limites não retornam totais truncados silenciosamente. Fechamento e processamento compartilham bloqueio do período; eventos financeiros não são inseridos em período já fechado.
7. **Restauração:** importador exige arquivo SQLite novo e isolado, valida modelos e contagens, converte datas e BigInt e respeita ordem das dependências. Sessões não são restauradas por padrão. O ensaio do dump original com inclusão explícita de sessões restaurou os 41 registros dos 32 modelos, comparou todos os campos originais e reconciliou banco e razão. Um snapshot sintético com operações novas também foi restaurado e comparado integralmente.

## Evidências executadas

- Build de produção aprovado.
- Checagem TypeScript aprovada.
- **66 testes aprovados:** suíte original de cálculos e regressões de persistência/HTTP, incluindo reenvio concorrente, revogação de capacidade, novas retenções, dupla aprovação, rollback em período fechado, segregação e DRE em dois meses.
- Homologação integrada: **81 grupos aprovados** em SQLite temporário, com credenciais aleatórias e usuários sintéticos.
- Migração versionada aplicada a banco com reservas e transferências antigas, preservando valores e identificadores.
- Verificação sintática e estrutural das telas/rotas.
- Restauração original: **32 modelos e 41 registros comparados**, razão e saldo bancário reconciliados.

## Limites

O banco PostgreSQL remoto e a aplicação publicada não foram alterados ou testados. O SQL de migração PostgreSQL foi gerado a partir dos schemas, mas precisa ser ensaiado em uma cópia isolada desse ambiente antes de produção. A validação HTTP não substitui inspeção visual completa em dispositivos e navegadores.

A emissão contábil automática registra o fato econômico para processamento; não ativa regras ou escolhe contrapartidas em nome da empresa. O administrador deve aprovar essas regras. A importação externa de recebíveis não foi convertida implicitamente em venda com split, pois faltam informações de adquirente e taxa no contrato recebido.

O catálogo de 20 travas e as configurações comerciais de simulação continuam exigindo evolução própria para equivalerem a todos os controles anunciados. Esta entrega não representa certificação de todos os módulos ou dos 172 submenus.
