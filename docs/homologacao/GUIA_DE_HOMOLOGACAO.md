# Pacote 02 — Homologação isolada / VS Code

## Resultado já observado no ambiente de revisão

- **8/8 testes unitários** de conversão monetária, cálculo de taxa Disk, MDR e divisão de receita passaram (Node.js + ts-node global).
- Arquivos do Pacote 02 e ambos os esquemas Prisma estão presentes.
- **Não foi possível instalar pacotes npm**: o ambiente de revisão não resolve `registry.npmjs.org`.
- Assim, **não há comprovação de `npm run build`, `prisma db push` ou execução HTTP/Prisma integrada** neste ambiente. A ausência dessa validação impede qualquer alegação de homologação final.

## Execução segura no Windows / VS Code

Requisitos: Node.js 22, npm, PowerShell, acesso ao registro npm. Descompacte o projeto em uma pasta e abra **essa pasta** no VS Code. No terminal PowerShell, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\homologacao-local.ps1
```

O script:

1. Cria banco SQLite **temporário e exclusivo** `prisma/homologacao-UUID.db` — **não toca no seu `.env`, PostgreSQL ou SQLite existente**.
2. Instala dependências caso ainda não estejam instaladas, gera o cliente Prisma, cria a estrutura e uma conta admin temporária.
3. Executa testes unitários, análise TypeScript e build Next.js.
4. Inicia um servidor HTTP apenas no loopback local em uma porta efêmera, executa testes integrados e encerra o servidor.
5. Exclui o banco temporário (incluindo WAL/journal) e restaura as variáveis de ambiente do processo.

Os testes integrados geram vendas, repasses e antecipações **sintéticos apenas na base temporária de homologação**. Nenhuma conta bancária externa é acessada e nenhuma transferência real é enviada. O teste cria dois produtores separados e assegura que o produtor B não veja os dados ou aprove as operações do produtor A. Confere permissões, recebimentos, MDR, divisão da receita, bloqueio de duplicidades, reservas, aceite do produtor, assinatura final do Financeiro, baixa e reconciliação.

### Garantias e precauções

- `homologacao-integrada.mjs` é travado para funcionar apenas com `ISOLATED_HOMOLOGATION=SIM`, `localhost/127.0.0.1` e `DATABASE_URL=file:./homologacao-UUID.db`.
- O script de validação executa `db:push` **somente em base temporária nova**. **Jamais use `db:push` diretamente em produção** sem revisar migrações, backup e autorização.
- Este pacote não integra gateways reais, liquidação bancária, PIX de saída, antifraude, certificação de assinatura digital nem procedimentos completos para estornos/chargebacks.
- **Aprovação para produção depende de testes integrados passando, ambiente PostgreSQL de homologação separado, testes de concorrência, conciliação real, segurança, backup/restauração e liberação explícita.**

## Checklists de aprovação

| Controle | Critério mínimo |
|---|---|
| Instalação | `npm install` ou `npm ci` sem erros |
| Prisma | `db:generate` e `db:push` no banco **temporário** passam |
| TypeScript / Next.js | `npm run typecheck` e `npm run build` passam |
| Cálculo | Todos os testes unitários passam |
| Perfis | Produtor B não acessa dados de A nem APIs internas |
| Repasses | Aprovação → aceite do produtor → Financeiro por último |
| Integridade | Recebível liquidado uma só vez, sem saldo negativo, razão reconciliado |
| Auditoria | Trilha de venda, solicitação, aprovação, assinatura e baixa |

**Interpretação:** o script indica aprovação somente dos controles que conseguiu executar de fato; não confirma aptidão para produção.
