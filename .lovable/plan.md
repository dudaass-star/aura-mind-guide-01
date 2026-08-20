# Recuperação bloqueada por engano: `woovi_mandate_remote`

## O que aconteceu

Ursula Dias (20/08 09:05) e Vivien Rodrigues (20/08 06:48) **não** receberam a mensagem de recuperação de checkout — foram marcadas como `Pulado: woovi_mandate_remote`, ou seja, a guarda Woovi concluiu que elas já tinham mandato ativo. Elas não tinham.

No banco, as duas assinaturas Woovi estão assim:

- status `AGUARDANDO`, pix_status `CREATED`
- `entry_paid_at`, `mandate_approved_at`, `access_granted_at` todos vazios

Isto é: geraram o QR do PIX Automático e nunca autorizaram nem pagaram. A camada local da guarda acertou (não bloqueou). Quem bloqueou foi a **checagem ao vivo**: ela consulta `GET /api/v1/subscriptions/{id}` e aceita o campo `status` como prova de compromisso. A Woovi devolve a assinatura como `ACTIVE` desde o momento em que ela é criada — antes de qualquer autorização de mandato. E `ACTIVE` está na lista de status aprovados do trilho. Resultado: qualquer pessoa que só abriu o modal do PIX passa a ser tratada como pagante e a recuperação nunca dispara.

Efeito prático: desde que a guarda entrou (19/08), **todo lead de PIX que abandonou no QR está sendo silenciado** — não é caso isolado dessas duas.

## Correção

Tornar a checagem remota exigente: só bloquear com prova real de autorização ou pagamento.

1. Na consulta remota do mandato, ignorar o `status` genérico da assinatura. Considerar comprometido apenas quando houver:
   - status do bloco `pixAutomatic` em `APPROVED` / `AUTHORIZED` / `PIX_AUTOMATIC_APPROVED`, ou
   - alguma parcela paga na assinatura.
   `ACTIVE` isolado deixa de valer como compromisso.
2. Manter intacta a varredura de extrato (`/api/v1/transaction`), que é a única fonte da parcela do carnê — é ela que resolve o caso real da Isabella (pagou e recebeu recuperação).
3. Manter a camada local como está (entrada paga / mandato aprovado / parcela paga).
4. Manter o gatilho em 15 min.

## Reparo dos leads silenciados

Reabrir para recuperação os registros pulados por `woovi_mandate_remote` desde 19/08 que continuam sem pagamento nem mandato aprovado (Ursula e Vivien inclusive), zerando o estágio para que o próximo cron os alcance dentro da janela útil.

## Detalhes técnicos

- `supabase/functions/_shared/woovi-recovery-guard.ts`: em `hasLiveWooviCommitment`, separar a leitura do status da assinatura da do mandato; usar um conjunto restrito (`APPROVED`, `AUTHORIZED`, `PIX_AUTOMATIC_APPROVED`) para o mandato e checar `installments` com pagamento antes de retornar `woovi_mandate_remote`.
- Redeploy de `recover-abandoned-checkout-whatsapp` e `recover-abandoned-checkout` (ambas importam a guarda).
- Reset dirigido em `checkout_sessions` / registros PIX pendentes com `recovery_last_error` contendo `woovi_mandate_remote`, filtrando por ausência de `entry_paid_at`/`mandate_approved_at` na assinatura correspondente.
