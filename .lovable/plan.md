## Objetivo

Resolver o bug que impede a Aura de responder usuários cancelados (caso Jéssica) e implementar uma estratégia completa de winback (reativo + proativo) para recapturar receita.

## Escopo

- **Dentro**: branch `subscription_blocked` em `process-webhook-message`, novo cron de winback proativo, instrumentação/logs, copy segmentada por motivo de cancelamento.
- **Fora**: prompt da Aura, sessões, checkout, `webhook-twilio`, `stripe-webhook` (exceto hook de `recovered_at`).

---

## Parte 1 — Corrigir o bug do winback reativo

**Arquivo**: `supabase/functions/process-webhook-message/index.ts` (linhas 437–471, branch `subscription_blocked`)

Hoje o worker morre silenciosamente: a Jéssica mandou "Oi" (20/05) e "Iniciar" (27/05), nenhuma mensagem foi persistida em `messages` nem em `failed_message_log`.

Mudanças:

1. **Try/catch em volta de `createShortLink`** com fallback para `https://olaaura.com.br/checkout` (suspeita principal da falha silenciosa).
2. **Try/catch externo no branch inteiro** gravando em `failed_message_log` (`function_name: 'process-webhook-message:subscription_blocked'`) qualquer exceção não tratada.
3. **`console.log` antes/depois** de `createShortLink` e `sendMessage` para diagnóstico futuro.
4. **Persistir a mensagem da Aura** em `messages` (`role: 'assistant'`) quando `sendMessage` retornar sucesso — hoje não persiste, então o histórico fica vazio.
5. **Rate-limit reativo**: 1 winback reativo a cada 7 dias por usuário, usando novo campo `last_winback_reactive_sent_at` em `profiles` (evita spam se o usuário mandar várias mensagens).

## Parte 2 — Copy segmentada por motivo de cancelamento

No mesmo branch, escolher a mensagem com base em `profiles.payment_failed_at`:

- **Dunning** (`payment_failed_at IS NOT NULL`): foco em "seu pagamento falhou, atualize o cartão" + link de checkout. Tom prático.
- **Cancelamento ativo** (`payment_failed_at IS NULL`): foco em "senti sua falta" + convite empático + link. Tom afetivo.

Ambas terminam com o short link de reativação.

## Parte 3 — Winback proativo (novo cron)

**Nova edge function**: `winback-canceled-users` (cron diário 10h BRT).

Seleciona `profiles.status = 'canceled'` em três janelas após o cancelamento (usando `updated_at` ou novo campo `canceled_at` se existir):

- **D+3**: "Senti sua falta nesses dias. Tudo bem por aí?" + link
- **D+14**: lembrete mais leve, reforça benefício de continuidade + link
- **D+30**: última tentativa, opcionalmente com cupom de desconto + link

**Idempotência**: novos campos em `profiles`:
- `winback_d3_sent_at`
- `winback_d14_sent_at`
- `winback_d30_sent_at`

**Guardrails** (reutilizar lógica existente do `sendProactive`):
- Quiet hours 22h–08h BRT
- Não envia se houver sessão ativa ou interação recente (<24h)
- Usa subconta Twilio de recovery (`TWILIO_RECOVERY_*`) para isolar risco de ban
- Template aprovado (precisa criar/usar Content SID novo `winback_canceled`)

**Tracking**: log em `failed_message_log` para falhas; sucesso vira `recovery_messages` (direction: `outbound`).

## Parte 4 — Migration

Adicionar em `profiles`:
```sql
ALTER TABLE public.profiles
  ADD COLUMN last_winback_reactive_sent_at timestamptz,
  ADD COLUMN winback_d3_sent_at timestamptz,
  ADD COLUMN winback_d14_sent_at timestamptz,
  ADD COLUMN winback_d30_sent_at timestamptz;
```

## Parte 5 — Hook de reconversão

Em `stripe-webhook` (quando assinatura volta a `active` após estar `canceled`): setar `profiles.converted_at = now()` e zerar os 4 campos de winback acima — permite que o ciclo recomece se cancelar de novo no futuro.

## Parte 6 — Observabilidade

- Dashboard admin já existente: adicionar contadores simples de "winbacks enviados (reativo/proativo) últimos 30d" e "reconvertidos pós-winback" (join entre `winback_*_sent_at` e `converted_at`).

---

## Ordem de execução

1. Migration (campos novos em `profiles`)
2. Fix do branch `subscription_blocked` + copy segmentada (resolve Jéssica imediatamente)
3. Hook de reset no `stripe-webhook`
4. Cron `winback-canceled-users` + template Twilio
5. Métricas no admin

## Validação

- Após deploy do Passo 2: reenviar "Oi" manualmente em conta de teste cancelada e confirmar resposta + entrada em `messages` + (se falhar) entrada em `failed_message_log`.
- Após 24–48h: revisar logs para identificar a causa raiz original da morte silenciosa do worker.
- Após 1 semana do cron: revisar taxa de resposta e reconversão por janela (D+3 / D+14 / D+30) para calibrar copy e cupom.
