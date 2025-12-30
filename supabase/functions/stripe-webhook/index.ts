import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
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

      if (!customerPhone) {
        console.error('❌ No phone number found in session');
        return new Response(JSON.stringify({ error: 'No phone number' }), {
          status: 200, // Return 200 to acknowledge receipt
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`👤 Customer: ${customerName}, Phone: ${customerPhone}`);

      // Mensagem de boas-vindas personalizada
      const welcomeMessage = `Oi, ${customerName}! 🌟 Que bom te receber por aqui.

Eu sou a AURA — e vou ficar com você nessa jornada.

Comigo, você pode falar com liberdade: sem julgamento, no seu ritmo.

Me diz: como você está hoje?`;

      // Send welcome message via Z-API
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
          console.error('❌ Failed to send welcome message:', errorText);
        } else {
          console.log('✅ Welcome message sent successfully!');
        }
      } catch (sendError) {
        console.error('❌ Error sending welcome message:', sendError);
      }

      // Create user profile in database
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const cleanPhone = customerPhone.replace(/\D/g, '');
        
        // Check if profile already exists
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', cleanPhone)
          .single();

        if (!existingProfile) {
          // Create new profile
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              name: customerName,
              phone: cleanPhone,
              subscription_status: 'active',
              subscription_start: new Date().toISOString(),
            });

          if (insertError) {
            console.error('❌ Error creating profile:', insertError);
          } else {
            console.log('✅ Profile created successfully');
          }
        } else {
          // Update existing profile
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              name: customerName,
              subscription_status: 'active',
              subscription_start: new Date().toISOString(),
            })
            .eq('phone', cleanPhone);

          if (updateError) {
            console.error('❌ Error updating profile:', updateError);
          } else {
            console.log('✅ Profile updated successfully');
          }
        }
      } catch (dbError) {
        console.error('❌ Database error:', dbError);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Webhook error:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
