

## IA de Suporte por Email — Painel com Aprovação Humana

### Como vai funcionar

```text
Cliente manda email pra suporte@olaaura.com.br (Locaweb)
        ↓
[Cron a cada 2 min] Edge function lê IMAP da Locaweb
        ↓
Cria ticket no banco (com email original + anexos como links)
        ↓
[support-agent] Gemini 2.5 Pro:
  • Classifica (categoria + severidade)
  • Busca contexto: profile, Stripe (assinatura/faturas), últimas msgs WhatsApp
  • Gera rascunho de resposta em PT-BR (tom Aura)
  • Sugere ação: cancelar / pausar / reembolsar / link portal / nenhuma
        ↓
Você abre /admin/suporte → revisa → 3 opções:
  ✅ Aprovar → envia via SMTP Locaweb (mantém thread) + executa ação Stripe
  ✏️  Editar texto/ação → envia o que você ajustou
  ❌ Rejeitar → escreve resposta manual do zero, sem ação
        ↓
Resposta sai DE suporte@olaaura.com.br via SMTP Locaweb
(Reply-To, In-Reply-To, References preservados — thread intacta no Gmail do cliente)
```

### O que a IA faz (rascunho + ação sugerida)

**Categorias:** `dúvida_técnica`, `cancelamento`, `pausa`, `reembolso`, `cobrança_falhou`, `bug`, `troca_plano`, `elogio`, `outro`

**Severidades:** `baixa` (FAQ) | `média` (cobrança/troca) | `alta` (reembolso, jurídico, ameaça pública)

**Ações estruturadas que ela pode sugerir:**
- `none` — só responder
- `send_portal_link` — gera link `/meu-espaco` via `user_portal_tokens`
- `send_stripe_billing_portal` — link de gestão Stripe
- `cancel_subscription` — chama função existente `cancel-subscription`
- `pause_subscription` — registra pausa em `cancellation_feedback`
- `refund_invoice` — Stripe refund (com valor sugerido)
- `retry_payment` — reaproveita `attach-checkout-payment-methods`
- `change_plan` — upgrade/downgrade

Toda ação executa só após **confirmação dupla** sua + grava em `support_ticket_actions` (auditoria: quem, quando, payload, resposta Stripe).

### Painel `/admin/suporte`

Layout 3 colunas (segue padrão do `/admin/mensagens` que já existe):

- **Esquerda — Fila:** badges 🔴 Urgente | 🟡 Aguardando | 🟢 Respondido | ⏸ Snooze. Filtros por status/categoria/plano. Realtime via Supabase.
- **Centro — Thread:** email original com headers, anexos como links de download (Storage), histórico de respostas, contexto do cliente colapsável (plano, status Stripe, últimas faturas, últimas 10 msgs WhatsApp).
- **Direita — Painel de ação:** rascunho editável (`Textarea`), ação sugerida com toggle, botões: ✅ Aprovar e Enviar | ✏️ Editar | ❌ Rejeitar | ⏸ Snooze | 🔄 Regenerar rascunho.

Acesso: mesma RLS do `/admin/usuarios` — `has_role(auth.uid(), 'admin')`.

### Estrutura técnica

**Tabelas novas (RLS admin-only via `has_role`):**

- `support_tickets` — id, customer_email, subject, status (`pending_review` / `approved` / `replied` / `manual` / `snoozed` / `closed`), category, severity, profile_user_id (FK soft pra `profiles.user_id`), imap_message_id, in_reply_to, references, snooze_until, created_at, updated_at
- `support_ticket_messages` — ticket_id, direction (`inbound` / `outbound`), from_email, to_email, body_text, body_html, headers (jsonb), attachments (jsonb com paths do Storage), created_at
- `support_ticket_drafts` — ticket_id, ai_model, draft_body, suggested_action (jsonb), context_snapshot (jsonb), generated_at, regenerated_count
- `support_ticket_actions` — ticket_id, action_type, payload (jsonb), executed_by (admin user_id), executed_at, stripe_response (jsonb), success, error_message

**Storage bucket novo:** `support-attachments` (privado, RLS admin-only)

**Edge functions novas:**

1. **`support-imap-poll`** — cron a cada 2 min. Conecta IMAP Locaweb (`imap.locaweb.com.br:993` SSL), lê não-lidos de `suporte@olaaura.com.br`, salva ticket + mensagem + anexos no Storage, marca como lido. Usa `npm:imapflow` + `npm:mailparser`.
2. **`support-agent`** — invocada após cada inbound novo. Gemini 2.5 Pro com tool calling: retorna `{category, severity, draft_response, suggested_action}`. Busca contexto via SQL (profiles, Stripe subs/invoices via API com `STRIPE_SECRET_KEY`, últimas msgs).
3. **`support-execute-action`** — invocada quando admin aprova. Valida `executed_by` (JWT admin), executa ação no Stripe / gera link / etc., grava em `support_ticket_actions`, retorna resultado.
4. **`support-send-reply`** — envia via SMTP Locaweb (`smtp.locaweb.com.br:465` SSL) usando `npm:nodemailer`. Preserva headers `In-Reply-To` + `References` pra manter thread no Gmail do cliente. Marca ticket como `replied` e cria `support_ticket_messages` outbound.
5. **`support-regenerate-draft`** — chama `support-agent` de novo opcionalmente com hint do admin ("mais empático", "mais técnico").

**Frontend:** página nova `src/pages/AdminSupport.tsx` + rota `/admin/suporte` em `App.tsx` + link no menu admin (igual aos outros).

**Secrets necessários (vou pedir depois do plano aprovado):**
- `LOCAWEB_IMAP_USER` (= `suporte@olaaura.com.br`)
- `LOCAWEB_IMAP_PASSWORD` (senha da caixa)
- `LOCAWEB_SMTP_HOST` (default `email-ssl.com.br` — você confirma)
- `LOCAWEB_IMAP_HOST` (default `imap.locaweb.com.br` — você confirma)

### Fora de escopo desta entrega
- Notificação proativa (você disse que olha todo dia — fica pra fase 2)
- Auto-aprovação de FAQ (depois de 30 dias de calibração)
- Métricas de tempo médio de resposta / dashboard de suporte (fase 2)

### Entregáveis nesta sprint
1. Migration: 4 tabelas + bucket Storage + RLS
2. 5 edge functions novas + cron IMAP a cada 2 min
3. Página `/admin/suporte` completa com realtime
4. Pedido de 4 secrets Locaweb (IMAP + SMTP)
5. Configuração `verify_jwt` apropriada em `config.toml` para as funções

