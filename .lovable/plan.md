## Plano

Vou ajustar a criação da sessão do portal de pagamentos para forçar o idioma em português do Brasil.

### Mudança principal
- Em `supabase/functions/customer-portal/index.ts`, adicionar `locale: "pt-BR"` na chamada `stripe.billingPortal.sessions.create(...)`.
- Isso deve traduzir textos do portal como “Active plan”, “Payment method”, “Billing information”, “Add payment method”, “Edit information”, etc.

### Observação importante
- A configuração do Stripe que aparece no print controla a prévia/configuração do portal, mas o idioma real da sessão pode continuar seguindo navegador/conta se a sessão não receber `locale` explicitamente.
- Textos de marca/rodapé do próprio Stripe, como “Powered by Stripe”, podem continuar sendo controlados pela Stripe e não pelo nosso código.

### Validação
- Depois da alteração, gerar um novo link pelo botão “Atualizar forma de pagamento”.
- Confirmar que a URL nova abre o portal com os rótulos em português.

### Escopo
- Sem mudança de plano, cobrança, assinatura ou tela do portal da Aura.
- Apenas ajuste de idioma na sessão do portal de pagamentos.