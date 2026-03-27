import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { resolveProfile } from "../_shared/profile-resolver.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Note: This is a one-time manual function. Auth is handled by verify_jwt=false + internal use only.

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

  const { customer_ids } = await req.json();
  if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
    return new Response(JSON.stringify({ error: 'customer_ids array required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Record<string, any>[] = [];

  for (const customerId of customer_ids) {
    const report: Record<string, any> = { customer_id: customerId };
    const dunningRecord: Record<string, any> = {
      event_id: `reprocess-${customerId}-${Date.now()}`,
      customer_id: customerId,
    };

    try {
      // 1. Fetch Stripe customer
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        report.status = 'skipped';
        report.reason = 'customer deleted';
        dunningRecord.error_stage = 'customer_deleted';
        dunningRecord.error_message = 'Stripe customer was deleted';
        await supabase.from('dunning_attempts').insert(dunningRecord);
        results.push(report);
        continue;
      }

      const cust = customer as Stripe.Customer;
      report.name = cust.name;
      report.email = cust.email;
      const rawPhone = cust.metadata?.phone;
      report.phone_raw = rawPhone;
      dunningRecord.phone_raw = rawPhone || null;

      // 2. Find open invoice
      const invoices = await stripe.invoices.list({
        customer: customerId,
        status: 'open',
        limit: 1,
      });
      const invoice = invoices.data[0];
      dunningRecord.invoice_id = invoice?.id || null;
      dunningRecord.subscription_id = (invoice?.subscription as string) || null;

      // 3. Resolve profile
      const { profile, phoneUsed, variationsTried } = await resolveProfile(
        supabase, rawPhone, cust.email,
      );
      dunningRecord.phone_resolved = phoneUsed;
      dunningRecord.profile_found = !!profile;
      dunningRecord.profile_user_id = profile?.user_id || null;
      report.profile_found = !!profile;
      report.phone_resolved = phoneUsed;

      if (!profile) {
        report.status = 'failed';
        report.reason = `No profile found. Variations: ${variationsTried.join(',')}`;
        dunningRecord.error_stage = 'profile_not_found';
        dunningRecord.error_message = report.reason;
        await supabase.from('dunning_attempts').insert(dunningRecord);
        results.push(report);
        continue;
      }

      // 4. Update payment_failed_at
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          payment_failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (updateError) {
        report.status = 'failed';
        report.reason = `Profile update error: ${updateError.message}`;
        dunningRecord.error_stage = 'profile_update_failed';
        dunningRecord.error_message = updateError.message;
        await supabase.from('dunning_attempts').insert(dunningRecord);
        results.push(report);
        continue;
      }

      // 5. Create Billing Portal link
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://olaaura.com.br',
      });
      dunningRecord.link_generated = true;

      // 6. Shorten URL
      let paymentLink = portalSession.url;
      try {
        const shortResp = await fetch(`${supabaseUrl}/functions/v1/create-short-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ url: portalSession.url, phone: profile.phone }),
        });
        if (shortResp.ok) {
          const shortData = await shortResp.json();
          paymentLink = shortData.shortUrl;
        } else {
          await shortResp.text(); // consume body to prevent resource leak
        }
      } catch (_) { /* use full URL */ }

      // 7. Send WhatsApp
      const userName = profile.name || cust.name || 'Cliente';
      const dunningMessage = `Oi, ${userName}! 💜

Não conseguimos processar seu pagamento da AURA.

Você pode atualizar seu cartão aqui: ${paymentLink}

Se preferir cancelar, é só me avisar. Sem problemas. 💜`;

      const msgResponse = await fetch(`${supabaseUrl}/functions/v1/send-zapi-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          phone: profile.phone,
          message: dunningMessage,
          isAudio: false,
          user_id: profile.user_id,
        }),
      });

      if (!msgResponse.ok) {
        const errText = await msgResponse.text();
        dunningRecord.error_stage = 'whatsapp_send_failed';
        dunningRecord.error_message = errText;
        report.whatsapp_sent = false;
      } else {
        await msgResponse.text(); // consume body
        dunningRecord.whatsapp_sent = true;
        report.whatsapp_sent = true;
      }

      report.status = dunningRecord.whatsapp_sent ? 'success' : 'partial';
      await supabase.from('dunning_attempts').insert(dunningRecord);
      results.push(report);

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      report.status = 'error';
      report.reason = errMsg;
      dunningRecord.error_stage = 'unhandled_exception';
      dunningRecord.error_message = errMsg;
      try { await supabase.from('dunning_attempts').insert(dunningRecord); } catch (_) {}
      results.push(report);
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
