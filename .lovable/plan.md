

# Sessão só encerra por decisão explícita do usuário

## Problema

Hoje existem 3 formas de encerrar uma sessão antes dos 45 min:

1. **`wantsToEndSession()`** — frases explícitas como "encerrar sessão", "terminar por aqui" ✅ correto
2. **`detectsImplicitSessionEnd()`** — palavras como "perfeito", "obrigado", "combinado" em mensagens curtas ❌ **isso está errado** — essas palavras são parte normal de uma conversa
3. **`timeInfo.isOvertime`** — sessão passou dos 45 min ✅ correto

O item 2 é o que causou o encerramento da Clara aos 30 min. Ela provavelmente disse algo como "perfeito" e o sistema interpretou como despedida.

Além disso, quando o usuário diz "preciso sair" / "tenho que ir", isso NÃO existe nem em `wantsToEndSession` nem em `detectsImplicitSessionEnd` — ou seja, esse cenário de "pausar e continuar depois" não é tratado.

## Mudanças planejadas

### 1. Remover `detectsImplicitSessionEnd` completamente

Essa função é a causa raiz do problema. Palavras como "obrigado", "perfeito", "combinado" são normais no meio de uma sessão. A sessão só deve encerrar quando:
- O usuário **pedir explicitamente** para encerrar (`wantsToEndSession`)
- A sessão entrar em **overtime** (>45 min)

Remover a função e todas as suas chamadas (~linhas 1482-1511, 2760-2766, 2800-2807, 3729-3737).

### 2. Adicionar detecção de "preciso sair" como **pausa**, não encerramento

Criar uma nova função `wantsToPauseSession()` que detecta frases como:
- "preciso sair", "tenho que ir", "preciso ir"
- "continuamos depois", "continua outro dia", "a gente continua"
- "não consigo continuar agora"

Quando detectada, em vez de finalizar a sessão:
- Salvar um **resumo de contexto** na sessão (`session_summary` com prefixo `[PAUSADA]`)
- Manter a sessão como `in_progress` (não finalizar)
- Instruir a Aura via `dynamicContext` a se despedir acolhedoramente e confirmar que continuam de onde pararam

### 3. Na retomada, carregar contexto da sessão pausada

Quando o usuário voltar e tiver uma sessão `in_progress` pendente, o sistema já detecta isso (orphan session). Adicionar instrução no `dynamicContext` para retomar o assunto quando a sessão foi pausada (verificar se `session_summary` começa com `[PAUSADA]`).

### 4. Manter o hard block mais simples

Com a remoção do `detectsImplicitSessionEnd`, o hard block (linhas 3820-3846) continua protegendo contra a IA colocar `[ENCERRAR_SESSAO]` em fases early. Mas agora também deve resetar `shouldEndSession = false` quando bloqueia a tag (bug identificado anteriormente).

## Resumo de impacto

| Antes | Depois |
|---|---|
| "Perfeito" aos 30 min → sessão encerra | "Perfeito" aos 30 min → conversa continua normalmente |
| "Preciso sair" → não tratado | "Preciso sair" → sessão pausada com contexto salvo |
| Sessão pausada → retomada sem contexto | Sessão pausada → retomada com resumo do que foi discutido |
| Hard block remove tag mas flag `shouldEndSession` permanece true | Hard block reseta o flag também |

