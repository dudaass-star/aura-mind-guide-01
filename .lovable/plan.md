## Botão "Atualizar forma de pagamento" no /meu-espaco

### 1. Nova edge function `customer-portal`
`supabase/functions/customer-portal/index.ts` (verify_jwt = false, padrão Lovable):
- Recebe `{ token: string }` no body (token do portal passwordless).
- Valida token contra `user_portal_tokens` (cliente service role) → pega `user_id`.
- Busca `profiles.stripe_customer_id` (ou email/phone fallback como já é feito em `reprocess-dunning`) pra resolver `customerId` no Stripe.
- Se não tiver customer no Stripe → retorna 404 com mensagem amigável.
- `stripe.billingPortal.sessions.create({ customer, return_url: '${origin}/meu-espaco?t=${token}' })`.
- Retorna `{ url }`.

Reaproveita exatamente a lógica de lookup que já existe em `reprocess-dunning/index.ts` (linhas ~100-115) pra manter consistência.

### 2. Botão no UserPortal
Em `src/pages/UserPortal.tsx`, adicionar uma seção discreta no footer (antes do "Conteúdo exclusivo da Aura") ou um botão no header ao lado de "Meu Espaço":
- Texto: "Atualizar forma de pagamento"
- Ícone: `CreditCard` (lucide-react)
- Estilo: link/botão sutil em `text-muted-foreground hover:text-accent`, fonte Nunito, consistente com o resto do portal.
- onClick: chama `supabase.functions.invoke('customer-portal', { body: { token } })` → `window.open(data.url, '_blank')`.
- Estado de loading enquanto gera o link.
- Em caso de erro (sem customer Stripe), toast amigável: "Não encontramos sua assinatura. Fale com o suporte."

### 3. Onde colocar visualmente
Preferência: **footer do portal**, logo acima do "Conteúdo exclusivo da Aura". Fica discreto, não compete com as abas, e é o lugar natural de "configurações de conta". Alternativa seria criar uma 5ª aba "Conta", mas é overkill pra um botão só.

### Resumo técnico
- 1 edge function nova (~60 linhas, reuso alto do `reprocess-dunning`).
- ~30 linhas no `UserPortal.tsx` (botão + handler + toast).
- Nenhuma migration, nenhum secret novo (Stripe já configurado).
- Billing Portal precisa estar ativado no Stripe Dashboard (Settings → Billing → Customer portal). Se não estiver, a primeira chamada retorna erro claro e o usuário (você) ativa em 1 clique.

Confirma que sigo por aí?