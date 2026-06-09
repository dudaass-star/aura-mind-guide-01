## Objetivo
Desativar completamente o sistema **Pergunta da Semana** para eliminar risco de envio de perguntas com gramática quebrada ou sentido confuso geradas pelo LLM.

## Escopo do que será removido/desativado

### 1. Cron job (parar disparo automático)
- Remover/desabilitar o `cron.schedule` que invoca `send-weekly-question` toda terça 12h UTC.
- Verificar via `cron.job` quais entradas existem e dropar a relacionada.

### 2. Edge Function `send-weekly-question`
- **Opção escolhida**: deletar a function (`supabase/functions/send-weekly-question/`) e remover do `supabase/config.toml`.
- Mais limpo que deixar "morta" — evita disparo manual acidental pelo admin.

### 3. Fast-path de entrega no `process-webhook-message`
- Bloco que detecta clique no botão `Ver pergunta` (template `pergunta_semanal`) e entrega `weekly_questions.question_text`.
- Remover a lógica específica de weekly_questions, mantendo intacto o fast-path de `monthly_letters` e jornadas/weekly_report.

### 4. Seed em `template_definitions`
- Remover (ou marcar `is_active=false`) a linha `pergunta_semanal → Ver pergunta → weekly_question` para não reativar inadvertidamente.

### 5. Template Twilio `pergunta_semanal`
- **Manter aprovado na Twilio/Meta** (não dá pra "desaprovar" e custo zero parado).
- Marcar `whatsapp_templates.is_active = false` para não aparecer em UIs admin.

### 6. Tabela `weekly_questions`
- **Manter** com dados históricos (audit trail).
- Não dropar — barato e pode ser útil pra retro.

### 7. Atualizar memórias do projeto
- Atualizar `mem://features/whatsapp/trigger-and-deliver-pattern.md` removendo Pergunta da Semana da cobertura do fast-path.
- Atualizar `mem://technical/whatsapp/approved-template-sids` removendo referência ativa ao template.
- Atualizar `mem://index.md` se houver referência.

## Detalhes técnicos

```text
Cron (Postgres):     cron.unschedule('<nome_do_job_weekly_question>')
Config:              remover bloco [functions.send-weekly-question] de supabase/config.toml
Function:            rm -rf supabase/functions/send-weekly-question/
process-webhook-msg: remover branch de weekly_question dentro do isButtonClick handler
SQL:                 UPDATE template_definitions SET is_active=false WHERE content_type='weekly_question';
                     UPDATE whatsapp_templates SET is_active=false WHERE name='pergunta_semanal';
```

## O que NÃO será mexido
- `monthly_letters` (carta mensal) — segue ativa com seu próprio LLM e fast-path.
- Jornadas, Weekly Report, Sessões — independentes.
- Conteúdo histórico em `weekly_questions` — preservado.

## Verificação pós-implantação
1. `select * from cron.job where command ilike '%send-weekly-question%'` → vazio.
2. Chamar `supabase.functions.invoke('send-weekly-question')` → erro 404.
3. Simular clique no botão `Ver pergunta` (caso template legado seja reenviado por engano) → cai em conversa livre com Aura, sem tentar buscar weekly_question.
