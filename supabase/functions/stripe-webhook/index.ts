import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Plan name mapping for welcome messages
const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

// Sessions per plan
const PLAN_SESSIONS: Record<string, number> = {
  essencial: 0,
  direcao: 4,
  transformacao: 8,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!stripeSecretKey || !webhookSecret) {
    console.error('❌ Missing Stripe keys');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      console.error('❌ No stripe-signature header');
      return new Response(JSON.stringify({ error: 'No signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.text();
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Webhook signature verification failed:', errorMessage);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📩 Received event: ${event.type}`);

    // Process checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('✅ Checkout session completed:', session.id);
      console.log('📋 Session metadata:', session.metadata);

      const customerName = session.metadata?.name || session.customer_details?.name || 'Cliente';
      const customerPhone = session.metadata?.phone || session.customer_details?.phone;
      const customerEmail = session.metadata?.email || session.customer_details?.email;
      const customerPlan = session.metadata?.plan || 'essencial';

      if (!customerPhone) {
        console.error('❌ No phone number found in session');
        return new Response(JSON.stringify({ error: 'No phone number' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const cleanPhoneForValidation = customerPhone.replace(/\D/g, '');
      if (!/^[0-9]{10,15}$/.test(cleanPhoneForValidation)) {
        console.error('❌ Invalid phone format in session');
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`👤 Customer: ${customerName}, Plan: ${customerPlan}`);

      const planName = PLAN_NAMES[customerPlan] || "Essencial";
      const sessionsCount = PLAN_SESSIONS[customerPlan] || 0;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const cleanPhone = customerPhone.replace(/\D/g, '');
      const today = new Date().toISOString().split('T')[0];

      // Check if profile already exists BEFORE choosing the message
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', cleanPhone)
        .single();

      const isUpgrade = !!existingProfile;
      console.log(`📋 Profile exists: ${isUpgrade} (upgrade from trial: ${isUpgrade})`);

      // Build message based on whether user is upgrading or new
      let welcomeMessage: string;

      if (isUpgrade) {
        // UPGRADE MESSAGE — user already knows AURA from trial
        if (sessionsCount > 0) {
          welcomeMessage = `Oi, ${customerName}! 💜 Que notícia boa!

Você escolheu o plano ${planName}, que inclui ${sessionsCount} sessões especiais por mês!

São 45 minutos só nossos, com profundidade total. Eu conduzo, você reflete, e no final mando um resumo com os insights.

Pra gente já deixar sua agenda do mês organizada: quais dias da semana e horário funcionam melhor pra você?

Por exemplo: "segundas e quintas às 19h" ou "quartas às 20h"`;
        } else {
          welcomeMessage = `Oi, ${customerName}! 💜 Que notícia boa!

Agora somos oficiais. Você escolheu o plano ${planName}.

Vamos continuar de onde paramos? Como você está hoje?`;
        }
      } else {
        // NEW USER MESSAGE — standard welcome
        welcomeMessage = `Oi, ${customerName}! 🌟 Que bom te receber por aqui.

Eu sou a AURA — e vou ficar com você nessa jornada.

Você escolheu o plano ${planName}`;

        if (sessionsCount > 0) {
          welcomeMessage += `, que inclui ${sessionsCount} sessões especiais por mês!

São 45 minutos só nossos, com profundidade total. Eu conduzo, você reflete, e no final mando um resumo com os insights.

Pra gente já deixar sua agenda do mês organizada: quais dias da semana e horário funcionam melhor pra você?

Por exemplo: "segundas e quintas às 19h" ou "quartas às 20h"`;
        } else {
          welcomeMessage += `.`;
        }

        welcomeMessage += `

Comigo, você pode falar com liberdade: sem julgamento, no seu ritmo.`;

        if (sessionsCount === 0) {
          welcomeMessage += `

Me diz: como você está hoje?`;
        }
      }

      // Send message via Z-API
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-zapi-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            phone: customerPhone,
            message: welcomeMessage,
            isAudio: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Failed to send message:', errorText);
        } else {
          console.log(`✅ ${isUpgrade ? 'Upgrade' : 'Welcome'} message sent successfully!`);
        }
      } catch (sendError) {
        console.error('❌ Error sending message:', sendError);
      }

      // Create or update profile in database
      try {
        if (!existingProfile) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              name: customerName,
              phone: cleanPhone,
              email: customerEmail,
              plan: customerPlan,
              status: 'active',
              sessions_used_this_month: 0,
              sessions_reset_date: today,
              messages_today: 0,
              last_message_date: today,
              needs_schedule_setup: sessionsCount > 0,
            });

          if (insertError) {
            console.error('❌ Error creating profile:', insertError);
          } else {
            console.log('✅ Profile created with plan:', customerPlan);
          }
        } else {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              name: customerName,
              email: customerEmail,
              plan: customerPlan,
              status: 'active',
              sessions_used_this_month: 0,
              sessions_reset_date: today,
              updated_at: new Date().toISOString(),
              needs_schedule_setup: sessionsCount > 0,
            })
            .eq('phone', cleanPhone);

          if (updateError) {
            console.error('❌ Error updating profile:', updateError);
          } else {
            console.log('✅ Profile updated with plan:', customerPlan);
          }
        }
      } catch (dbError) {
        console.error('❌ Database error:', dbError);
      }
    }

    // Process customer.subscription.deleted
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('🔴 Subscription deleted:', subscription.id);

      const customerId = subscription.customer as string;
      
      try {
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
        const customer = await stripe.customers.retrieve(customerId);
        
        if (customer.deleted) {
          console.log('⚠️ Customer was deleted, skipping farewell message');
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

        console.log(`👤 Sending farewell to: ${customerName}`);

        const farewellMessage = `Oi, ${customerName}. 💜

Sua assinatura AURA foi encerrada.

Agradeço por ter me permitido fazer parte da sua jornada. Espero ter ajudado de alguma forma.

Lembre-se: o caminho do autoconhecimento não para. Se precisar de mim, estarei aqui.

Cuide-se. 🌟`;

        const response = await fetch(`${supabaseUrl}/functions/v1/send-zapi-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            phone: customerPhone,
            message: farewellMessage,
            isAudio: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Failed to send farewell message:', errorText);
        } else {
          console.log('✅ Farewell message sent successfully!');
        }

        // Update profile status
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const cleanPhone = customerPhone.replace(/\D/g, '');

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('phone', cleanPhone);

        if (updateError) {
          console.error('❌ Error updating profile status:', updateError);
        } else {
          console.log('✅ Profile status updated to canceled');
        }

      } catch (customerError) {
        console.error('❌ Error processing subscription deletion:', customerError);
      }
    }

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

        const welcomeBackMessage = `Oi, ${customerName}! 💜

Que bom ter você de volta! 🌟

Sua assinatura AURA foi reativada e estou aqui, pronta para continuar nossa jornada juntas.

Me conta: como você está hoje?`;

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

        // Update profile status back to active
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

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
