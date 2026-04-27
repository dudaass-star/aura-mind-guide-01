## Objetivo

Substituir a heurística atual de "janela curta + regex de aceite" (que falha quando o usuário só clica no botão e o texto é "Acessar"/"Ver pergunta") por **detecção determinística** baseada nos campos `MessageType: "button"` + `ButtonText` + `OriginalRepliedMessageSid` que o Twilio já envia.

A análise dos payloads reais (ver logs `webhook-twilio` 27/abr 14:50–14:59) confirmou que TODOS os campos necessários chegam.

## Escopo

### 1. Migração — tabela `template_definitions`

Tabela canônica de "qual template entrega qual conteúdo". Substitui hardcode espalhado.

```sql
CREATE TABLE public.template_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL UNIQUE,        -- 'pergunta_semanal', 'carta_mensal'
  content_sid   TEXT NOT NULL UNIQUE,        -- 'HXb9a483...', 'HXceafbac...'
  button_text   TEXT NOT NULL,               -- 'Ver pergunta', 'Acessar' (case-insensitive match)
  delivers_content_type TEXT NOT NULL,       -- 'weekly_question' | 'monthly_letter' (extensível)
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.template_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on template_definitions"
  ON public.template_definitions FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Admins can read template_definitions"
  ON public.template_definitions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
```

**Seed inicial** (via insert tool, não migration):
- `pergunta_semanal` / `HXb9a483e0198cc7e7f72b020189abe036` / `Ver pergunta` / `weekly_question`
- `carta_mensal` / `HXceafbac381ff480f30c0461ce09a31ad` / `Acessar` / `monthly_letter`

### 2. Captura do MessageSid no envio dos templates

Hoje os templates são enviados via `sendProactive` → Twilio retorna o `sid` da mensagem (formato `MMxxxx...`). Precisamos persistir esse SID no registro do conteúdo para poder casar depois com `OriginalRepliedMessageSid`.

Adicionar coluna em duas tabelas:

```sql
ALTER TABLE public.weekly_questions
  ADD COLUMN trigger_message_sid TEXT;          -- SID do template Quick Reply enviado

ALTER TABLE public.monthly_letters
  ADD COLUMN trigger_message_sid TEXT;          -- SID do template Quick Reply enviado

CREATE INDEX idx_weekly_questions_trigger_sid ON public.weekly_questions(trigger_message_sid)
  WHERE trigger_message_sid IS NOT NULL;
CREATE INDEX idx_monthly_letters_trigger_sid ON public.monthly_letters(trigger_message_sid)
  WHERE trigger_message_sid IS NOT NULL;
```

Ajustar quem dispara os templates (`send-weekly-question`, `generate-monthly-letter` ou onde o template é enviado) para gravar o SID retornado pelo Twilio em `trigger_message_sid`.

### 3. Refatoração do `process-webhook-message`

Substituir o bloco "ENTREGA CONTEXTUAL — janela curta + heurística de aceite" (linhas ~370–518) por:

```
Se body.MessageType === 'button':
  1. Lookup em template_definitions WHERE button_text ILIKE ButtonText AND is_active
     → obtém delivers_content_type
  2. Switch em delivers_content_type:
     - 'weekly_question': busca weekly_questions WHERE trigger_message_sid = OriginalRepliedMessageSid
       AND delivered_at IS NULL → entrega question_text, marca delivered_at
     - 'monthly_letter':  busca monthly_letters WHERE trigger_message_sid = OriginalRepliedMessageSid
       AND delivered_at IS NULL → entrega preview_text, marca delivered_at
  3. Fallback (se trigger_message_sid não bater por algum motivo legado):
     usa a busca atual por user_id + janela 24h
  4. NÃO roda mais o aura-agent para essa mensagem (clique de botão = comando determinístico,
     não conversação). Apenas registra a captura analítica no weekly_questions.response_text
     se aplicável (continua útil pra próxima resposta de texto livre).

Se body.MessageType !== 'button':
  fluxo normal atual (sem heurística de aceite).
```

O webhook-twilio precisa propagar 2 campos novos no payload do worker:
```ts
const workerPayload = {
  ...existing,
  messageType: body.MessageType,                    // 'button' | 'text' | etc.
  buttonText: body.ButtonText,                      // se for clique
  originalRepliedMessageSid: body.OriginalRepliedMessageSid,
};
```

### 4. Cleanup da instrumentação de debug

- Remover bloco de log condicional em `webhook-twilio/index.ts` (filtro 5551981519708 + insert em `webhook_payload_debug`).
- Remover arquivo `supabase/functions/debug-send-test-templates/index.ts`.
- Remover entrada `[functions.debug-send-test-templates]` em `supabase/config.toml`.
- Migration: `DROP TABLE webhook_payload_debug`.

### 5. Não está no escopo

- Migrar `welcome`, `weekly_report`, `jornada_disponivel` para o mesmo padrão (eles seguem fluxos próprios; podem ser migrados depois caso queira unificar).
- Refatorar `whatsapp_templates` (continua sendo a fonte canônica para envio; `template_definitions` é a fonte para *interpretação de cliques*).

## Ordem de execução (após aprovação)

1. Migration: criar `template_definitions`, `+trigger_message_sid` em weekly_questions/monthly_letters, drop `webhook_payload_debug`.
2. Seed `template_definitions` (insert tool).
3. Atualizar callers (`send-weekly-question`, generator da carta mensal) para gravar `trigger_message_sid`.
4. Atualizar `webhook-twilio` (propagar campos + remover debug).
5. Refatorar `process-webhook-message` (handler determinístico + remover heurística).
6. Remover `debug-send-test-templates` + entrada `config.toml`.
7. Verificar build / sem erros TS.

## Riscos e mitigação

- **Templates já enviados antes do deploy** não terão `trigger_message_sid` gravado → fallback para a busca por `user_id + janela 24h` (mantida só pra esses casos legados, com limite de 24h).
- **ButtonText divergente** (admin renomeia botão sem atualizar tabela) → match `ILIKE` + log de warning quando `MessageType=button` mas nenhum template_definition bate; fallback para fluxo normal de conversação.
