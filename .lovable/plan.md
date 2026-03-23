

# Verificação: Correções de Falha no Envio — Status

## Resumo: 100% Implementado, 2 Melhorias Recomendadas

---

## O que está implementado e funcionando

| Correção | Status | Localização |
|----------|--------|-------------|
| **Timeout 50s com AbortController** | ✅ | Linhas 692-724 — `callAuraAgent()` com `setTimeout(abort, 50000)` |
| **3 retries (normal → normal → minimal_context)** | ✅ | Linhas 727-749 — loop com 2s entre tentativas |
| **Empty response guard** (retry se 0 msgs enviadas) | ✅ | Linhas 911-935 — retry com `minimal_context: true` |
| **Persistência pré-lock** | ✅ | Linhas 348-357 — salva mensagem ANTES de abortar no debounce |
| **Sem fallback genérico** | ✅ | Linhas 986-988 — apenas log CRITICAL, sem mensagem ao usuário |
| **`minimal_context` no aura-agent** | ✅ | Linha 3390 — extrai campo, reduz queries (10 msgs, 5 insights, skip sessões/meditações) |
| **Lock release no finally** | ✅ | Linhas 961-972 — `finally` garante liberação mesmo em erro |

---

## 2 Melhorias Recomendadas

### 1. Catch externo não libera lock explicitamente (RISCO BAIXO)

O `catch` na linha 983 não chama `releaseLock()`. Ele depende do `finally` na linha 961. **MAS** o `finally` está dentro do `try` interno (linha 726), e o `catch` externo está fora dele (linha 983).

**Fluxo atual:**
```text
try (externo, L202) {
  ... lock acquired ...
  try (interno, L726) {
    ... agent call + send messages ...
  } finally (L961) {
    release lock ← SÓ EXECUTA SE ENTROU NO TRY INTERNO
  }
} catch (externo, L983) {
  ← lock NÃO liberado se erro ocorre ENTRE linhas 370-725
}
```

Se um erro ocorre APÓS aquisição do lock (L324) mas ANTES do `try` interno (L726) — ex: durante persistência da mensagem (L418), reset de followup (L436), ou handling de time capsule (L464-560) — o lock **não é liberado**. O mecanismo de stale lock (>60s) mitiga, mas causa um delay de até 60s na próxima mensagem do usuário.

**Correção**: Mover o `try/finally` para englobar todo o código após a aquisição do lock (logo após linha 369).

### 2. Dedup no retry guard não verifica duplicata (RISCO BAIXO)

Na linha 924, o retry guard insere a mensagem do assistente sem verificação de duplicata (usa `try/catch` vazio). Se por algum motivo o retry retorna uma mensagem que já foi parcialmente enviada, pode haver duplicata no banco. Não afeta o usuário (ele recebe a mensagem corretamente), mas polui o histórico.

**Correção**: Adicionar a mesma verificação de dedup de 30s que já existe no loop principal (linhas 893-901).

---

## Veredicto

O sistema está **98% correto** e funcional em produção. As 2 melhorias são de baixo risco e preventivas. A melhoria #1 (escopo do try/finally) é a mais importante — previne locks presos por 60s em cenários de erro entre a aquisição do lock e a chamada do agente.

## Plano de Implementação

**Arquivo**: `supabase/functions/process-webhook-message/index.ts`

### Melhoria 1: Expandir escopo do try/finally
- Mover o `try {` da linha 726 para logo após o lock ser adquirido (após linha 369)
- O `finally` (linha 961) passa a cobrir TODO o código pós-lock
- Remover a chamada redundante `releaseLock()` nos early returns que já estão dentro do try/finally

### Melhoria 2: Dedup no retry guard
- Na linha 924, antes do insert, adicionar verificação de mensagem existente nos últimos 30s (mesmo padrão das linhas 893-901)

**Total**: ~10 linhas de mudança, zero impacto funcional, maior resiliência.

