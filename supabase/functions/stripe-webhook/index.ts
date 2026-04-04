import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { allocateInstance } from "../_shared/instance-helper.ts";
import { resolveProfile } from "../_shared/profile-resolver.ts";
import { getPhoneVariations } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

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

/**
 * Helper: resolve profile from Stripe customer using phone variations + email fallback
 * Returns { profile, phone } where phone is the matched phone for messaging
 */
async function resolveProfileFromCustomer(
  supabase: any,
  customer: Stripe.Customer,
): Promise<{ profile: any | null; phone: string | null; variationsTried: string[] }> {
  const result = await resolveProfile(
    supabase,
    customer.metadata?.phone,
    customer.email,
  );
  return {
    profile: result.profile,
    phone: result.profile?.phone || result.phoneUsed,
    variationsTried: result.variationsTried,
  };
}

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

    // Idempotency check — include amount for invoice events
    let eventAmount: number | null = null;
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      eventAmount = event.type === 'invoice.paid'
        ? (invoice.amount_paid ?? 0)
        : (invoice.amount_due ?? 0);
    }

    const { error: dedupError } = await supabase
      .from('stripe_webhook_events')
      .insert({ id: event.id, event_type: event.type, ...(eventAmount !== null && { amount: eventAmount }) });

    if (dedupError?.code === '23505') {
      console.log(`⚠️ Event ${event.id} already processed, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== checkout.session.completed ==========
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('✅ Checkout session completed:', session.id);
      console.log('📋 Session metadata:', session.metadata);

      // Mark checkout_session as completed for funnel tracking
      try {
        await supabase
          .from('checkout_sessions')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('stripe_session_id', session.id);
        console.log('✅ Checkout session marked as completed in DB');
      } catch (csErr) {
        console.warn('⚠️ Failed to update checkout_session status (non-blocking):', csErr);
      }

      // ========== TRIAL VALIDATION (R$1 charge) ==========
      if (session.metadata?.trial_validation === 'true' && session.mode === 'payment') {
        console.log('🔐 Trial validation flow detected');
        const customerName = session.metadata?.name || session.customer_details?.name || 'Cliente';
        const customerPhone = session.metadata?.phone;
        const customerEmail = session.metadata?.email || session.customer_details?.email;
        const customerPlan = session.metadata?.plan || 'essencial';
        const customerBilling = session.metadata?.billing || 'monthly';
        const customerId = session.customer as string;
        const paymentIntentId = session.payment_intent as string;

        if (!customerPhone) {
          console.error('❌ No phone in trial validation session');
          return new Response(JSON.stringify({ received: true }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const cleanPhone = customerPhone.replace(/\D/g, '');
        const formattedPhone = (cleanPhone.length === 10 || cleanPhone.length === 11)
          ? `55${cleanPhone}` : cleanPhone;

        try {
          // Retrieve PaymentIntent to get the payment method for future charges
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['payment_method'],
          });
          const paymentMethod = paymentIntent.payment_method as Stripe.PaymentMethod;
          console.log('✅ Paid trial accepted, creating trial subscription');

          // Get the payment methods for this customer
          const paymentMethods = await stripe.paymentMethods.list({
            customer: customerId,
            type: 'card',
            limit: 1,
          });

          let defaultPm = paymentMethods.data[0]?.id;
          if (!defaultPm && paymentMethod?.id) {
            // Fallback: attach PM directly from PaymentIntent
            try {
              await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });
              defaultPm = paymentMethod.id;
              console.log('✅ PM attached from PaymentIntent fallback:', defaultPm);
            } catch (attachErr: any) {
              // If already attached, just use it
              if (attachErr.code === 'resource_already_exists') {
                defaultPm = paymentMethod.id;
                console.log('✅ PM already attached, using it:', defaultPm);
              } else {
                console.error('❌ Failed to attach PM from PaymentIntent:', attachErr.message);
              }
            }
          }
          if (!defaultPm) {
            console.error('❌ No payment method found after paid trial charge — subscription will have no PM');
          }

          // Get the correct price for the subscription
          const PRICES: Record<string, Record<string, string>> = {
            essencial: { monthly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY") || "", yearly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_YEARLY") || "" },
            direcao: { monthly: Deno.env.get("STRIPE_PRICE_DIRECAO_MONTHLY") || "", yearly: Deno.env.get("STRIPE_PRICE_DIRECAO_YEARLY") || "" },
            transformacao: { monthly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_MONTHLY") || "", yearly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_YEARLY") || "" },
          };

          const subscriptionPriceId = PRICES[customerPlan]?.[customerBilling];
          if (!subscriptionPriceId) {
            console.error(`❌ No price ID found for plan=${customerPlan}, billing=${customerBilling}`);
            return new Response(JSON.stringify({ received: true }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Create subscription with 7-day trial
          const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: subscriptionPriceId }],
            trial_period_days: 7,
            payment_behavior: 'allow_incomplete',
            ...(defaultPm && { default_payment_method: defaultPm }),
            metadata: {
              phone: cleanPhone,
              name: customerName,
              email: customerEmail || '',
              plan: customerPlan,
              billing: customerBilling,
              trial: "true",
            },
            description: "7 dias de acesso incluídos — a primeira cobrança será no 8º dia.",
          });
          console.log('✅ Trial subscription created:', subscription.id);

          // Ensure PM is set on subscription (verify post-creation)
          if (defaultPm && !subscription.default_payment_method) {
            await stripe.subscriptions.update(subscription.id, {
              default_payment_method: defaultPm,
            });
            console.log('✅ Subscription default_payment_method set post-creation');
          }

          // Sync PM to customer invoice_settings for automatic off-session charges
          if (defaultPm) {
            try {
              await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: defaultPm },
              });
              console.log('✅ Customer invoice_settings.default_payment_method updated');
            } catch (custErr: any) {
              console.error('❌ Failed to update customer invoice_settings:', custErr.message);
            }
          }

          // Now create/update profile (same logic as normal checkout)
          const planName = PLAN_NAMES[customerPlan] || "Essencial";
          const sessionsCount = PLAN_SESSIONS[customerPlan] || 0;
          const today = new Date().toISOString().split('T')[0];

          const resolveResult = await resolveProfile(supabase, customerPhone, customerEmail);
          const existingProfile = resolveResult.profile;
          const isReturning = existingProfile?.status === 'canceled';
          const isUpgrade = !!existingProfile && !isReturning;

          let profileUserId: string;
          try {
            if (!existingProfile) {
              const instanceId = await allocateInstance(supabase);
              const newUserId = crypto.randomUUID();
              profileUserId = newUserId;
              await supabase.from('profiles').insert({
                user_id: newUserId,
                name: customerName,
                phone: formattedPhone,
                email: customerEmail,
                plan: customerPlan,
                status: 'trial',
                sessions_used_this_month: 0,
                sessions_reset_date: today,
                messages_today: 0,
                last_message_date: today,
                needs_schedule_setup: sessionsCount > 0,
                trial_started_at: new Date().toISOString(),
                trial_phase: 'listening',
                ...(instanceId && { whatsapp_instance_id: instanceId }),
              });
              console.log('✅ Trial profile created');
            } else {
              profileUserId = existingProfile.user_id;
              await supabase.from('profiles').update({
                name: customerName,
                email: customerEmail,
                plan: customerPlan,
                status: 'trial',
                sessions_used_this_month: 0,
                sessions_reset_date: today,
                updated_at: new Date().toISOString(),
                needs_schedule_setup: sessionsCount > 0,
                trial_started_at: new Date().toISOString(),
                trial_phase: 'listening',
              }).eq('id', existingProfile.id);
              console.log('✅ Trial profile updated');
            }
          } catch (dbError) {
            console.error('❌ Database error:', dbError);
            profileUserId = existingProfile?.user_id || crypto.randomUUID();
          }

          // Generate portal token
          try {
            await supabase.from('user_portal_tokens').upsert(
              { user_id: profileUserId },
              { onConflict: 'user_id' }
            );
            console.log('✅ Portal token created');
          } catch (tokenErr) {
            console.warn('⚠️ Portal token creation failed (non-blocking):', tokenErr);
          }

          // Send welcome message
          let welcomeMessage: string;
          if (isReturning) {
            welcomeMessage = `Oi, ${customerName}! 💜\n\nQue bom ter você de volta! 🌟\n\nVocê escolheu o plano ${planName}.\n\nVamos retomar de onde paramos?`;
          } else if (isUpgrade) {
            welcomeMessage = `Oi, ${customerName}! 💜 Que notícia boa!\n\nAgora somos oficiais. Você escolheu o plano ${planName}.\n\nVamos continuar de onde paramos?`;
          } else {
            welcomeMessage = `Oi, ${customerName}! 🌟 Que bom te receber por aqui.\n\nEu sou a AURA — e vou ficar com você nessa jornada.\n\nVocê escolheu o plano ${planName}.\n\nComigo, você pode falar com liberdade: sem julgamento, no seu ritmo.\n\nMe diz: como você está hoje?`;
          }

          try {
            let result = await sendProactive(formattedPhone, welcomeMessage, 'welcome', profileUserId);
            if (!result.success) {
              console.warn('⚠️ First welcome attempt failed, retrying in 3s:', result.error);
              await new Promise(resolve => setTimeout(resolve, 3000));
              result = await sendProactive(formattedPhone, welcomeMessage, 'welcome', profileUserId);
            }
            if (result.success) {
              console.log('✅ Welcome message sent via', result.provider);
              await supabase.from('messages').insert({ user_id: profileUserId, role: 'assistant', content: welcomeMessage });
            } else {
              console.error('❌ Failed to send welcome after retry:', result.error);
            }
          } catch (sendError) {
            console.error('❌ Error sending welcome:', sendError);
            // Retry once on exception
            try {
              await new Promise(resolve => setTimeout(resolve, 3000));
              const retryResult = await sendProactive(formattedPhone, welcomeMessage, 'welcome', profileUserId);
              if (retryResult.success) {
                console.log('✅ Welcome sent on retry via', retryResult.provider);
                await supabase.from('messages').insert({ user_id: profileUserId, role: 'assistant', content: welcomeMessage });
              } else {
                console.error('❌ Welcome retry also failed:', retryResult.error);
              }
            } catch (retryErr) {
              console.error('❌ Welcome retry exception:', retryErr);
            }
          }

          // Send welcome email as backup (in case WhatsApp template is pending)
          if (customerEmail) {
            try {
              await supabase.functions.invoke('send-transactional-email', {
                body: {
                  templateName: 'welcome',
                  recipientEmail: customerEmail,
                  idempotencyKey: `welcome-${session.id}`,
                  templateData: { name: customerName },
                },
              });
              console.log('✅ Welcome email enqueued');
            } catch (emailErr) {
              console.warn('⚠️ Welcome email failed (non-blocking):', emailErr);
            }
          }

          // CAPI event
          try {
            const fbp = session.metadata?.fbp;
            const fbc = session.metadata?.fbc;
            await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
              body: JSON.stringify({
                event_name: 'StartTrial',
                event_id: session.id,
                event_source_url: 'https://olaaura.com.br/obrigado',
                user_data: {
                  email: customerEmail || undefined,
                  phone: formattedPhone,
                  first_name: customerName.split(' ')[0],
                  ...(fbp && { fbp }),
                  ...(fbc && { fbc }),
                },
                custom_data: {
                  content_name: `Trial ${planName}`,
                  content_category: customerPlan,
                },
              }),
            });
            console.log('✅ CAPI StartTrial event sent');

            // Also send Purchase event for the trial payment
            await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
              body: JSON.stringify({
                event_name: 'Purchase',
                event_id: session.id + '_purchase',
                event_source_url: 'https://olaaura.com.br/obrigado',
                user_data: {
                  email: customerEmail || undefined,
                  phone: formattedPhone,
                  first_name: customerName.split(' ')[0],
                  ...(fbp && { fbp }),
                  ...(fbc && { fbc }),
                },
                custom_data: {
                  value: (session.amount_total || 0) / 100,
                  currency: 'BRL',
                  content_name: `Trial ${planName}`,
                  content_category: customerPlan,
                },
              }),
            });
            console.log('✅ CAPI Purchase event sent (trial payment)');
          } catch (capiError) {
            console.warn('⚠️ CAPI events failed (non-blocking):', capiError);
          }

          return new Response(JSON.stringify({ received: true }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });

        } catch (trialError) {
          console.error('❌ Error in trial validation flow:', trialError);
          return new Response(JSON.stringify({ received: true }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // ========== NORMAL CHECKOUT (non-trial) ==========
      const customerName = session.metadata?.name || session.customer_details?.name || 'Cliente';
      const customerPhone = session.metadata?.phone || session.customer_details?.phone;
      const customerEmail = session.metadata?.email || session.customer_details?.email;
      const customerPlan = session.metadata?.plan || 'essencial';
      const isBoletoPayment = session.metadata?.payment_method === 'boleto' || session.metadata?.payment_method === 'pix';
      const sessionMode = session.mode;

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

      let planExpiresAt: string | null = null;
      if (isBoletoPayment || sessionMode === 'payment') {
        const expirationDate = new Date();
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
        planExpiresAt = expirationDate.toISOString();
        console.log(`📅 One-time payment — plan expires at: ${planExpiresAt}`);
      }

      // Check if profile already exists using resolver for better matching
      const resolveResult = await resolveProfile(supabase, customerPhone, customerEmail);
      const existingProfile = resolveResult.profile;

      const isTrial = session.metadata?.trial === 'true';
      const isReturning = existingProfile?.status === 'canceled';
      const isUpgrade = !!existingProfile && !isReturning;
      console.log(`📋 Profile exists: ${!!existingProfile}, isReturning: ${isReturning}, isUpgrade: ${isUpgrade}, isTrial: ${isTrial}`);

      let profileUserId: string;
      try {
        if (!existingProfile) {
          const instanceId = await allocateInstance(supabase);
          console.log(`📱 Allocated WhatsApp instance: ${instanceId || 'none (will use env vars)'}`);

          const newUserId = crypto.randomUUID();
          profileUserId = newUserId;
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
          profileUserId = existingProfile.user_id;
          const isConverting = !isTrial && ['trial', 'trial_expired'].includes(existingProfile.status);
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
              ...(isConverting && { converted_at: new Date().toISOString() }),
              ...(planExpiresAt && { plan_expires_at: planExpiresAt }),
            })
            .eq('id', existingProfile.id);

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
        profileUserId = existingProfile?.user_id || crypto.randomUUID();
      }

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

      // Send welcome message with retry + persistence
      try {
        let result = await sendProactive(formattedPhone, welcomeMessage, 'welcome', profileUserId);
        if (!result.success) {
          console.warn('⚠️ First welcome attempt failed, retrying in 3s:', result.error);
          await new Promise(resolve => setTimeout(resolve, 3000));
          result = await sendProactive(formattedPhone, welcomeMessage, 'welcome', profileUserId);
        }
        if (result.success) {
          console.log(`✅ ${isUpgrade ? 'Upgrade' : 'Welcome'} message sent via ${result.provider}!`);
          await supabase.from('messages').insert({ user_id: profileUserId, role: 'assistant', content: welcomeMessage });
        } else {
          console.error('❌ Failed to send welcome after retry:', result.error);
        }
      } catch (sendError) {
        console.error('❌ Error sending welcome:', sendError);
        try {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const retryResult = await sendProactive(formattedPhone, welcomeMessage, 'welcome', profileUserId);
          if (retryResult.success) {
            console.log('✅ Welcome sent on retry via', retryResult.provider);
            await supabase.from('messages').insert({ user_id: profileUserId, role: 'assistant', content: welcomeMessage });
          } else {
            console.error('❌ Welcome retry also failed:', retryResult.error);
          }
        } catch (retryErr) {
          console.error('❌ Welcome retry exception:', retryErr);
        }
      }

      // Send CAPI Purchase event (non-blocking)
      try {
        const amountTotal = session.amount_total ? session.amount_total / 100 : 0;
        const eventId = session.id;
        const fbp = session.metadata?.fbp;
        const fbc = session.metadata?.fbc;
        await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            event_name: 'Purchase',
            event_id: eventId,
            event_source_url: 'https://olaaura.com.br/obrigado',
            user_data: {
              email: customerEmail || undefined,
              phone: formattedPhone,
              first_name: customerName.split(' ')[0],
              ...(fbp && { fbp }),
              ...(fbc && { fbc }),
            },
            custom_data: {
              value: amountTotal,
              currency: 'BRL',
              content_name: `Plano ${planName}`,
              content_category: customerPlan,
            },
          }),
        });
        console.log(`✅ CAPI Purchase event sent (event_id: ${eventId}, fbp: ${!!fbp}, fbc: ${!!fbc})`);
      } catch (capiError) {
        console.warn('⚠️ CAPI Purchase event failed (non-blocking):', capiError);
      }
    }

    // ========== customer.subscription.deleted ==========
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('🔴 Subscription deleted:', subscription.id);

      const customerId = subscription.customer as string;
      
      try {
        const customer = await stripe.customers.retrieve(customerId);
        
        if (customer.deleted) {
          console.log('⚠️ Customer was deleted, skipping farewell message');
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { profile, phone } = await resolveProfileFromCustomer(supabase, customer as Stripe.Customer);
        const customerName = customer.name || 'Cliente';

        if (!phone) {
          console.error('❌ No phone resolved for customer', customerId);
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

        const farewellResult = await sendProactive(phone, farewellMessage, 'checkin', profile?.user_id);
        if (!farewellResult.success) {
          console.error('❌ Failed to send farewell message:', farewellResult.error);
        } else {
          console.log('✅ Farewell message sent via', farewellResult.provider);
          if (profile?.user_id) {
            await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: farewellMessage });
          }
        }

        // Update profile status
        if (profile) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ status: 'canceled', updated_at: new Date().toISOString() })
            .eq('id', profile.id);

          if (updateError) {
            console.error('❌ Error updating profile status:', updateError);
          } else {
            console.log('✅ Profile status updated to canceled');
          }
        } else {
          console.warn('⚠️ No profile found to update status to canceled');
        }

      } catch (customerError) {
        console.error('❌ Error processing subscription deletion:', customerError);
      }
    }

    // ========== customer.subscription.resumed ==========
    if (event.type === 'customer.subscription.resumed') {
      const subscription = event.data.object as Stripe.Subscription;
      console.log('🟢 Subscription resumed:', subscription.id);

      const customerId = subscription.customer as string;
      
      try {
        const customer = await stripe.customers.retrieve(customerId);
        
        if (customer.deleted) {
          console.log('⚠️ Customer was deleted, skipping welcome back message');
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { profile, phone } = await resolveProfileFromCustomer(supabase, customer as Stripe.Customer);
        const customerName = customer.name || 'Cliente';

        if (!phone) {
          console.error('❌ No phone resolved for customer', customerId);
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

        let welcomeBackResult = await sendProactive(phone, welcomeBackMessage, 'welcome', profile?.user_id);
        if (!welcomeBackResult.success) {
          console.warn('⚠️ First welcome back attempt failed, retrying in 3s:', welcomeBackResult.error);
          await new Promise(resolve => setTimeout(resolve, 3000));
          welcomeBackResult = await sendProactive(phone, welcomeBackMessage, 'welcome', profile?.user_id);
        }
        if (welcomeBackResult.success) {
          console.log('✅ Welcome back message sent via', welcomeBackResult.provider);
          if (profile?.user_id) {
            await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: welcomeBackMessage });
          }
        } else {
          console.error('❌ Failed to send welcome back after retry:', welcomeBackResult.error);
        }

        // Update profile status back to active
        if (profile) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', profile.id);

          if (updateError) {
            console.error('❌ Error updating profile status:', updateError);
          } else {
            console.log('✅ Profile status updated to active');
            // Cancel pending trial tasks
            const { data: cancelledTasks } = await supabase
              .from('scheduled_tasks')
              .update({ status: 'cancelled', executed_at: new Date().toISOString() })
              .eq('user_id', profile.user_id)
              .in('status', ['pending'])
              .like('task_type', 'trial_%')
              .select('id');
            if (cancelledTasks && cancelledTasks.length > 0) {
              console.log(`🗑️ Cancelled ${cancelledTasks.length} pending trial tasks (subscription resumed)`);
            }
          }
        } else {
          console.warn('⚠️ No profile found to update status to active');
        }

      } catch (customerError) {
        console.error('❌ Error processing subscription resumption:', customerError);
      }
    }

    // ========== invoice.paid — trial converted to paid ==========
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      console.log('💰 Invoice paid:', invoice.id, 'customer:', customerId);

      if (invoice.subscription) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            const { profile } = await resolveProfileFromCustomer(supabase, customer as Stripe.Customer);

            if (profile && ['trial', 'trial_expired'].includes(profile.status) && profile.trial_started_at) {
              const { error: updateError } = await supabase
                .from('profiles')
                .update({
                  status: 'active',
                  converted_at: new Date().toISOString(),
                  payment_failed_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', profile.id);

              if (updateError) {
                console.error('❌ Error updating profile on invoice.paid:', updateError);
              } else {
                console.log('✅ Trial converted to active via invoice.paid for:', profile.phone);
                await supabase
                  .from('scheduled_tasks')
                  .update({ status: 'cancelled', executed_at: new Date().toISOString() })
                  .eq('user_id', profile.user_id)
                  .in('status', ['pending'])
                  .like('task_type', 'trial_%');
              }
            } else if (profile) {
              // Clear payment_failed_at on successful payment regardless of status
              await supabase
                .from('profiles')
                .update({
                  payment_failed_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', profile.id);
              console.log('ℹ️ invoice.paid — cleared payment_failed_at for:', profile.phone);
            } else {
              // === Fallback: create profile from Stripe customer data ===
              console.warn('⚠️ invoice.paid — no profile found, attempting auto-create for customer:', customerId);
              try {
                const custForCreate = customer as Stripe.Customer;
                const rawPhone = custForCreate.metadata?.phone;
                if (rawPhone) {
                  const cleanPhone = rawPhone.replace(/\D/g, '');
                  const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
                  
                  // Determine plan from subscription price
                  const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
                  const priceId = sub.items.data[0]?.price?.id;
                  let plan = 'essencial';
                  const priceEssencial = Deno.env.get('STRIPE_PRICE_ESSENCIAL_MONTHLY') || '';
                  const priceEssencialYearly = Deno.env.get('STRIPE_PRICE_ESSENCIAL_YEARLY') || '';
                  const priceDirecao = Deno.env.get('STRIPE_PRICE_DIRECAO_MONTHLY') || '';
                  const priceDirecaoYearly = Deno.env.get('STRIPE_PRICE_DIRECAO_YEARLY') || '';
                  const priceTransformacao = Deno.env.get('STRIPE_PRICE_TRANSFORMACAO_MONTHLY') || '';
                  const priceTransformacaoYearly = Deno.env.get('STRIPE_PRICE_TRANSFORMACAO_YEARLY') || '';
                  if (priceId === priceDirecao || priceId === priceDirecaoYearly) plan = 'direcao';
                  if (priceId === priceTransformacao || priceId === priceTransformacaoYearly) plan = 'transformacao';

                  const newUserId = crypto.randomUUID();
                  const { error: insertError } = await supabase
                    .from('profiles')
                    .insert({
                      user_id: newUserId,
                      name: custForCreate.name || custForCreate.metadata?.name || 'Usuário',
                      phone: formattedPhone,
                      email: custForCreate.email || null,
                      status: 'active',
                      plan,
                      converted_at: new Date().toISOString(),
                    });

                  if (insertError) {
                    console.error('❌ Failed to auto-create profile:', insertError);
                  } else {
                    console.log(`✅ Auto-created profile for ${formattedPhone} (plan: ${plan}) from invoice.paid`);
                  }
                } else {
                  console.warn('⚠️ Cannot auto-create profile: no phone in customer metadata');
                }
              } catch (autoCreateErr) {
                console.error('❌ Error in auto-create profile fallback:', autoCreateErr);
              }
            }
          }
        } catch (err) {
          console.error('❌ Error processing invoice.paid:', err);
        }
      }
    }

    // ========== invoice.payment_failed — dunning with audit trail ==========
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      console.log('🚨 [DUNNING-ENTRY] invoice.payment_failed BLOCK REACHED. invoice:', invoice.id, 'customer:', customerId, 'subscription:', invoice.subscription, 'amount:', invoice.amount_due);

      // Audit trail record
      const dunningRecord: Record<string, any> = {
        event_id: event.id,
        customer_id: customerId,
        invoice_id: invoice.id,
        subscription_id: invoice.subscription as string || null,
      };

      if (!invoice.subscription) {
        console.warn('⚠️ [DUNNING] invoice.subscription is NULL/falsy — skipping dunning but recording audit trail');
        dunningRecord.error_stage = 'no_subscription_on_invoice';
        dunningRecord.error_message = `invoice.subscription was ${String(invoice.subscription)}. billing_reason: ${invoice.billing_reason}`;
        try { await supabase.from('dunning_attempts').insert(dunningRecord); } catch (_) {}
      }

      if (invoice.subscription) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.deleted) {
            dunningRecord.error_stage = 'customer_deleted';
            dunningRecord.error_message = 'Stripe customer was deleted';
            await supabase.from('dunning_attempts').insert(dunningRecord);
            return new Response(JSON.stringify({ received: true }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const rawPhone = (customer as Stripe.Customer).metadata?.phone;
          dunningRecord.phone_raw = rawPhone || null;

          const { profile, phone, variationsTried } = await resolveProfileFromCustomer(supabase, customer as Stripe.Customer);
          dunningRecord.phone_resolved = phone;
          dunningRecord.profile_found = !!profile;
          dunningRecord.profile_user_id = profile?.user_id || null;

          if (!profile) {
            dunningRecord.error_stage = 'profile_not_found';
            dunningRecord.error_message = `No profile found. Phone raw: ${rawPhone}, email: ${(customer as Stripe.Customer).email}, variations tried: ${variationsTried.join(',')}`;
            console.error(`❌ [DUNNING] Profile not found for customer ${customerId}. Raw phone: ${rawPhone}, variations: ${variationsTried.join(',')}`);
            await supabase.from('dunning_attempts').insert(dunningRecord);
            return new Response(JSON.stringify({ received: true }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Insert early audit trail (fail-safe: survives crashes)
          const { data: insertedDunning } = await supabase
            .from('dunning_attempts')
            .insert({ ...dunningRecord, error_stage: 'in_progress' })
            .select('id')
            .single();
          console.log('📝 Dunning audit record created (in_progress):', insertedDunning?.id);

          // Step 1: Record payment failure on profile
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              payment_failed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', profile.id);

          if (updateError) {
            console.error('❌ Error updating profile on payment_failed:', updateError);
            dunningRecord.error_stage = 'profile_update_failed';
            dunningRecord.error_message = updateError.message;
            if (insertedDunning?.id) {
              await supabase.from('dunning_attempts').update({ error_stage: dunningRecord.error_stage, error_message: dunningRecord.error_message }).eq('id', insertedDunning.id);
            }
            return new Response(JSON.stringify({ received: true }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          console.log('✅ payment_failed_at recorded for:', profile.phone);
          const userName = profile.name || (customer as Stripe.Customer).name || 'Cliente';

          // Step 2: Create Billing Portal link
          try {
            const portalSession = await stripe.billingPortal.sessions.create({
              customer: customerId,
              return_url: 'https://olaaura.com.br',
            });

            console.log('🔗 Billing portal session created:', portalSession.url);
            dunningRecord.link_generated = true;

            // Step 3: Shorten URL
            let paymentLink = portalSession.url;
            try {
              const shortLinkResponse = await fetch(`${supabaseUrl}/functions/v1/create-short-link`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  url: portalSession.url,
                  phone: profile.phone,
                }),
              });

              if (shortLinkResponse.ok) {
                const shortLinkData = await shortLinkResponse.json();
                paymentLink = shortLinkData.shortUrl;
                console.log('🔗 Short link created:', paymentLink);
              } else {
                await shortLinkResponse.text(); // consume body to prevent resource leak
                console.warn('⚠️ Short link creation failed, using full URL');
              }
            } catch (shortLinkErr) {
              console.warn('⚠️ Short link error, using full URL:', shortLinkErr);
            }

            // Step 4: Send dunning email
            const recipientEmail = profile.email || (customer as Stripe.Customer).email;
            if (recipientEmail) {
              try {
                const emailResult = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    templateName: 'dunning-payment-failed',
                    recipientEmail,
                    idempotencyKey: `dunning-${event.id}`,
                    templateData: { name: userName, paymentLink },
                  }),
                });
                if (emailResult.ok) {
                  dunningRecord.whatsapp_sent = true; // reusing field as "notification_sent"
                  console.log('✅ Dunning email enqueued to:', recipientEmail);
                } else {
                  const errBody = await emailResult.text();
                  dunningRecord.error_stage = 'email_send_failed';
                  dunningRecord.error_message = errBody;
                  console.error('❌ Failed to send dunning email:', errBody);
                }
              } catch (emailErr) {
                const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
                dunningRecord.error_stage = 'email_send_failed';
                dunningRecord.error_message = errMsg;
                console.error('❌ Error sending dunning email:', errMsg);
              }
            } else {
              dunningRecord.error_stage = 'no_email';
              dunningRecord.error_message = 'No email found for dunning notification';
              console.warn('⚠️ No email available for dunning, skipping notification');
            }
          } catch (portalErr) {
            const errMsg = portalErr instanceof Error ? portalErr.message : String(portalErr);
            console.error('❌ Error creating billing portal or sending dunning:', errMsg);
            dunningRecord.error_stage = 'portal_or_send_failed';
            dunningRecord.error_message = errMsg;
          }

          // Update audit trail with final result
          if (insertedDunning?.id) {
            await supabase.from('dunning_attempts')
              .update({
                whatsapp_sent: dunningRecord.whatsapp_sent || false,
                link_generated: dunningRecord.link_generated || false,
                error_stage: dunningRecord.error_stage || null,
                error_message: dunningRecord.error_message || null,
              })
              .eq('id', insertedDunning.id);
          } else {
            // Fallback: insert if early insert failed
            await supabase.from('dunning_attempts').insert(dunningRecord);
          }

        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error('❌ Error processing invoice.payment_failed:', errMsg);
          dunningRecord.error_stage = 'unhandled_exception';
          dunningRecord.error_message = errMsg;
          try { await supabase.from('dunning_attempts').insert(dunningRecord); } catch (_) {}
        }
      }
    }

    // ========== customer.subscription.updated — trialing → active ==========
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const previousAttributes = (event.data as any).previous_attributes;
      console.log('🔄 Subscription updated:', subscription.id, 'status:', subscription.status);

      if (previousAttributes?.status === 'trialing' && subscription.status === 'active') {
        const customerId = subscription.customer as string;
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (!customer.deleted) {
            const { profile } = await resolveProfileFromCustomer(supabase, customer as Stripe.Customer);

            if (profile && ['trial', 'trial_expired'].includes(profile.status)) {
              const { error: updateError } = await supabase
                .from('profiles')
                .update({
                  status: 'active',
                  converted_at: new Date().toISOString(),
                  payment_failed_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', profile.id);

              if (updateError) {
                console.error('❌ Error updating profile on subscription.updated:', updateError);
              } else {
                console.log('✅ Trial → Active via subscription.updated for:', profile.phone);
                await supabase
                  .from('scheduled_tasks')
                  .update({ status: 'cancelled', executed_at: new Date().toISOString() })
                  .eq('user_id', profile.user_id)
                  .in('status', ['pending'])
                  .like('task_type', 'trial_%');
              }
            } else {
              console.warn('⚠️ subscription.updated trialing→active but no trial profile found for customer:', customerId);
            }
          }
        } catch (err) {
          console.error('❌ Error processing subscription.updated:', err);
        }
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
