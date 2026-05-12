## Status da remoção dos CTAs de upsell

Verifiquei o `aura-agent/index.ts` linha por linha e nas funções vizinhas (`instagram-agent`, `_shared`). Resultado:

### O que está OK ✅
- **Prompt**: bloco "PLANOS — REGRA INVIOLÁVEL DE NÃO-VENDA" (linhas 2801-2811) está claro: proibido vender, proibido emitir `[UPGRADE:*]` / `[UPGRADE_REFUSED:*]`, e se o usuário perguntar → redireciona ao `/meu-espaco`.
- **Cota Essencial esgotada** (linhas 5812-5825): só honestidade, sem upsell, redireciona ao painel.
- **Sessões disponíveis** (linhas 5795-5810): bloqueia regressão para "peça upgrade".
- **Pós-processamento** (linhas 6244-6257): se LLM driftar e emitir `[UPGRADE:*]`, a tag é descartada silenciosamente com `console.warn` — nenhum link de checkout é gerado.
- **`stripAllInternalTags`** (linha 100): catch-all já remove `[UPGRADE:*]` mesmo se passar.
- **`VALID_AURA_TAGS`** (linha 56): mantém `UPGRADE`/`UPGRADE_REFUSED` na whitelist apenas para evitar falso-positivo no log de "tags inventadas" — comportamento correto.
- **Sem callers**: `processUpgradeTags` e `shouldSuggestUpgrade` não são mais chamados em lugar nenhum (`rg` confirmou).
- **Outras funções**: `instagram-agent` e `_shared/*` não tem nenhuma referência a upsell/upgrade.
- **Logs últimas 4h**: `failed_message_log` zerado — nada quebrou.

### O que falta ajustar 🧹

**1. Código morto a remover** (`aura-agent/index.ts`):
- `processUpgradeTags` (linhas 3926-4009) — definida mas nunca chamada.
- `createShortLink` (linhas 3894-3924) — usada **só** dentro de `processUpgradeTags`. Vira código morto também.

Remover ambas em um único patch. Risco zero (sem callers).

**2. Atualizar o log de descarte** (opcional, linhas 6250-6257):
- Adicionar insert fire-and-forget em `failed_message_log` com `function_name='aura-agent:upsell_tag_discarded'` para termos rastreabilidade dos drifts do LLM (hoje só `console.warn`). Útil para medir se o prompt está segurando.

### Validação pós-mudança
- Rodar testes Deno (`phase_thresholds_test.ts`).
- Deploy do `aura-agent`.
- Monitorar `failed_message_log` por 24h em busca de:
  - `function_name='aura-agent:upsell_tag_discarded'` (drift do LLM)
  - qualquer `error` novo apontando para `processUpgradeTags`/`createShortLink` (não deve aparecer).

### Arquivos afetados
- `supabase/functions/aura-agent/index.ts` (1 patch: deletar 2 funções mortas + opcionalmente adicionar insert de log)

### Fora de escopo
- Re-revisar o prompt de venda — já está coerente.
- Mexer em checkout, Stripe, ou landing — nada disso era CTA da Aura.
