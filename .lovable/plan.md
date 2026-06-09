## Teste isolado do novo número Meta — só pro Eduardo (51981519708)

Twilio (`+1 662 525-5005`) segue como oficial e **não é tocado**. O novo número Meta (`+1 555-958-6099`, WABA `4389879528007597`, Phone Number ID `1102172772986795`) entra só em modo teste, restrito ao seu número.

### Estratégia

**Não** vou trocar os secrets globais `META_WHATSAPP_PHONE_NUMBER_ID` / `META_WHATSAPP_BUSINESS_ACCOUNT_ID` agora — se trocasse, qualquer fallback Meta→Twilio que rodar pra outros usuários iria sair pelo número novo sem querer.

Em vez disso, crio uma **edge function isolada de teste** que aponta direto pro Phone Number ID novo, usando o mesmo `META_WHATSAPP_ACCESS_TOKEN` (você confirmou que tem permissão nos dois WABAs).

### Passos

1. **Criar `supabase/functions/test-meta-new-number/index.ts`**
   - Chama `graph.facebook.com/v21.0/1102172772986795/messages` direto.
   - Hardcoded `to = 5551981519708` (whitelist defensivo: só aceita esse número, qualquer outro retorna 403). Evita disparo acidental.
   - Aceita body `{ mode: "template" | "freetext", template?: "cheking_7dias" | "jornada_disponivel" | "aura_weekly_report_v2", text?: string }`.
   - Loga `wamid`, status HTTP e corpo da resposta da Meta.

2. **Smoke tests via `supabase--curl_edge_functions`**:
   - **Teste 1 — Template fora de janela**: `{ mode: "template", template: "cheking_7dias" }` → deve chegar com nome "Aura" aprovado.
   - Aguardo você responder qualquer coisa no WhatsApp pra abrir janela 24h.
   - **Teste 2 — Free text dentro da janela**: `{ mode: "freetext", text: "teste janela aberta novo número" }` → deve chegar como texto livre.
   - **Teste 3 — Outros 2 templates**: `jornada_disponivel` e `aura_weekly_report_v2` pra confirmar que todos os 3 estão aprovados no WABA novo.

3. **Validação**:
   - Conferir nome do remetente no WhatsApp (deve ser "Aura").
   - Conferir logs por erro `132000` (variáveis), `100` (template não encontrado nesse WABA), `131030` (número não na allowlist do WABA novo).
   - Se template falhar por nome diferente, te aviso pra reaprovar ou mapear.

### O que NÃO faço agora

- Não mexo em `META_WHATSAPP_PHONE_NUMBER_ID` nem `META_WHATSAPP_BUSINESS_ACCOUNT_ID` (secrets globais ficam apontando pro número Meta antigo, que segue silencioso já que produção roda 100% Twilio).
- Não mexo em `meta-whatsapp-client.ts`, `whatsapp-provider.ts`, `sendProactive` ou qualquer fluxo de produção.
- Não toco no webhook Meta.
- Não mexo no Twilio oficial em nada.

### Plano de migração (próximo passo, depois que o teste passar)

Quando você confirmar que os 3 templates chegam como "Aura" no seu número, abrimos um plano separado pra:
- Trocar os 2 secrets globais pro Phone Number ID e WABA ID novos.
- Apontar webhook Meta do WABA novo pra `meta-whatsapp-webhook`.
- Decidir se Meta novo vira primário (com Twilio como fallback) ou continua só como fallback do Twilio.
- Arquivar o WABA antigo no Meta Business Manager.

### Rollback

Função de teste é isolada — basta deletar `test-meta-new-number/` que tudo volta ao normal. Zero risco pro fluxo atual.