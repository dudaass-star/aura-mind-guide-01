# Resolver 63027 — estratégia real via duplicação de templates

## Contexto confirmado
- Templates `aura_recuperacao` (`HX7ae71f9002839ec0ecdc58f6aa067a8a`) e `aura_recuperacao_24hs` (`HXb34b27fda2f45a0c10fc19960bac61c1`)
- Tipo: Call to Action com botão **estático** para checkout, sem variável dinâmica no botão
- Ambos aparecem como **Approved** no Twilio Content API
- A tela do Twilio não permite “Submit for WhatsApp approval” novamente no template já aprovado; só permite **Duplicate**
- Erro 63027 continua sendo rejeição da Meta no envio, não problema de renderização do corpo pelo Twilio

## Diagnóstico ajustado
Como não existe reenvio de aprovação para o mesmo Content SID, o caminho operacional é:

1. Duplicar `aura_recuperacao`
2. Duplicar `aura_recuperacao_24hs`
3. Submeter os duplicados para aprovação no WABA/sender atual
4. Depois de aprovados, trocar os Content SIDs usados no cron de recuperação

## Plano

### 1. Criar novos templates duplicados no Twilio
- Duplicar `aura_recuperacao`
- Duplicar `aura_recuperacao_24hs`
- Manter texto, CTA e URL estática iguais
- Submeter os duplicados para WhatsApp approval

### 2. Após aprovação, atualizar os SIDs no backend
Arquivo provável:
- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`

Trocar:
- SID antigo 15min → novo SID duplicado aprovado
- SID antigo 24h → novo SID duplicado aprovado

### 3. Retestar envio real
- Rodar teste de recuperação para `+51981519708`
- Verificar status da mensagem até sair de `queued/sent` para `delivered` ou erro final

### 4. Reabilitar entregas falhas
Depois de confirmar entrega com os novos SIDs:
- Resetar `whatsapp_recovery_15min_sent_at` e/ou `whatsapp_recovery_24h_sent_at` para checkouts pós-cutoff que falharam com `63027`
- Assim o cron tenta reenviar no próximo ciclo

## Arquivos afetados depois que os novos SIDs existirem
- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts`
- Migration pontual para resetar tentativas falhas