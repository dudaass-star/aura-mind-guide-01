## Próximos passos sugeridos

Agora que os 7 templates Meta estão alinhados e os 3 recovery/reconnect caem automaticamente no Twilio, faltam validações de ponta-a-ponta antes de virar a chave em produção.

### 1. Smoke test do fallback Meta→Twilio
- Forçar 1 usuário de teste com `whatsapp_provider = 'meta'`.
- Disparar manualmente:
  - `checkin` (deve sair via Meta — `cheking_7dias`)
  - `reconnect` (deve cair no Twilio automaticamente)
- Conferir em `failed_message_log` e nos logs da edge function que:
  - Meta respondeu 200 no checkin.
  - O fallback Twilio foi acionado no reconnect sem erro silencioso.

### 2. Validar variáveis de cada template Meta
Cada um dos 7 templates aprovados tem placeholders próprios (`{{1}}`, `{{2}}`...). Conferir no código de envio (`sendProactive` / chamadas específicas por categoria) se a ordem/quantidade de variáveis bate com o que está aprovado no Meta — divergência aqui causa erro 132000 silencioso.

Categorias a revisar:
- `cheking_7dias`
- `carta_mensal`
- `jornada_disponivel2`
- `sessao_inicio`
- `relatorio_semanal`
- `welcome`
- `pergunta_semanal`

### 3. Rollout controlado do provider Meta
- Hoje só usuário(s) de teste em `meta`. Definir critério para migrar em lote (ex.: novos cadastros primeiro, depois ativos).
- Manter Twilio como default até o smoke test passar 100%.

### 4. Observabilidade
- Adicionar contador no admin (ou query salva) de envios Meta vs Twilio nas últimas 24h, para acompanhar o rollout sem precisar abrir logs.

### 5. Documentação
- Atualizar `mem://technical/whatsapp/integration-provider-status` quando o rollout Meta começar de fato (hoje ainda diz "100% Twilio gateway, Meta webhook latente").

---

**Pergunta antes de eu detalhar qualquer um:** quer que eu comece por qual?
1. Smoke test (eu monto o script de disparo + checagem de logs)
2. Auditoria de variáveis dos 7 templates (eu leio o código de envio e comparo com o Meta)
3. Widget de observabilidade Meta vs Twilio no admin
4. Outro / combinar
