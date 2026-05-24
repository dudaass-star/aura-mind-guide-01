## Objetivo
Substituir o número WhatsApp da subaccount de recuperação de checkout abandonado de +15559875290 para +19123014009.

## Mudança
- **Secret:** `TWILIO_RECOVERY_FROM` → atualizar valor para `+19123014009`
- **Código:** Nenhuma alteração necessária — o número é lido dinamicamente do secret em `supabase/functions/_shared/twilio-recovery-client.ts` (linha 37)

## Passo a passo
1. Usar `update_secret` para redefinir `TWILIO_RECOVERY_FROM` com o novo número.
2. O `twilio-recovery-client.ts` já lê o valor em runtime e formata com prefixo `whatsapp:` automaticamente (linha 44).

## Resultado esperado
Próxima execução da edge function `recover-abandoned-checkout-whatsapp` enviará mensagens a partir do novo número.