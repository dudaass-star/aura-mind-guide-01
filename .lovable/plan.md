# Configurar templates `carta_mensal` e `pergunta_semanal` na AURA

## Como funciona hoje (sem mudar)

Padrão "trigger + deliver" — o template Quick Reply é só um **gatilho curto com botão**. Quando o usuário clica/responde, abre a janela de 24h e o `process-webhook-message` envia o conteúdo rico em **texto livre**:

- **Pergunta da Semana**: usuário clica → webhook envia a pergunta gerada pela IA (`weekly_questions.question_text`).
- **Carta Mensal**: usuário clica → webhook envia o **preview** da carta (`monthly_letters.preview_text`). A carta completa fica acessível via portal/link incluído no preview gerado pela IA.

Esse fluxo já está implementado e correto em `process-webhook-message/index.ts` (linhas 372–474). Não vamos mexer nele.

## O problema que estamos corrigindo

Os templates gatilho usados hoje são **emprestados** (porque os dedicados não existiam ainda):

| Função | Template gatilho atual | Problema |
|---|---|---|
| `send-weekly-question` | `cheking_7dias` (texto puro check-in 7d) | Genérico, sem botão, sem contexto de "pergunta" |
| `generate-monthly-letter` | `aura_weekly_report_v2` (teaser de relatório semanal) | Errado: usuário recebe "relatório semanal" e na verdade vai vir uma carta |

Os templates aprovados agora resolvem isso — Quick Reply, contexto certo.

| Template novo | ContentSid | Tipo |
|---|---|---|
| `pergunta_semanal` | `HXb9a483e0198cc7e7f72b020189abe036` | Quick Reply |
| `carta_mensal` | `HXceafbac381ff480f30c0461ce09a31ad` | Quick Reply |

## Mudanças

### 1. Migration — registrar os 2 templates novos em `whatsapp_templates`

```sql
INSERT INTO public.whatsapp_templates
  (category, template_name, twilio_content_sid, prefix, meta_category, is_active, language_code)
VALUES
  ('weekly_question','pergunta_semanal', 'HXb9a483e0198cc7e7f72b020189abe036', '', 'utility', true, 'pt_BR'),
  ('monthly_letter', 'carta_mensal',     'HXceafbac381ff480f30c0461ce09a31ad', '', 'utility', true, 'pt_BR');
```

(Vou ler 1 registro existente antes de aplicar para confirmar o valor real de `prefix`/`meta_category`/`language_code` e ajustar se algum default for diferente.)

### 2. `supabase/functions/send-weekly-question/index.ts` (linha 272)

```diff
- const result = await sendTemplateOnly(user.phone, 'checkin', user.user_id);
+ const result = await sendTemplateOnly(user.phone, 'weekly_question', user.user_id);
```
Atualizar comentários nas linhas 7–8 e 270.

### 3. `supabase/functions/generate-monthly-letter/index.ts` (linha 262)

```diff
- const sendResult = await sendTemplateOnly(user.phone, 'weekly_report', user.user_id);
+ const sendResult = await sendTemplateOnly(user.phone, 'monthly_letter', user.user_id);
```
Atualizar comentário da linha 9.

### 4. Memória — atualizar `mem://technical/whatsapp/approved-template-sids`

Adicionar as 2 novas linhas na tabela canônica (categorias `weekly_question` e `monthly_letter`). Manter `cheking_7dias` no papel original (check-in 7d / reativação) e `aura_weekly_report_v2` exclusivo do Weekly Report.

## Validação

- Disparar `send-weekly-question` para 1 usuário-teste → confirmar log `Sending "pergunta_semanal" (HXb9a483...)`. Clicar no botão no WhatsApp → confirmar que a pergunta gerada chega em texto livre.
- Disparar `generate-monthly-letter` para 1 usuário-teste → confirmar log `Sending "carta_mensal" (HXceafbac...)`. Clicar no botão → confirmar que o preview da carta chega em texto livre.
- `/admin/templates` mostra os 2 novos com `is_active=true`.

## O que NÃO muda

- Lógica do `process-webhook-message` (entrega da pergunta/preview ao receber resposta) — já está correta.
- `cheking_7dias` segue como template de check-in 7d e reativação.
- `aura_weekly_report_v2` segue exclusivo do Weekly Report.
- Geração da pergunta (IA) e da carta (IA + preview com link) — sem alteração.