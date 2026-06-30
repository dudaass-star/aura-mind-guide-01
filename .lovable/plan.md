## Dunning WhatsApp via Twilio (template HXaf4af1e1f5d4cf40b6fff6b5b68df29a)

Disparar WhatsApp de recuperação para usuários com falha de pagamento (Stripe cartão + Asaas PIX Automático Bacen), usando o mesmo número/subaccount da recuperação de checkout abandonado, até 2x por usuário/ciclo, casado com Smart Retries.

### 1. Helper compartilhado
Novo arquivo `supabase/functions/_shared/dunning-whatsapp.ts`:
- Função `sendDunningWhatsApp({ profile, token, attemptNumber, eventId, provider, invoiceId })`
- Constante `DUNNING_CONTENT_SID = "HXaf4af1e1f5d4cf40b6fff6b5b68df29a"`
- Monta link `https://olaaura.com.br/pagamento?t=<token>` (variável `{{2}}` = token)
- `{{1}}` = primeiro nome do profile (fallback "tudo bem")
- Reusa `sendRecoveryTemplate` de `_shared/twilio-recovery-client.ts` (subaccount já isolada do número da Aura, secrets `TWILIO_RECOVERY_*` já existem)
- Garante token em `user_portal_tokens` (upsert) antes de enviar
- Idempotência: confere `dunning_attempts` por `(profile_user_id, event_id)` e limite global de 2 envios WhatsApp por subscription/payment ativa
- Loga em `dunning_attempts` com novos campos (`provider`, `channel='whatsapp'`, `template_sid`, `message_sid`, `attempt_number`, `event_id`)

### 2. Migration — `dunning_attempts`
Adicionar colunas (nullable):
- `channel text` (`whatsapp` | `email`)
- `provider text` (`stripe` | `asaas`)
- `template_sid text`
- `message_sid text`
- `attempt_number int`
- `payment_id text` (id do Asaas)
Index parcial em `(profile_user_id, channel)` para a query de contagem.

### 3. Stripe — `invoice.payment_failed`
Em `supabase/functions/stripe-webhook/index.ts` (handler já existente):
- Após resolver profile, gerar/garantir token e link
- Chamar `sendDunningWhatsApp` em paralelo ao fluxo de email atual
- Manter Smart Retries intactos (cadência: até 2 envios WhatsApp ao longo das tentativas de retry — 1º no primeiro `payment_failed`, 2º no próximo se ainda `past_due`)

### 4. Asaas — `PAYMENT_OVERDUE` (PIX Automático Bacen)
Em `supabase/functions/webhook-asaas/index.ts`:
- No evento `PAYMENT_OVERDUE` (cobre PIX recorrente e fallback de cartão Asaas), resolver profile por `customer`/`subscription`
- Disparar `sendDunningWhatsApp` com `provider='asaas'`, `invoiceId=payment.id`
- Mesma regra de até 2 envios por subscription

### 5. `/pagamento?t=...` — extensão do `customer-portal`
Em `supabase/functions/customer-portal/index.ts`:
- Se não achar customer Stripe, buscar último `asaas_payments` do user com status `OVERDUE`/`PENDING`
- Se houver, retornar `{ url: invoice_url }` (link da fatura Asaas / PIX Copia-e-Cola)
- Se não houver nada em nenhum provider, mensagem clara

### 6. Painel admin
Em `src/pages/AdminEngagement.tsx`, separar visualmente "Dunning Email" de "Dunning WhatsApp" usando a nova coluna `channel` (sem mexer em lógica de negócio).

### 7. Memória do projeto
Salvar `mem://features/recovery/dunning-whatsapp.md` com: template SID, link, limite 2x, cobertura Stripe + Asaas, idempotência por `(user_id, event_id)`, subaccount Twilio compartilhada com recuperação de carrinho.

### Detalhes técnicos
- **Quiet hours**: dunning é transacional/utility → NÃO respeita quiet hours (igual estágio 15min do carrinho)
- **Cadência**: até 2 envios por ciclo de cobrança, espaçados pelos próprios eventos do provider (Smart Retries no Stripe, retries do Asaas/Bacen). Sem cron próprio.
- **Variáveis confirmadas**: `{{1}}` = primeiro nome, `{{2}}` = token UUID (não a URL inteira — o template já tem o prefixo `https://olaaura.com.br/pagamento?t=` no botão). **Preciso confirmar com você se `{{2}}` é só o token ou a URL completa** — depende de como o template foi montado no Twilio.

### Pergunta pendente
A variável `{{2}}` no template HXaf4af1e1f5d4cf40b6fff6b5b68df29a é **só o token** (o resto da URL está fixo no template) ou é **a URL completa** `https://olaaura.com.br/pagamento?t=<token>`? Vou assumir URL completa se não responder, já que é o padrão dos outros templates de recuperação.
