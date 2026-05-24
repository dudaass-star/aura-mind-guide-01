# Resolver 63027 — confirmar variáveis reais e ajustar

## Contexto confirmado
- Templates `aura_recuperacao` (HX7ae71f...) e `aura_recuperacao_24hs` (HXb34b27...)
- Tipo: Call to Action com botão **estático** (URL fixa de checkout, sem `{{n}}`)
- Erro Meta 63027 persiste com payload `{"1": "Gustavo"}`

## Hipóteses restantes
1. **Template tem header com variável** (ex: header text/media com `{{1}}`), e o body usa `{{2}}` — desalinhando a numeração.
2. **Template registrado na Meta tem 0 variáveis** — o "Oi {{1}}" no preview é literal/escapado, e mandar `{"1": "..."}` causa "extra parameter".
3. **Body tem 2+ variáveis** que o preview não mostrou claramente (ex: "Oi {{1}}, ... {{2}}").

## Plano

### 1. Inspecionar templates via Content API
Rodar `POST /test-whatsapp-recovery-status` (endpoint já existe com `inspectTemplate`) para cada SID:
- `{"contentSid":"HX7ae71f9002839ec0ecdc58f6aa067a8a"}`
- `{"contentSid":"HXb34b27fda2f45a0c10fc19960bac61c1"}`

Ler do JSON retornado:
- `types` (todos os tipos registrados: `twilio/text`, `twilio/call-to-action`, `whatsapp/card`, etc.)
- `body` exato de cada tipo
- `variables` (mapa oficial declarado no template)
- `actions[].url` (confirmar que é estática)

### 2. Decidir ajuste baseado na verdade
- **Se `variables` estiver vazio** → mandar `ContentVariables` vazio (`{}`) ou omitir. Atualizar cron pra não enviar variáveis.
- **Se header tiver `{{1}}` e body `{{2}}`** → mandar `{"1": name, "2": name}` ou conforme o que cada um espera.
- **Se body tem N variáveis** → preencher todas.

### 3. Aplicar no cron de produção
`supabase/functions/recover-abandoned-checkout-whatsapp/index.ts` → ajustar payload de `sendRecoveryTemplate` conforme descoberta. Igual pros dois estágios (15min e 24h) se os templates forem simétricos.

### 4. Retestar e validar
- `POST /test-whatsapp-recovery` para +51981519708
- `POST /test-whatsapp-recovery-status` → confirmar `delivered`

### 5. Reabilitar entregas falhas
Migration UPDATE: zerar `whatsapp_recovery_15min_sent_at` / `whatsapp_recovery_24h_sent_at` em checkouts pós-cutoff com `whatsapp_recovery_last_error LIKE '%63027%'` pra reentregar no próximo ciclo.

## Arquivos afetados
- `supabase/functions/recover-abandoned-checkout-whatsapp/index.ts` (payload)
- 1 migration de reset
- Sem mudanças nos templates Twilio
