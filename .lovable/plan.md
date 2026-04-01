

# Diagnóstico: Pixels de Conversão Meta Parados

## Problemas Identificados

### 1. CRITICO: `event_source_url` com domínio errado no CAPI
**Arquivos:** `supabase/functions/stripe-webhook/index.ts` (linhas 341 e 568)

Os eventos CAPI `StartTrial` e `Purchase` estão sendo enviados com:
```
event_source_url: 'https://aura-mind-guide-01.lovable.app/obrigado'
```
O domínio correto de produção é `olaaura.com.br`. Meta pode rejeitar ou não atribuir eventos cujo `event_source_url` não corresponde ao domínio configurado no Pixel.

**Correção:** Alterar para `https://olaaura.com.br/obrigado` em ambas as ocorrências.

### 2. InitiateCheckout CAPI sempre ignorado (sem PII)
**Arquivo:** `src/pages/Checkout.tsx` (linhas 96-111)

O evento `InitiateCheckout` via CAPI é enviado no `useEffect` da página, **antes** do usuário preencher nome/email/telefone. O `user_data` só tem `client_user_agent` e cookies opcionais (`fbp`/`fbc`). Como a edge function `meta-capi` exige pelo menos um PII forte (email, phone ou first_name), o evento é **sempre ignorado** server-side.

**Impacto:** Sem deduplicação CAPI do InitiateCheckout. Não é crítico porque o browser pixel cobre, mas reduz o Match Quality Score.

**Correção possível:** Mover o envio CAPI do InitiateCheckout para o momento do `handleSubmit` (quando já temos nome, email e telefone).

### 3. Browser Pixel desabilitado na /obrigado (intencional mas sem fallback)
**Arquivo:** `index.html` (linhas 25-39)

O script do Pixel verifica `window.location.pathname !== '/obrigado'` e **não carrega o fbq** nessa rota. Isso é intencional para evitar Purchase duplicado. Porém, o `autoConfig: false` no ThankYou.tsx tenta desabilitar algo que já não foi carregado.

**Impacto:** Nenhum direto — Purchase só vai por CAPI (correto). Mas se o CAPI falhar (problema 1), não há fallback nenhum.

### 4. META_ACCESS_TOKEN pode estar expirado
O secret `META_ACCESS_TOKEN` existe, mas tokens de acesso Meta expiram. Se o token expirou, **todos** os eventos CAPI estão falhando silenciosamente (o webhook retorna 200 mesmo assim).

**Verificação necessária:** Checar os logs da edge function `meta-capi` ou testar manualmente.

## Plano de Correção

### Passo 1 — Corrigir `event_source_url` no stripe-webhook
**Arquivo:** `supabase/functions/stripe-webhook/index.ts`
- Linha 341: `'https://aura-mind-guide-01.lovable.app/obrigado'` → `'https://olaaura.com.br/obrigado'`
- Linha 568: `'https://aura-mind-guide-01.lovable.app/obrigado'` → `'https://olaaura.com.br/obrigado'`

### Passo 2 — Mover CAPI InitiateCheckout para o submit (com PII)
**Arquivo:** `src/pages/Checkout.tsx`
- Remover a chamada CAPI do `useEffect` (manter apenas o browser pixel lá)
- Adicionar chamada CAPI no `handleSubmit`, após validação, com `email`, `phone` e `first_name`

### Passo 3 — Verificar META_ACCESS_TOKEN
- Confirmar que o token não expirou (tokens de System User duram indefinidamente, tokens de User duram ~60 dias)

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | Corrigir `event_source_url` (2 ocorrências) |
| `src/pages/Checkout.tsx` | Mover CAPI InitiateCheckout para handleSubmit com PII |

