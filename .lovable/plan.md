## Diagnóstico revisado

Acatando a observação do usuário: o problema pode não ser de código, e sim de runtime/secrets. Há um sinal forte disso nos logs:

- O código atual em `supabase/functions/aura-agent/index.ts` (linhas 4154-4170) já emite um log estruturado de Unauthorized com `hasAuthHeader`, `hasInternalHeader`, `hasInternalSecret`, `hasServiceRoleEnv`.
- Nos logs do `aura-agent` em produção, nenhuma linha contém `hasInternal` nem `hasAuthHeader`. Só aparece a mensagem antiga `🚫 Unauthorized request to aura-agent` sem objeto.

Conclusão: o `aura-agent` está rodando uma build antiga. O deploy mais recente não chegou no runtime, ou está usando cache de uma versão anterior. Por isso qualquer mudança de header feita no `process-webhook-message` continua batendo num check antigo.

## Plano em 2 fases — diagnóstico primeiro, hotfix depois

### Fase 1 — Provar o estado real do runtime

1. Forçar redeploy explícito de `aura-agent` e `process-webhook-message`.
2. Disparar um `curl` direto contra `/aura-agent` com 3 headers de teste inválidos (valores quaisquer) só para fazer o handler logar o objeto de diagnóstico.
3. Buscar nos logs por `hasInternalSecret`. Os 3 cenários possíveis:
   - **Aparece o log novo** → deploy ok, e o objeto vai mostrar exatamente quais secrets existem no runtime.
   - **Não aparece** → deploy não propagou. Tentar novo deploy ou abrir suporte de Cloud.
   - **Aparece mas com `hasInternalSecret: false`** → confirma a hipótese do usuário: secret não está injetado no runtime do `aura-agent`. Próximo passo é forçar reinjeção (re-salvar a secret) e/ou abrir suporte.
4. Em paralelo, fazer um teste com headers reais conforme sugerido:

   ```
   curl -X POST .../functions/v1/aura-agent \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "X-Internal-Auth: $INTERNAL_WEBHOOK_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"probe":true}'
   ```

   Se ainda 401 com headers válidos → confirma problema de runtime, não de código.

### Fase 2 — Hotfix de auth (só se Fase 1 mostrar que o deploy chegou)

Aplicar então o ajuste defensivo no `aura-agent` para aceitar qualquer um destes três caminhos:

- `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- `apikey: <SUPABASE_SERVICE_ROLE_KEY>`
- `X-Internal-Auth: <INTERNAL_WEBHOOK_SECRET>`

E enviar os três simultaneamente a partir do `process-webhook-message`. Manter o log estruturado de flags booleanas (sem vazar segredos).

### Fase 3 — Validação

1. Curl sem credencial → 401 esperado.
2. Curl com headers válidos → não deve mais ser 401.
3. Mensagem WhatsApp real de teste → procurar `🤖 Agent response:` em `process-webhook-message`.
4. Confirmar que `aura-agent` para de logar `Unauthorized request` para mensagens novas.

## Por que essa ordem importa

Se pular direto para o hotfix sem provar a Fase 1, e o problema for realmente de secrets não injetados, o hotfix não vai resolver — vamos só empilhar mudanças de código sobre uma falha de ambiente. A Fase 1 leva poucos minutos e elimina ambiguidade.

## Não relacionado / pendente

- Mensagem manual de retomada para a Beatriz: pendente, depende da Aura voltar a responder.
- Bugs 2/3/4 (títulos de templates) já estão no código e não causaram esse incidente.