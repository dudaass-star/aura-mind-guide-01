## Trava de execução + cobertura Asaas no suporte

Hoje o fluxo de aprovação em `AdminSupport.tsx` envia o **email primeiro** e depois tenta a ação no Stripe — se a ação falha, o cliente já recebeu a promessa. Além disso, `support-execute-action` e `support-agent` só conhecem Stripe, ignorando clientes PIX/Asaas.

### 1. Backend — `support-execute-action/index.ts`

Adicionar dois novos `action.type`:

- **`refund_asaas_payment`** — params: `asaas_payment_id` (obrigatório). Chama `POST {ASAAS_API}/payments/{id}/refund` com `access_token: ASAAS_API_KEY`. Base URL conforme `ASAAS_ENV` (`api-sandbox.asaas.com/v3` ou `api.asaas.com/v3`).
- **`cancel_asaas_subscription`** — params: `asaas_subscription_id` (obrigatório). Chama `DELETE {ASAAS_API}/subscriptions/{id}`. Após sucesso, atualiza `profiles.status = 'canceled'` se houver `profile_user_id`.

Ambos seguem o padrão atual: `success/errorMessage` capturados no try/catch e registrados em `support_ticket_actions` (action_type, success, error_message, response_payload).

### 2. Backend — `support-agent/index.ts`

- Estender o `enum` de `suggested_action.type` (linha ~285) com `refund_asaas_payment` e `cancel_asaas_subscription`.
- Atualizar o catálogo de ações no prompt (linha ~49) descrevendo quando usar cada uma (cliente PIX = usar variantes Asaas; cartão = Stripe).
- Injetar no contexto do ticket o `asaas_customer_id` e a última cobrança PIX do cliente (lookup em `profiles` + `asaas_payments` por email), igual já é feito hoje para Stripe.

### 3. Frontend — `src/pages/AdminSupport.tsx` (`handleApproveSend`)

Implementar a trava agnóstica de provedor:

```text
CRITICAL = [
  "refund_invoice", "pause_subscription", "change_plan", "cancel_subscription",
  "refund_asaas_payment", "cancel_asaas_subscription"
]
```

Novo fluxo:

1. Se `executeAction && draft.suggested_action.type ∈ CRITICAL`:
   - Executar `support-execute-action` **primeiro**.
   - Se falhar → toast vermelho "Ação X falhou — email NÃO enviado. Corrija manualmente ou desmarque Executar.", manter ticket aberto, sair sem enviar.
   - Se ok → seguir para envio do email.
2. Caso contrário (ação não-crítica como `send_portal_link`/`none`, ou checkbox desmarcado): manter ordem atual (email primeiro, ação best-effort depois).

### Escopo / fora de escopo

- **Dentro**: 3 arquivos acima.
- **Fora**: mudanças visuais no card de ações, webhook Asaas, novos tipos de ação além de refund/cancel PIX, alterações no `admin-engagement-metrics`.