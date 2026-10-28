# Procedimento de Gestão da Chave e Recuperação de Backups (SOUL Financeiro ERP)

## 1. Onde Guardar a Cópia Segura da Chave (Pacote 3)

Os arquivos `.moneybak` (backup operacional do banco) e `.moneyzip` (pacote completo do repositório + banco) utilizam criptografia autenticada **AES-256-GCM**. Sem a chave de 256 bits (`BACKUP_ENCRYPTION_KEY`), **nenhum backup pode ser descriptografado**.

### Regras obrigatórias de guarda (Regra 3-2-1 de Segredos)
1. **Gerenciador de Senhas Corporativo / Cofre de Segredos:** Armazene o valor hexadecimal de 64 caracteres (`BACKUP_ENCRYPTION_KEY`) e seu respectivo `keyId` (16 caracteres hexadecimais exibidos nos relatórios de backup) em um cofre de senhas independente (ex.: 1Password, Bitwarden, Proton Pass ou Secret Manager da nuvem).
2. **Cópia Offline Fora do Computador e do Disco de Backup:** Guarde uma cópia impressa em envelope lacrado ou em mídia criptografada separada fisicamente da máquina principal (`E:\MONEY`) e separada da unidade de backups externos (`BACKUP_EXTERNAL_DIR` / `BACKUP_ARCHIVE_DIR`).
3. **Nunca incluir a chave dentro do Git ou da pasta de backups:** O sistema identifica a chave utilizada apenas pelo `keyId` irreversível (`HMAC-SHA256(key, "MONEY_BACKUP_KEY_ID_V1").slice(0, 16)`), sem jamais gravar o valor da chave nos pacotes ou logs.

---

## 2. Rotação / Troca de Chave sem Perder Acesso às Cópias Anteriores

Para substituir a chave principal mantendo a leitura e restauração de todos os backups anteriores:

1. Gere uma nova chave de 32 bytes (64 caracteres hexadecimais):
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. No arquivo `.env` (e no cofre de segredos), mova a chave antiga para `BACKUP_PREVIOUS_KEYS` (separada por vírgula se houver mais de uma) e defina a nova chave em `BACKUP_ENCRYPTION_KEY`:
   ```env
   BACKUP_ENCRYPTION_KEY=<nova_chave_64_hex>
   BACKUP_PREVIOUS_KEYS=<chave_anterior_1_64_hex>,<chave_anterior_2_64_hex>
   ```
3. Novos backups serão cifrados automaticamente com a chave principal (`BACKUP_ENCRYPTION_KEY`), enquanto `backup:check`, `backup:rehearse`, `backup:restore` e `backup:retention` continuarão abrindo normalmente qualquer backup antigo cifrado com as chaves listadas em `BACKUP_PREVIOUS_KEYS`.
4. Opcionalmente, para recriptografar um arquivo antigo para a chave atual:
   ```powershell
   npm run backup -- --rotate-key backups/operacional/<arquivo>.moneybak
   ```

---

## 3. Destinos Independentes e Retenção (Pacote 5)

Configure três destinos independentes no `.env`:
- `BACKUP_LOCAL_DIR`: Cópia rápida local (padrão: `backups/operacional`)
- `BACKUP_EXTERNAL_DIR`: Unidade externa montada fora da árvore do projeto (ex.: disco externo ou volume de rede)
- `BACKUP_ARCHIVE_DIR`: Terceiro local independente com histórico de versões (ex.: pasta sincronizada em nuvem ou segundo volume físico)
- `BACKUP_KEEP`: Quantidade de versões válidas preservadas pela política de retenção (mínimo `2`, padrão `14`).

---

## 4. Procedimento Passo a Passo de Recuperação e Ensaio Isolado (Pacotes 4 e 6)

### A. Consultar saúde operacional dos destinos e último ensaio
```powershell
npm run backup -- --status
```

### B. Executar ensaio automático de restauração em banco temporário isolado
Restaura em um banco SQLite descartável, confere os 40 modelos, vínculos referenciais e conciliação de saldos bancários (`balanceCents` vs `ledgerEntry`) sem tocar no banco em produção:
```powershell
npm run backup:rehearse
```

### C. Restaurar um backup em banco isolado para inspeção ou promoção controlada
Se o destino primário estiver indisponível, adicione `--auto-fallback` para buscar automaticamente a cópia íntegra mais recente nos destinos sobreviventes (`local`, `external`, `archive`):
```powershell
npm run backup:restore -- backups/operacional/<arquivo>.moneybak prisma/restore-recuperacao.db --isolated --auto-fallback
```

### D. Verificar matematicamente o banco restaurado
```powershell
npm run backup:verify -- backups/operacional/<arquivo>.moneybak prisma/restore-recuperacao.db
```
