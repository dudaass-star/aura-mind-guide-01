

## Migração: Dunning e Checkout Recovery → Email

### Status: ✅ Concluído

### O que foi feito

1. **Infraestrutura de email transacional** configurada (filas pgmq, cron job, funções de envio)
2. **Templates de email criados**:
   - `dunning-payment-failed`: Email empático para falha de pagamento com link para Billing Portal
   - `checkout-recovery`: Email de recuperação de checkout abandonado com link direto
3. **Edge functions migradas de WhatsApp para email**:
   - `stripe-webhook` (bloco invoice.payment_failed)
   - `recover-abandoned-checkout`
   - `reprocess-dunning`
4. **Popup de exit-intent** adicionado na página de Checkout (desktop: mouse leave, mobile: visibilitychange)
5. **Página de unsubscribe** criada em `/unsubscribe`
6. Todas as funções deployadas com sucesso
