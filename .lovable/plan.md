

# Análise da Implementação Teaser + Link — Problemas Encontrados

## O que está OK

1. **Página `/episodio/:id`** — Criada corretamente, rota registrada no App.tsx, HelmetProvider configurado, RLS de `journey_episodes` permite SELECT público.
2. **`generate-episode-manifesto`** — Gera teaser + short link quando `generate_teaser: true` é passado. Lógica correta.
3. **`whatsapp-official.ts`** — `sendProactiveMessage` aceita `teaserText` e usa no template quando fora da janela.
4. **Domínio no allowlist** — `aura-mind-guide-01.lovable.app` já está na lista do `create-short-link`.

---

## Problemas Encontrados (3 itens)

### 1. `periodic-content` NÃO usa o teaser (CRÍTICO)

O `periodic-content/index.ts` (que é quem realmente envia os episódios) **não passa `generate_teaser: true`** na chamada ao `generate-episode-manifesto` e **não passa o teaser** para o envio. Além disso, ele usa diretamente `sendTextMessage` (Z-API) em vez de `sendProactive` do provider abstrato.

**Correção:**
- Passar `generate_teaser: true` na chamada ao `generate-episode-manifesto`
- Quando o provider for `official`, usar `sendProactive` passando o teaser como parâmetro
- Atualizar `sendProactive` em `whatsapp-provider.ts` para aceitar e repassar `teaserText`

### 2. `whatsapp-provider.ts` → `sendProactive` NÃO repassa o `teaserText`

A função `sendProactive` chama `sendProactiveMessage` mas **não aceita nem repassa** o parâmetro `teaserText`. O teaser ficaria perdido.

**Correção:**
- Adicionar parâmetro `teaserText?: string` à assinatura de `sendProactive`
- Repassar para `sendProactiveMessage(phone, text, templateCategory, userId, teaserText)`

### 3. `test-episode-send` não testa o fluxo teaser

O `test-episode-send/index.ts` não passa `generate_teaser` e usa Z-API diretamente. Deveria ter a opção de testar o fluxo oficial também.

**Correção:** Menor prioridade, mas adicionar suporte a `generate_teaser` e provider selection.

---

## Plano de Correção

### Arquivo 1: `supabase/functions/_shared/whatsapp-provider.ts`
- Adicionar `teaserText?: string` como parâmetro de `sendProactive`
- Repassar para `sendProactiveMessage(..., teaserText)`

### Arquivo 2: `supabase/functions/periodic-content/index.ts`
- Importar `sendProactive` do `whatsapp-provider.ts`
- Na chamada a `generate-episode-manifesto`, passar `generate_teaser: true`
- Usar `sendProactive` em vez de `sendTextMessage` para envio de episódios
- Passar `manifestoResult.teaser` como `teaserText` quando disponível
- Manter fallback para Z-API quando necessário (já tratado pelo provider)

### Arquivo 3: `supabase/functions/test-episode-send/index.ts` (opcional)
- Adicionar parâmetro `generate_teaser` no body
- Permitir teste via provider oficial

