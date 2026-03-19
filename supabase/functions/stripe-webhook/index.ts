import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { allocateInstance } from "../_shared/instance-helper.ts";

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
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Webhook signature verification failed:', errorMessage);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📩 Received event: ${event.type}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Idempotency check — prevent duplicate processing on Stripe retries
    const { error: dedupError } = await supabase
      .from('stripe_webhook_events')
      .insert({ id: event.id, event_type: event.type });

    if (dedupError?.code === '23505') {
      console.log(`⚠️ Event ${event.id} already processed, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('✅ Checkout session completed:', session.id);
      console.log('📋 Session metadata:', session.metadata);

      const customerName = session.metadata?.name || session.customer_details?.name || 'Cliente';
      const customerPhone = session.metadata?.phone || session.customer_details?.phone;
      const customerEmail = session.metadata?.email || session.customer_details?.email;
      const customerPlan = session.metadata?.plan || 'essencial';
      const isBoletoPayment = session.metadata?.payment_method === 'boleto' || session.metadata?.payment_method === 'pix';
      const sessionMode = session.mode; // 'payment' for boleto/pix, 'subscription' for card

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

      console.log(`👤 Customer: ${customerName}, Plan: ${customerPlan}, Boleto: ${isBoletoPayment}, Mode: ${sessionMode}`);

      const planName = PLAN_NAMES[customerPlan] || "Essencial";
      const sessionsCount = PLAN_SESSIONS[customerPlan] || 0;
      
      const cleanPhone = customerPhone.replace(/\D/g, '');
      const formattedPhone = (cleanPhone.length === 10 || cleanPhone.length === 11)
        ? `55${cleanPhone}`
        : cleanPhone;
      const today = new Date().toISOString().split('T')[0];

      // Calculate plan_expires_at for boleto/one-time payments (12 months from now)
      let planExpiresAt: string | null = null;
      if (isBoletoPayment || sessionMode === 'payment') {
        const expirationDate = new Date();
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
        planExpiresAt = expirationDate.toISOString();
        console.log(`📅 One-time payment — plan expires at: ${planExpiresAt}`);
      }

      // Check if profile already exists BEFORE choosing the message
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, status')
        .eq('phone', formattedPhone)
        .single();

      const isTrial = session.metadata?.trial === 'true';
      const isReturning = existingProfile?.status === 'canceled';
      const isUpgrade = !!existingProfile && !isReturning;
      console.log(`📋 Profile exists: ${!!existingProfile}, isReturning: ${isReturning}, isUpgrade: ${isUpgrade}, isTrial: ${isTrial}`);

      // Build message based on user scenario
      let welcomeMessage: string;

      if (isReturning) {
        welcomeMessage = `Oi, ${customerName}! 💜

Que bom ter você de volta! 🌟

Você escolheu o plano ${planName}.

Vamos retomar de onde paramos?`;
      } else if (isUpgrade) {
        welcomeMessage = `Oi, ${customerName}! 💜 Que notícia boa!

Agora somos oficiais. Você escolheu o plano ${planName}.

Vamos continuar de onde paramos?`;
      } else {
        welcomeMessage = `Oi, ${customerName}! 🌟 Que bom te receber por aqui.

Eu sou a AURA — e vou ficar com você nessa jornada.

Você escolheu o plano ${planName}.

Comigo, você pode falar com liberdade: sem julgamento, no seu ritmo.

Me diz: como você está hoje?`;
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
            phone: formattedPhone,
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

      // Send CAPI Purchase event with event_id for deduplication (non-blocking)
      try {
        const amountTotal = session.amount_total ? session.amount_total / 100 : 0;
        const eventId = session.metadata?.event_id;
        await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            event_name: 'Purchase',
            ...(eventId && { event_id: eventId }),
            event_source_url: 'https://aura-mind-guide-01.lovable.app/checkout',
            user_data: {
              email: customerEmail || undefined,
              phone: formattedPhone,
              first_name: customerName.split(' ')[0],
            },
            custom_data: {
              value: amountTotal,
              currency: 'BRL',
              content_name: `Plano ${planName}`,
              content_category: customerPlan,
            },
          }),
        });
        console.log('✅ CAPI Purchase event sent', eventId ? `(event_id: ${eventId})` : '');
      } catch (capiError) {
        console.warn('⚠️ CAPI Purchase event failed (non-blocking):', capiError);
      }

      // Create or update profile in database
      try {
        if (!existingProfile) {
          const instanceId = await allocateInstance(supabase);
          console.log(`📱 Allocated WhatsApp instance: ${instanceId || 'none (will use env vars)'}`);

          const newUserId = crypto.randomUUID();
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              user_id: newUserId,
              name: customerName,
              phone: formattedPhone,
              email: customerEmail,
              plan: customerPlan,
              status: isTrial ? 'trial' : 'active',
              sessions_used_this_month: 0,
              sessions_reset_date: today,
              messages_today: 0,
              last_message_date: today,
              needs_schedule_setup: sessionsCount > 0,
              ...(isTrial && { trial_started_at: new Date().toISOString(), trial_phase: 'listening' }),
              ...(instanceId && { whatsapp_instance_id: instanceId }),
              ...(planExpiresAt && { plan_expires_at: planExpiresAt }),
            });

          if (insertError) {
            console.error('❌ Error creating profile:', insertError);
          } else {
            console.log('✅ Profile created with plan:', customerPlan, planExpiresAt ? `expires: ${planExpiresAt}` : '');
          }
        } else {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              name: customerName,
              email: customerEmail,
              plan: customerPlan,
              status: isTrial ? 'trial' : 'active',
              sessions_used_this_month: 0,
              sessions_reset_date: today,
              updated_at: new Date().toISOString(),
              needs_schedule_setup: sessionsCount > 0,
              ...(isTrial && { trial_started_at: new Date().toISOString(), trial_phase: 'listening' }),
              ...(planExpiresAt && { plan_expires_at: planExpiresAt }),
            })
            .eq('phone', formattedPhone);

          if (updateError) {
            console.error('❌ Error updating profile:', updateError);
          } else {
            console.log('✅ Profile updated with plan:', customerPlan, planExpiresAt ? `expires: ${planExpiresAt}` : '');
            const { data: cancelled } = await supabase
              .from('scheduled_tasks')
              .update({ status: 'cancelled', executed_at: new Date().toISOString() })
              .eq('user_id', existingProfile.user_id)
              .in('status', ['pending'])
              .like('task_type', 'trial_%')
              .select('id');
            if (cancelled && cancelled.length > 0) {
              console.log(`🗑️ Cancelled ${cancelled.length} pending trial follow-up tasks (user converted)`);
            }
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

Sua assinatura AURA foi reativada e estou aqui, pronta pra continuar nossa jornada.

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
          // Cancel any pending trial follow-up tasks for this user
          const { data: profileForCancel } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('phone', cleanPhone)
            .maybeSingle();
          if (profileForCancel) {
            const { data: cancelledTasks } = await supabase
              .from('scheduled_tasks')
              .update({ status: 'cancelled', executed_at: new Date().toISOString() })
              .eq('user_id', profileForCancel.user_id)
              .in('status', ['pending'])
              .like('task_type', 'trial_%')
              .select('id');
            if (cancelledTasks && cancelledTasks.length > 0) {
              console.log(`🗑️ Cancelled ${cancelledTasks.length} pending trial tasks (subscription resumed)`);
            }
          }
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
