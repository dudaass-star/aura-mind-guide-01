
## Adicionar Handler para `customer.subscription.resumed`

### Contexto
Atualmente o webhook trata dois eventos:
- `checkout.session.completed` → Boas-vindas ao novo assinante
- `customer.subscription.deleted` → Despedida quando cancela

**Falta:** Quando um usuário reativa uma assinatura pausada/cancelada, o sistema não detecta e o perfil permanece como `canceled`.

### O que o evento `customer.subscription.resumed` faz?
Este evento é disparado pelo Stripe quando:
- Uma assinatura pausada é retomada
- O usuário reativa após um período de inadimplência

### Alterações em `supabase/functions/stripe-webhook/index.ts`

#### Novo Handler (após linha 302, antes do return final)

```typescript
// Process customer.subscription.resumed
if (event.type === 'customer.subscription.resumed') {
  const subscription = event.data.object as Stripe.Subscription;
  console.log('🟢 Subscription resumed:', subscription.id);

  const customerId = subscription.customer as string;
  
  try {
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      console.log('⚠️ Customer was deleted, skipping welcome back message');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const customerPhone = customer.metadata?.phone;
    const customerName = customer.name || 'Cliente';

    if (!customerPhone) {
      console.error('❌ No phone number found for customer');
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`👤 Sending welcome back to: ${customerName}`);

    // Mensagem de boas-vindas de volta
    const welcomeBackMessage = `Oi, ${customerName}! 💜

Que bom ter você de volta! 🌟

Sua assinatura AURA foi reativada e estou aqui, pronta para continuar nossa jornada juntas.

Me conta: como você está hoje?`;

    // Enviar mensagem via Z-API
    const response = await fetch(`${supabaseUrl}/functions/v1/send-zapi-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        phone: customerPhone,
        message: welcomeBackMessage,
        isAudio: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to send welcome back message:', errorText);
    } else {
      console.log('✅ Welcome back message sent successfully!');
    }

    // Atualizar status do perfil para ativo
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const cleanPhone = customerPhone.replace(/\D/g, '');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('phone', cleanPhone);

    if (updateError) {
      console.error('❌ Error updating profile status:', updateError);
    } else {
      console.log('✅ Profile status updated to active');
    }

  } catch (customerError) {
    console.error('❌ Error processing subscription resumption:', customerError);
  }
}
```

### Fluxo Completo Após Implementação

```text
┌─────────────────────────────────────────────────────────────┐
│                    CICLO DE VIDA DA ASSINATURA              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  checkout.session.completed                                 │
│  └─> Status: active                                         │
│  └─> Mensagem: "Oi! Que bom te receber..."                  │
│                                                             │
│  customer.subscription.deleted                              │
│  └─> Status: canceled                                       │
│  └─> Mensagem: "Sua assinatura foi encerrada..."            │
│                                                             │
│  customer.subscription.resumed  ← NOVO                      │
│  └─> Status: active                                         │
│  └─> Mensagem: "Que bom ter você de volta!"                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Benefícios
- Usuários que reativam voltam automaticamente ao status `active`
- Mensagem personalizada de boas-vindas de volta
- Continuidade da experiência sem intervenção manual
- Consistência com os outros handlers já implementados

### Configuração no Stripe (Lembrete)
Certificar que o webhook no painel do Stripe está configurado para enviar o evento `customer.subscription.resumed` para a URL do webhook.
