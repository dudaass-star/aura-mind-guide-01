

# Implementar Meta Conversions API (CAPI) Server-Side

## O que é
A CAPI envia eventos de conversão diretamente do servidor para o Meta, sem depender do navegador. Isso melhora a precisão dos dados (não é bloqueado por ad blockers, iOS 14+, etc.) e complementa o pixel client-side.

## Arquitetura

Criar uma edge function `meta-capi` que recebe eventos e os envia para a API do Meta. As edge functions existentes (`start-trial` e `stripe-webhook`) vão chamar essa função para enviar os eventos server-side.

```text
[Usuário submete form]
    ├── Client: fbq('track', 'Lead')        ← já existe
    └── Server: start-trial → meta-capi     ← novo
         envia Lead via CAPI

[Stripe webhook: checkout.session.completed]
    └── Server: stripe-webhook → meta-capi  ← novo
         envia Purchase via CAPI
```

## Secrets necessários
Você vai precisar me fornecer:
1. **META_PIXEL_ID** — `939366085297921` (já temos)
2. **META_ACCESS_TOKEN** — Token de acesso da API de Conversões (gerado no Meta Events Manager → Configurações → API de Conversões → Gerar Token)

## Implementação

### 1. Nova edge function: `supabase/functions/meta-capi/index.ts`
- Recebe: `event_name`, `user_data` (email, phone, name), `custom_data` (value, currency), `event_source_url`
- Faz hash SHA-256 dos dados do usuário (exigido pelo Meta)
- Envia para `https://graph.facebook.com/v21.0/{PIXEL_ID}/events`
- Inclui `event_id` para deduplicação com o pixel client-side

### 2. Atualizar `supabase/functions/start-trial/index.ts`
- Após criar o perfil com sucesso, chamar `meta-capi` com evento `Lead`
- Dados: email (hash), phone (hash), nome

### 3. Atualizar `supabase/functions/stripe-webhook/index.ts`
- No `checkout.session.completed`, chamar `meta-capi` com evento `Purchase`
- Dados: email, phone, valor, plano

### 4. Deduplicação client-side ↔ server-side
- Gerar `event_id` único no client e enviar para o servidor
- Passar o mesmo `event_id` na chamada CAPI para que o Meta deduplicar automaticamente

## Arquivos afetados
- **Novo**: `supabase/functions/meta-capi/index.ts`
- **Novo**: `supabase/config.toml` — adicionar entrada para `meta-capi`
- **Editar**: `supabase/functions/start-trial/index.ts` — chamada CAPI após criação do trial
- **Editar**: `supabase/functions/stripe-webhook/index.ts` — chamada CAPI após checkout
- **Editar**: `src/pages/StartTrial.tsx` — gerar `event_id` e enviar junto no form

## Próximo passo
Preciso do **Access Token da API de Conversões** do Meta. Para gerar:
1. Acesse o [Meta Events Manager](https://business.facebook.com/events_manager2)
2. Selecione o pixel `939366085297921`
3. Vá em **Configurações** → **API de Conversões**
4. Clique em **Gerar token de acesso**
5. Copie e me envie o token

