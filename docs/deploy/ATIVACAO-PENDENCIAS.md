# Ativação — situação conferida em 24/10/2026

Os pacotes 1–8 estão preparados no código local. A conferência deste ambiente não encontrou as configurações necessárias para ativar publicação, cópia externa e envio real de alertas. Não foi feita implantação em produção nem criado agendamento.

| Item | Situação neste ambiente | Informação/configuração necessária |
|---|---|---|
| Repositório de entrega | Remoto não configurado nesta cópia | Repositório autorizado e acesso para publicar os commits/workflows |
| Vercel | Token, organização e projeto não presentes | Vincular o projeto correto e configurar secrets no ambiente de entrega |
| Migrações da entrega | Conexão direta do ambiente de publicação não fornecida | RELEASE_DATABASE_URL ou DATABASE_URL_UNPOOLED, com destino conferido |
| Backup externo | Destino não configurado | Diretório remoto realmente montado, fora do projeto, compatível com publicação exclusiva dos arquivos |
| Criptografia de backup | Chave não configurada | Gerar chave de 32 bytes, custodiar fora dos backups e fornecer pelo gerenciador de segredos |
| Alertas | URL/token não configurados | Receptor HTTPS compatível com o contrato do pacote 7 e com deduplicação por identificador |
| Rotinas | Não instaladas por esta entrega | Host/agendador para worker, verificador, despachante, backup e ensaio de recuperação |

Os valores de segredos devem ser configurados no host ou no gerenciador de segredos, sem publicá-los no Git ou copiá-los para relatórios/chat. Há exemplos sem credenciais em `.env.backup.example` e `.env.monitor.example`.

O comando `npm run ops:preflight` lê `.env` e o ambiente do processo e grava `homologacao-resultados/activation-preflight.json`. Apenas nomes e indicadores de presença são registrados. Retorno 2 significa configuração ainda necessária. O comando não conecta serviços, não valida credenciais, não instala tarefas e não testa a montagem do destino remoto. Um resultado de presença completa ainda exige validação real.

A sequência de ativação é vincular repositório/projeto, configurar preview com banco separado, rodar os workflows e homologar os fluxos nesse preview. Em seguida, testar cópia/recuperação externas e entrega de alerta, instalar as rotinas e conferir registros de execução. A atualização de produção deve seguir o plano de publicação já existente, com backup recuperável, migrações conferidas e caminho de retorno. Os guias dos pacotes 1, 6 e 7 descrevem os contratos e limites.
