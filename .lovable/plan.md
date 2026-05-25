## Reorientação do diagnóstico

Aceitando tuas restrições:
- Janela 24h é grátis → conta principal **não pode** ser a fonte do gasto contínuo.
- Recovery de checkout deve ser **2x por usuário (15min + 24h) — fim**.
- O gasto é **diário desde início de maio**, então não é o pico isolado de 20/05 do recovery (recovery escalou bem depois).

Indícios novos do banco:
- `zapi_message_dedup` saltou de 83 em 25/04 para **700–960 entradas/dia** durante maio. Volume cai junto com a queda de mensagens da Aura nos últimos dias.
- `instance_health_logs`: instância Z-API marcada **disconnected 288x/dia** (todo poll de 5min), mas `alert_sent=0`. Z-API está fora do ar o mês inteiro.
- Memória do projeto diz "100% Twilio gateway, Meta webhook latent" — mas os secrets `ZAPI_TOKEN`, `ZAPI_INSTANCE_ID`, `ZAPI_CLIENT_TOKEN` continuam ativos e a dedup tabela só cresce.

Hipótese forte: **algum caminho ainda chama Z-API e, quando falha, faz fallback automático para Twilio**, ou pior, manda **pelos dois**. Combinado a webhook Meta + Twilio recebendo inbound em paralelo, gera tarifa fixa diária mesmo sem ninguém clicar.

## Plano de ação (build mode)

### Etapa A — Auditar TODO caminho de saída WhatsApp (1ª prioridade)
Rodar `rg` em `supabase/functions/_shared/` e `supabase/functions/*` procurando:
- Quem importa `zapi-client`, `twilio-client`, `whatsapp-official`, `sendProactive`.
- Quem ainda chama `Z-API` URL (`api.z-api.io`).
- Onde há fallback `Twilio → Z-API` ou `Z-API → Twilio` que possa estar disparando **duplicado**.

Resultado entregue como tabela: `função → gateway usado → quando dispara → volume estimado/dia`.

### Etapa B — Corrigir o recovery do jeito que você definiu
Reescrever `recover-abandoned-checkout-whatsapp`:
- **2 envios por telefone NA VIDA** (15min + 24h), independente de quantos `checkout_sessions`/`asaas_payments` o lead criar.
- Dedup por telefone normalizado em **todo o estágio** antes de processar (Stripe + PIX juntos).
- Para `wa_stage_*_failed`: marcar permanentemente como `phone_failed_lifetime` (não retentar — confirma tua tese de que Twilio cobra mesmo quando Meta rejeita).
- Backfill: marcar `*_sent_at = now() + last_error='cleanup: phone_lifetime_cap'` para qualquer linha pendente cujo telefone já recebeu ≥2 wa_*_sent ou ≥1 wa_*_failed.

### Etapa C — Pedido objetivo para você no console Twilio
Sem o CSV do console eu não consigo nomear o SKU exato. Preciso de **uma coisa só**:
1. Twilio Console → **Monitor → Logs → Messaging** → filtrar últimos 7 dias.
2. Exportar CSV (ou screenshot da tabela com colunas `Date, From, To, Status, Direction, Price, ErrorCode`).
3. Me manda — eu cruzo `From`/`To` com nossos telefones e te digo exatamente qual função do projeto está mandando.

Alternativa mais rápida: **Twilio Console → Usage → Usage Records → últimos 30 dias, agrupar por `Category` (`messaging-outbound`, `messaging-inbound`, `messaging-mms`, `conversations-*`)** e me mostra a tela. Em 30 segundos eu identifico se é template, conversation fee, ou inbound de webhook.

### Etapa D — Kill switch enquanto investigamos
Adicionar `system_config.twilio_recovery_enabled` e `system_config.zapi_send_enabled`. Default `true`. Se você suspeitar, desativa por SQL e o cron pula tudo no próximo ciclo. Custo zero, reversível.

### Etapa E — Cost audit dashboard (depois que identificarmos a fonte)
Tab `/admin/whatsapp-recovery` ganha cards: "Envios por gateway × dia", "Telefones com >2 envios na vida", "Falhas Twilio/Meta separadas por errorCode". Aí você enxerga novo pico assim que aparecer.

## O que eu **não** vou fazer sem tua confirmação
- Desligar Z-API completamente (pode estar servindo algum fluxo legítimo).
- Mexer no `aura-agent` ou em qualquer prompt.
- Mudar templates aprovados Meta.

## Próximo passo
Sai do plan mode e eu começo pela **Etapa A + B + D** em paralelo (auditoria de gateways + correção recovery + kill switch). A Etapa C depende de você puxar a tela do Twilio Console — manda assim que tiver e eu fecho o diagnóstico.
