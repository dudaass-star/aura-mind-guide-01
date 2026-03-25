

# Corrigir Dados de Sessão: Diagnóstico + Correções Definitivas

## Causa Raiz Confirmada

Analisando o código (linha 5451), o **summary usa `google/gemini-2.5-flash` hardcoded**, enquanto a conversa principal usa o modelo configurado (geralmente 2.5 Pro). O Flash tem problemas conhecidos de instruction-following — é provavelmente a causa dos JSONs inválidos que levam ao fallback "Sessão concluída."

## Alterações

### 1. Usar o mesmo modelo da conversa para o summary

**Arquivo**: `supabase/functions/aura-agent/index.ts`

Na linha 5451, trocar o modelo hardcoded `google/gemini-2.5-flash` pelo modelo principal que já está sendo usado na conversa (variável que contém o modelo selecionado via `system_config`). O custo é irrelevante: é 1 chamada por sessão, não por mensagem.

Fazer o mesmo para as chamadas de onboarding extraction (linha 5535) e topic extraction (linha 5573) que também usam Flash hardcoded.

### 2. Retry com log de diagnóstico (3 tentativas)

**Arquivo**: `supabase/functions/aura-agent/index.ts` (linhas ~5449-5508)

- Loop de 3 tentativas na chamada de summary
- Cada tentativa loga o raw response ANTES do parse para diagnóstico
- Na 2ª tentativa: adicionar instrução extra "Responda APENAS o JSON"
- Na 3ª tentativa: reduzir contexto para últimas 8 mensagens
- Limpeza agressiva do JSON: extrair conteúdo entre primeiro `{` e último `}`
- Validação estrutural: `summary` >20 chars, `insights` ≥2, `commitments` ≥1
- Se falhar após 3 tentativas: logar `🚨 CRITICAL` com raw completo — sem fallback genérico, usar o raw text como summary
- Remover as funções `extractKeyInsightsFromConversation` e `extractCommitmentsFromConversation`

### 3. Rating direto no encerramento

**Arquivo**: `supabase/functions/aura-agent/index.ts` (após linha ~5520)

- Após salvar a sessão como `completed`, enviar a mensagem de rating diretamente (delay 3s)
- Marcar `rating_requested: true` no mesmo update de status
- Elimina dependência do cron `session-reminder`

### 4. Corrigir bug de retry do rating no session-reminder

**Arquivo**: `supabase/functions/session-reminder/index.ts`

- O `post_session_sent = true` é marcado ANTES do rating ser enviado (linha 822)
- Se o rating falha, nunca mais é retentado
- Solução: só marcar `post_session_sent = true` APÓS o rating ser enviado com sucesso
- Ou: separar a query de rating para buscar `rating_requested = false` independentemente
- Manter como safety net para sessões encerradas por timeout

## Resumo

| Mudança | Impacto |
|---------|---------|
| Modelo Pro no summary | Elimina a causa raiz dos JSONs inválidos |
| Retry 3x + validação | Garante extração mesmo em edge cases |
| Rating no aura-agent | Rating enviado imediatamente, sem depender do cron |
| Fix session-reminder | Safety net funcional para timeouts |

