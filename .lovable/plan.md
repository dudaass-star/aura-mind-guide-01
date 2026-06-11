## Objetivo

Ativar os 5 templates novos no número Meta `+1 555-958-6099` (WABA `4389879528007597`) sem variável de nome, deixando para uma fase futura a ressubmissão com `{{1}}` numerado. Investigar por que o teste retornou 132001 ("template não existe em pt_BR") mesmo com WABA correto.

## O que muda

### 1. Diagnóstico do 132001 (antes de qualquer migration)
Rodar `qa-meta-whoami` para confirmar que `META_WHATSAPP_PHONE_NUMBER_ID = 1102172772986795` pertence de fato ao WABA `4389879528007597`. Se não pertencer, o erro 132001 não é dos templates — é do env. Nesse caso paro e te aviso qual ID corrigir antes de seguir.

Se bater, rodo `qa-meta-list-templates` apontando para `4389879528007597` e confirmo que os 5 templates aparecem como `APPROVED` em `pt_BR` com 0 placeholders ativos (`{{}}` literal não conta).

### 2. Migration — mapear os 5 templates como zero-variável
Atualizar `whatsapp_templates`:

| category | meta_template_name | meta_variable_count | meta_variable_names | is_active |
|---|---|---|---|---|
| `welcome` | `welcome` | 0 | NULL | true |
| `session_start` | `sessao_inicio` | 0 | NULL | true |
| `content` (jornada) | `jornada_disponivel2` | 0 | NULL | true |
| `weekly_report` | `relatorio_semanal` | 0 | NULL | true |
| `monthly_letter` | `carta_mensal` | 0 | NULL | true |
| `checkin` | `cheking_7dias` | — | — | `is_active = false` (fica desligado até ser aprovado no novo número) |

A coluna `meta_variable_names` continua existindo (já foi criada na migration anterior) — fica `NULL` agora e volta a ser usada quando os templates forem ressubmetidos com `{{1}}`.

### 3. Validação no sender
O `meta-whatsapp-client.ts` já trata `meta_variable_count = 0` (envia template sem `components`). Não precisa mexer no código — só confirmar via teste real.

### 4. Teste por template
Rodar `test-meta-new-number` com `mode=template`, sem parâmetros, para os 5 nomes. Esperado: HTTP 200 + `wamid`. Você recebe as 5 mensagens no número `+55 51 98151-9708`.

Se algum voltar 132000 ("expected 0 parameters"), significa que aquele template específico tem `{{1}}` ativo no body — nesse caso eu te aviso qual e você decide se ressubmete ou troca o template.

### 5. Memória
Atualizar `mem://technical/whatsapp/approved-template-sids` (ou criar entrada nova) registrando: novo número Meta operacional, 5 templates ativos sem variável, plano de ressubmeter com `{{1}}` depois.

## Fora de escopo
- Não trocar `whatsapp_provider` em `system_config` (você decide quando virar a chave de Twilio → Meta).
- Não mexer em `cheking_7dias` enquanto não for aprovado no número novo.
- Não criar/ressubmeter templates — fica para depois, conforme você pediu.

## Pergunta única antes de implementar
A categoria `content` no banco mapeia para o template antigo `jornada_disponivel` (Twilio). Confirma que no Meta novo o nome aprovado é `jornada_disponivel2` (com o "2" no final)?  Se for só `jornada_disponivel`, ajusto o mapeamento antes de rodar.
