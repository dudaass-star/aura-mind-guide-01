## Objetivo

Garantir que o fluxo `recover-abandoned-checkout-whatsapp` só dispare para checkouts abandonados **a partir do momento da implementação**. Tudo que já existe atrás (sessões `status='created'` criadas antes do deploy) fica **apenas com o fluxo de e-mail** (`recover-abandoned-checkout`), sem WhatsApp.

## O que muda

### 1. Marcar todo o backlog atual como "já tratado" no WhatsApp

Backfill único nas `checkout_sessions` existentes com `status='created'`:
- Preencher `whatsapp_recovery_15min_sent_at = now()`
- Preencher `whatsapp_recovery_24h_sent_at = now()`
- Setar `whatsapp_recovery_last_error = 'skipped: backlog_pre_cutoff'`

Resultado: as queries de cada estágio (`is(sentColumn, null)`) ignoram 100% do backlog. O fluxo de e-mail continua intacto (usa `recovery_stage` + `recovery_stageN_sent_at`, colunas diferentes).

Também inserir um registro em `checkout_recovery_attempts` por sessão com `status='wa_stage_1_skipped'` e `error_message='backlog_pre_cutoff'` para rastreabilidade (1 linha por sessão, não 2, para não inflar).

### 2. Cutoff defensivo no código

Em `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`, adicionar uma constante:

```ts
// Só considera checkouts criados após esta data (deploy do cap).
const WHATSAPP_RECOVERY_CUTOFF = "2026-05-24T00:00:00Z"; // ajustar no deploy
```

Aplicar em `processStage` na query principal:

```ts
.gte("created_at", WHATSAPP_RECOVERY_CUTOFF)
```

Isso é cinto-e-suspensório: mesmo se alguma sessão antiga voltar a ter as colunas zeradas por qualquer motivo, ela nunca entra no fluxo.

### 3. Nada muda no e-mail

`recover-abandoned-checkout/index.ts` continua exatamente como está. O backlog do passado continua recebendo a sequência de 3 e-mails (1h / 25h / 97h) normalmente.

## Resumo do efeito esperado

- **Antes do cutoff:** sessões abandonadas → só e-mail. WhatsApp = 0.
- **A partir do cutoff:** sessões novas abandonadas → e-mail + WhatsApp (15min e 24h) como já configurado.
- Volume WhatsApp esperado a partir de agora: ~20–40 mensagens/dia (proporcional aos ~10–20 abandonos diários × 2 estágios), em vez dos picos de centenas vindos do backfill histórico.

## Arquivos afetados

- **Migration de dados** (via insert tool): UPDATE em `checkout_sessions` + INSERT em `checkout_recovery_attempts`.
- **Código**: `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts` (constante + `.gte` na query).
- **Memória**: atualizar `mem/features/recovery/whatsapp-subaccount-recovery.md` documentando o cutoff.

## Não-objetivos

- Não mexer no fluxo de e-mail.
- Não investigar agora as falhas Twilio de 23/05 (fica para próximo loop se quiser).
- Não criar age cap genérico (ex.: "não mandar se >7 dias") — o cutoff já resolve o problema imediato; podemos adicionar depois se voltar a aparecer.
