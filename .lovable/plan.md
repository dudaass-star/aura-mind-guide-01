# Encerramento de sessão — micro-agent dedicado `session-extractor`

## Confirmação: SIM, novo micro-agent

Será criada **uma nova edge function** chamada `session-extractor`, totalmente separada do `aura-agent`. Ela é a única responsável por extrair `session_summary`, `key_insights` e `commitments` de uma sessão encerrada.

Isso segue o padrão já consolidado no projeto (memória `Workflow agêntico`: "Main agent + Flash-lite extractor + async analysis") e usa o mesmo mecanismo `EdgeRuntime.waitUntil` que o `aura-agent` já usa nas linhas 7427-7441 para o micro-agent atual e o post-analysis.

## Quem faz isso hoje (problema)

- **`aura-agent/index.ts` linhas ~6517-6688** faz a extração inline no mesmo handler que respondeu o usuário.
- Usa **Gemini 2.5 Pro** (caro, lento) com **JSON puro** (frágil, parse manual com regex).
- Loop de 3 retries; se todas falharem, grava `completed` com `summary=""` e `commitments=[]`.
- Bloqueia a resposta do `aura-agent` (até ~6s extras) e compete por contexto/cache.

**Evidência no banco** (últimos 14 dias): das 11 sessões `completed`, **só 1** tem `commitments`; existe sessão `completed` com summary vazio gerando warning no `session-reminder` há dias.

## Arquitetura nova

```text
[aura-agent] detecta [ENCERRAR_SESSAO]
    │
    ├─► marca session=completed (sem summary ainda)
    ├─► limpa profile.current_session_id
    ├─► envia despedida ao usuário (resposta normal)
    └─► EdgeRuntime.waitUntil(invoke('session-extractor', {session_id}))
              │
              ▼
    [session-extractor] (novo micro-agent)
        - lê mensagens da sessão direto do DB
        - chama Gemini 2.5 Flash via Lovable AI Gateway
        - usa TOOL CALLING (JSON Schema) — sem parse manual
        - grava session_summary, key_insights, commitments
```

## Detalhes do `session-extractor`

- **Endpoint**: `supabase/functions/session-extractor/index.ts`
- **Input**: `{ session_id: string }`
- **Modelo**: `google/gemini-2.5-flash` via Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`)
- **Tool calling estruturado** com `tool_choice` forçado (esquema idêntico ao já validado em `session-reminder/generateSessionSummaryFallback` linhas 50-86):
  ```text
  parameters: { summary, key_insights[], commitments[{title}] }
  ```
- **Prompt clínico**: migra o prompt detalhado de extração de compromissos que está hoje em `aura-agent` linhas 6546-6605 (regras de aceite minimalista "💜", exemplos reais). Não muda uma vírgula da lógica clínica.
- **Idempotente**: pode ser chamado N vezes pra mesma `session_id` — sempre sobrescreve os 3 campos.
- **Sem retry-loop**: tool calling com schema garantido = funciona na primeira. Se falhar 1 vez, registra erro estruturado e o `session-reminder` re-dispara no próximo ciclo.
- **`config.toml`**: adicionar bloco `[functions.session-extractor]` com `verify_jwt = false` (chamada interna).

## Alterações nos arquivos existentes

### `aura-agent/index.ts`
- Remove ~160 linhas (6520-6676): todo o loop de 3 tentativas com JSON puro.
- Mantém: detecção de `[ENCERRAR_SESSAO]`, atualização de `status='completed'`, limpeza de `current_session_id`, lógica de `onboarding_completed`, agendamento de próxima sessão.
- Adiciona: `supabase.functions.invoke('session-extractor', { body: { session_id } })` dentro do `EdgeRuntime.waitUntil` que já existe na linha 7436.

### `session-reminder/index.ts`
- Remove a função local `generateSessionSummaryFallback` (linhas 13-119) — sua lógica vai pro micro-agent.
- Linha 676 (`⚠️ No summary for completed session`): em vez de só logar, **invoca `session-extractor` uma vez** e segue. Isso quebra o loop infinito que vemos hoje na sessão `64a45e2b`.
- Linha 571 (sessão abandonada com 5+ msgs): **invoca `session-extractor`** em vez da função local.
- Linha 569-587 (sessões abandonadas com 2-4 msgs `no_show`): também invoca o extractor pra gerar summary real em vez de texto fixo de 60 chars.

### Memória
Atualiza `mem://technical/session/data-integrity-and-ratings`:
- De: "Pro model 3-retry loop for JSON extraction"
- Para: "Dedicated `session-extractor` micro-agent (Flash + tool calling), invoked async via waitUntil"

## Teste

`supabase/functions/session-extractor/index_test.ts`: cria sessão fake com mensagens conhecidas (incluindo aceite "💜"), invoca o micro-agent, verifica que os 3 campos são populados e que `commitments.length >= 1` quando há aceite explícito.

## Arquivos afetados

```text
NEW   supabase/functions/session-extractor/index.ts
NEW   supabase/functions/session-extractor/index_test.ts
EDIT  supabase/functions/aura-agent/index.ts          (remove ~160 linhas, adiciona 1 invoke)
EDIT  supabase/functions/session-reminder/index.ts    (remove fallback local, 3 invokes)
EDIT  supabase/config.toml                            (registra a nova função)
EDIT  mem://technical/session/data-integrity-and-ratings
```

## Por que isso não precisa de fallback

1. **Tool calling > JSON puro**: o schema é validado pelo provider Gemini. Não há "JSON quebrado".
2. **Flash > Pro pra extração estruturada**: é o caso de uso ideal de Flash, alinhado ao roster da memória Core.
3. **Fora do hot path**: se demorar 5s ou 50s, o usuário não percebe — já recebeu a despedida.
4. **Auto-recuperação**: o `session-reminder` (que roda periodicamente) re-dispara para qualquer sessão `completed` ainda sem summary. Sem loop infinito, sem fallback genérico.

## O que NÃO muda

- Tags `[ENCERRAR_SESSAO]`, `[AGENDAR_SESSAO]`, `[REAGENDAR_SESSAO]` — contratos preservados.
- Fase 1 (Limiares Clínicos) e Fase 2 (Postura Clínica).
- Prompt clínico de extração de compromissos — migra inalterado.
- Lógica de `no_show` vs `cancelled` vs `completed` no `session-reminder`.
- Fluxo da despedida da Aura ao usuário.
