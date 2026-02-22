

# Logging de Tokens Reais no aura-agent

## Objetivo
Capturar e registrar o consumo real de tokens (prompt_tokens, completion_tokens, total_tokens) de todas as chamadas de IA no `aura-agent`, criando uma baseline de custos reais antes de qualquer otimizacao.

## O que muda

### 1. Nova tabela: `token_usage_logs`
Armazena o consumo de cada chamada de IA com contexto suficiente para analise.

Colunas:
- `id` (uuid, PK)
- `user_id` (uuid, nullable) - usuario associado
- `function_name` (text) - sempre "aura-agent" por agora
- `call_type` (text) - "main_chat", "session_summary", "onboarding_extraction", "topic_extraction"
- `model` (text) - modelo usado (ex: "google/gemini-2.5-pro")
- `prompt_tokens` (integer) - tokens de entrada
- `completion_tokens` (integer) - tokens de saida
- `total_tokens` (integer) - total
- `created_at` (timestamptz, default now())

RLS: apenas service_role tem acesso (dados internos de monitoramento).

### 2. Mudancas no `aura-agent/index.ts`

**Chamada principal (linha ~3488):** Apos `const data = await response.json()`, extrair `data.usage` e logar:
```
console.log('TOKEN_USAGE main_chat:', JSON.stringify(data.usage));
```
Inserir registro na tabela `token_usage_logs`.

**Chamada de resumo de sessao (linha ~4052):** Mesma extracao de `usage` do `summaryData`.

**Chamada de onboarding (linha ~4146):** Mesma extracao de `usage` do `onboardingData`.

**Chamada de topic extraction (linha ~4184):** Mesma extracao de `usage` do `topicData`.

### 3. Funcao auxiliar

Criar uma funcao `logTokenUsage()` que recebe os parametros e faz o insert + console.log de forma padronizada, para nao repetir codigo em 4 lugares.

```typescript
async function logTokenUsage(
  supabase: any,
  userId: string | null,
  callType: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
) {
  if (!usage) {
    console.warn('No usage data in API response for', callType);
    return;
  }
  console.log(`TOKEN_USAGE [${callType}]: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}`);
  
  await supabase.from('token_usage_logs').insert({
    user_id: userId,
    function_name: 'aura-agent',
    call_type: callType,
    model: model,
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 0,
  });
}
```

## O que NAO muda
- Comportamento da AURA (zero impacto nas respostas)
- Fluxo da conversa
- Nenhuma dependencia nova

## Como consultar os dados depois

Exemplos de queries para analisar custos:

```sql
-- Media de tokens por tipo de chamada
SELECT call_type, 
  AVG(prompt_tokens) as avg_input, 
  AVG(completion_tokens) as avg_output,
  COUNT(*) as total_calls
FROM token_usage_logs
GROUP BY call_type;

-- Custo estimado por usuario (ultimos 30 dias)
SELECT user_id, 
  SUM(prompt_tokens) as total_input,
  SUM(completion_tokens) as total_output,
  COUNT(*) as messages
FROM token_usage_logs
WHERE created_at > now() - interval '30 days'
GROUP BY user_id
ORDER BY total_input DESC;
```

## Resultado esperado
Apos implementar, cada mensagem processada pelo aura-agent vai gerar logs com os tokens reais, permitindo calcular o custo exato por mensagem, por usuario e por tipo de chamada.
