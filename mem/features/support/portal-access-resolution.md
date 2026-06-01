---
name: Resolução de acesso ao portal no suporte
description: Tickets de acesso ao /meu-espaco usam send_portal_link com URL pública estática; portal não usa mais token UUID
type: feature
---

# Acesso ao portal nos tickets de suporte

- O portal `/meu-espaco` mudou: **não usa mais token UUID na URL**. Login é direto via Google ou OTP de 6 dígitos por email (ver `PortalLogin.tsx` + `PortalAuthContext`).
- Em `support-agent` (SYSTEM_PROMPT), tickets de "não consigo entrar / esqueci senha / como acesso / quero ver minhas sessões no portal" **devem** retornar `suggested_action.type = "send_portal_link"` e o draft **deve** conter literalmente `https://olaaura.com.br/meu-espaco` (sem placeholder, sem `?t=...`).
- Sempre orientar: "entre com o mesmo email da conta — Google ou código por email". Não há senha.
- Em `support-execute-action`, o case `send_portal_link` não toca mais em `user_portal_tokens` — só devolve a URL pública estática. Tabela `user_portal_tokens` continua existindo para outros usos (admin link, customer-portal), mas não para suporte.
- Proibido redirecionar cliente pro WhatsApp pra resolver acesso ao portal.

## Cobrança falhada / atualizar forma de pagamento

- O `/meu-espaco` tem botão **"Atualizar forma de pagamento"** no rodapé (`UserPortal.tsx`) que abre o Billing Portal Stripe via edge `customer-portal`. É o caminho oficial pro cliente trocar o cartão.
- Tickets de **cobrança falhada / cartão recusado / "como atualizo meu pagamento" / acesso bloqueado por falta de pagamento** seguem o mesmo padrão: `suggested_action.type = "send_portal_link"`, draft com a URL `https://olaaura.com.br/meu-espaco` e a instrução pra clicar em "Atualizar forma de pagamento" no rodapé.
- **Nunca mencionar "Stripe" / "parceiro de pagamentos" / "gateway" pro cliente** — a marca é Aura, o backend resolve o provedor.
- A ação `send_stripe_billing_portal` foi removida do enum/catálogo da IA. O case ainda existe no `support-execute-action` pra uso admin manual, mas o agente não pode mais sugerir.
- **Exceção PIX/Asaas**: clientes sem `stripe.subscriptions` (pagam via Asaas) NÃO devem ser direcionados ao botão (ele só funciona pra cartão Stripe). Oferecer gerar nova cobrança PIX e pedir confirmação.