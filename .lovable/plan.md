## Objetivo

Capturar payloads reais de cliques em botões de templates Twilio enviados ao seu WhatsApp (5551981519708) para confirmar os nomes exatos dos campos (ex: `OriginalRepliedMessageSid`, `ButtonText`, `ButtonPayload`) **antes** de implementar a arquitetura final de detecção determinística.

## Escopo desta fase (instrumentação + teste real)

### 1. Migração — tabela de debug

Criar tabela `webhook_payload_debug`:
- `id` (uuid)
- `received_at` (timestamptz)
- `from_phone` (text)
- `payload` (jsonb) — body completo do webhook
- `headers` (jsonb)

Sem RLS pública (apenas service role). Tabela temporária, removida após análise.

### 2. Instrumentação do webhook

Atualizar `supabase/functions/webhook-twilio/index.ts`:
- No início do handler, **se `From` contém `5551981519708`**, gravar payload completo + headers em `webhook_payload_debug`.
- Filtro restrito ao seu telefone para não poluir tabela com tráfego de outros usuários.
- Não altera nenhum comportamento existente — apenas adiciona o log paralelo.

### 3. Disparo dos templates de teste

Criar edge function temporária `debug-send-test-templates`:
- Envia 2 templates Quick Reply para 5551981519708:
  - `pergunta_semanal` (HXb9a483e...)
  - `carta_mensal` (HXceafbac...)
- Espaçados em alguns segundos.

### 4. O que você faz

1. Recebe os 2 templates no WhatsApp
2. **Clica nos botões** (em ambos)
3. Manda também 1 mensagem de texto livre depois pra comparar
4. Me avisa "feito"

### 5. Análise

Eu leio `webhook_payload_debug` e te mostro:
- Estrutura exata do payload de clique (campos `OriginalRepliedMessageSid`, `ButtonText`, `ButtonPayload`, `OriginalRepliedMessageSender` etc.)
- Comparação clique vs texto livre
- Confirmação se a abordagem determinística (via `OriginalRepliedMessageSid` + `ButtonText`) é viável com os dados que o Twilio realmente envia

### 6. Limpeza

Após análise, próximo plano remove:
- Função `debug-send-test-templates`
- Bloco de log condicional no webhook
- Tabela `webhook_payload_debug`

E aí sim implementamos a arquitetura final (`delivers_content_type` na tabela de templates + handler determinístico no webhook).

## Detalhes técnicos

- Templates já existem e estão aprovados (memo `mem://technical/whatsapp/approved-template-sids`)
- Envio via `sendProactive` / Twilio Gateway (padrão estabelecido)
- Filtro por telefone garante isolamento dos dados de teste
- Nenhum código em produção é afetado — apenas adições não-destrutivas

## Não está no escopo desta fase

- Implementar a tabela `template_definitions` com `delivers_content_type`
- Refatorar handler do webhook para detecção de cliques
- Remover heurística atual

Tudo isso vem **depois** da confirmação dos campos reais.