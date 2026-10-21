# Pacote 2 — Segurança da conta

Implementação local de 21/10/2026, sobre a entrega de PostgreSQL e CI. Este pacote não foi publicado em produção.

## Uso

Abra o menu do perfil no cabeçalho e selecione **Segurança da conta** (`/minha-conta`). A tela atende Administrador, Financeiro e Produtor. Cada usuário consulta apenas suas sessões ativas e confirma a senha atual para encerrar outros acessos ou alterar sua senha.

Ao trocar a senha, todas as sessões do usuário são apagadas e o navegador retorna ao login. A nova senha exige ao menos 12 caracteres e até 72 bytes UTF-8; esse limite evita truncamento pelo bcrypt. Senha idêntica à atual é recusada. Sessões vencidas ou de outra pessoa não autorizam alterações. Cinco confirmações incorretas bloqueiam essas operações por 15 minutos, com contador persistido no banco.

A atualização de senha, a revogação e a auditoria são transacionais. O login revalida o hash da credencial ao criar a sessão para impedir sua emissão com uma senha alterada durante a autenticação. Os endpoints não aceitam `userId` enviado pelo cliente e não retornam tokens ou hashes. Nenhum novo modelo ou migração de schema é necessário.

## Endpoints

- `GET /api/auth/security`: lista sessões ativas da conta autenticada, identificando a atual, sem dados de outras contas.
- `POST /api/auth/security`: aceita `action: CHANGE_PASSWORD`, `currentPassword` e `newPassword`; ou `action: REVOKE_OTHERS` e `currentPassword`.
- Todas as mutações passam pela validação de origem já utilizada pelo sistema.

## Escopo restante do pacote de segurança

Recuperação por e-mail, segundo fator, gestão administrativa de acessos e revisão integral de permissões ainda não foram implementados nesta entrega. A recuperação por e-mail precisa de provedor e domínio remetente configurados, URL pública validada e fluxo de tokens de uso único. O bloqueio das novas operações complementa a limitação de login existente; não substitui proteção de tráfego na infraestrutura.

## Implantação e retorno

Validação local concluída: checagem de tipos, build, 78 testes, 81 grupos HTTP em SQLite e verificações estáticas aprovados. O ZIP desta entrega é acumulado e inclui o pacote 1. O patch do pacote 2 aplica somente as alterações desta etapa sobre o conteúdo do ZIP `MONEY-HOMOLOGACAO-CI.zip` entregue anteriormente (árvore Git `fa569dd488438ea2433fe508c47c5486d4a0a7c9`).

Execute `npm run build`, `npm test` e `npm run test:http`. Faça a publicação primeiro em preview pelo processo documentado no pacote anterior. Confirme a troca de senha e o encerramento das sessões com usuários de teste antes da produção. O pacote não altera schema nem exige migração de dados. Retornar ao código anterior não recupera senhas anteriores nem sessões já revogadas.

As validações locais cobrem senha incorreta, sessão expirada, isolamento entre usuários, limite de tentativas, rollback, revogação, auditoria e autenticação com senha nova. A suíte HTTP testa autenticação obrigatória, origem cruzada, rejeição de usuário injetado, ausência de hashes nas respostas e o fluxo completo de troca e novo login. A validação visual completa e a execução desta alteração no PostgreSQL continuam pendentes.
