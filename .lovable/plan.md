

## Ação: enviar template de welcome para Lorena

Vou usar o template de boas-vindas (não o `cheking_7dias`) já que ela é uma usuária nova que nunca interagiu, não uma reativação de 7 dias.

### Verificação rápida que vou fazer antes

Preciso confirmar qual `template_category` mapear no `whatsapp_templates`. Pelas memórias temos 3 templates aprovados no Twilio:
- `cheking_7dias`
- `jornada_disponivel`
- `aura_weekly_report_v2`

**Não há template "welcome" aprovado** na lista atual. Então tenho 2 caminhos:

### Opção A — usar `cheking_7dias` com mensagem de boas-vindas customizada
- Template aprovado e disponível
- Texto/variável `{{1}} = Lorena`
- Funciona imediatamente

### Opção B — verificar se existe template welcome na tabela `whatsapp_templates` 
- Se existir um ContentSid mapeado para `welcome` (mesmo que não esteja na memória), uso ele
- Se não existir, caio na Opção A

## Plano de execução

1. **Query rápida** em `whatsapp_templates` pra ver quais categorias estão cadastradas (incluindo possível `welcome`)
2. **Disparar** via `admin-send-message`:
   - phone: `5522998482133`
   - user_id: (o da Lorena)
   - template_category: `welcome` se existir, senão `cheking_7dias`
   - message: texto explicando que a AURA mudou de número e dando boas-vindas
3. **Confirmar** o `messageSid` retornado pela Twilio
4. **Reportar** o resultado pra você

## Não vou fazer

- Não vou corrigir `whatsapp_instance_id` NULL agora
- Não vou investigar dunning falso-positivo agora
- Não vou ajustar `plan_expires_at` agora

Esses ficam pra ações seguintes depois que confirmarmos que ela recebeu a mensagem.

