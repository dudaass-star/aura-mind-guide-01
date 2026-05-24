## Problema

Caso Maria Conceição (ver investigação anterior):
- Pagou organicamente 15:14, **antes** de qualquer WhatsApp.
- Estágio 15min disparou 1 min depois (15:15) porque o profile dela ainda não estava `active` (webhook Stripe ainda processando).
- Painel marcou como "convertida pelo WhatsApp" porque compara apenas e-mail/telefone, sem checar timestamp.

Dois bugs distintos para corrigir.

## Bug 1 — Função WhatsApp dispara para checkout já pago

**Arquivo:** `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`

Hoje o skip só considera `profiles.status IN ('active','trial')`. Se o usuário pagou em **outra** sessão de checkout (mesmo email/telefone) e o webhook ainda não converteu o profile, o WhatsApp é enviado indevidamente.

**Fix:** antes do envio, pré-buscar todos `checkout_sessions` com `status='completed'` (últimas 72h é suficiente) e montar `completedEmailSet` / `completedPhoneSet`. Aplicar o mesmo skip dos clientes ativos:
- Se `session.email` está em `completedEmailSet` → `markSkipped(..., "already_paid_email")`.
- Se alguma variação do telefone está em `completedPhoneSet` → `markSkipped(..., "already_paid_phone")`.

Isso bloqueia tanto o estágio 1 quanto o 2 para qualquer pessoa que já tenha um checkout pago.

## Bug 2 — Métrica "converteu" do painel WhatsApp

**Arquivo:** `src/pages/AdminEngagement.tsx` (bloco do `whatsappStats`, linhas ~342-418)

Hoje basta existir qualquer `checkout_sessions.status='completed'` com mesmo email/telefone para contar como convertido — ignora se o pagamento veio **antes** do WhatsApp ser disparado.

**Fix:**
1. No fetch de `completedByEmail` / `completedByPhone`, trazer também `completed_at` (e `created_at` como fallback).
2. Montar mapas `completedAtByEmail` / `completedAtByPhone` com o **maior** timestamp de conclusão por chave.
3. Ao calcular `converted` para a métrica WhatsApp, exigir que exista `completed_at` **estritamente posterior** ao primeiro `whatsapp_recovery_*_sent_at` da sessão:
   ```
   const waSentAt = min(stage1_sent_at, stage2_sent_at não nulos)
   converted = completedAt > waSentAt
   ```
4. Manter o campo `converted` genérico (sem timestamp) para a lista de e-mail, mas adicionar `convertedByWhatsapp` específico para o card WhatsApp.

## Não está no escopo desta correção

- Backfill / reclassificação retroativa de registros antigos (caso Maria continuará aparecendo até ajustar manualmente, se desejado depois).
- Mudanças no fluxo de e-mail.
- Mudanças nos templates Twilio.

## Verificação após deploy

1. Rodar query: `SELECT id, email, completed_at, whatsapp_recovery_15min_sent_at FROM checkout_sessions WHERE status='completed' AND whatsapp_recovery_15min_sent_at IS NOT NULL` e confirmar que o painel só conta como "converteu" os casos onde `completed_at > whatsapp_recovery_15min_sent_at`.
2. Forçar uma execução da função e confirmar nos logs que aparecem skips `already_paid_*` para checkouts onde o usuário já pagou em outra sessão.
