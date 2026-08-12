import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { resolveProfile } from "../_shared/profile-resolver.ts";
import { sendDunningWhatsApp, sendDunningWhatsAppDegraded } from "../_shared/dunning-whatsapp.ts";

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

  const { customer_ids, woovi_subscription_ids } = await req.json();

  // ---- Trilho PIX Automático (Woovi) --------------------------------------
  // Sem cartão não existe fatura Stripe pra reprocessar: o que reenviamos é o
  // aviso da cobrança de ciclo que não entrou, na mesma escada de dunning
  // (2 avisos → oferta), com o QR da cobrança pendente quando ela existe.
  if (Array.isArray(woovi_subscription_ids) && woovi_subscription_ids.length > 0) {
    const wooviResults: Record<string, any>[] = [];
    for (const subId of woovi_subscription_ids) {
      const out: Record<string, any> = { subscription_id: subId };
      try {
        const { data: sub } = await supabase
          .from('woovi_subscriptions')
          .select('id, user_id, subscription_id, customer_email, customer_phone, customer_name, value_cents, plan')
          .eq('subscription_id', subId)
          .maybeSingle();
        if (!sub) {
          out.status = 'skipped';
          out.reason = 'mandato não encontrado';
          wooviResults.push(out);
          continue;
        }

        const profile = await resolveProfile(supabase, {
          userId: sub.user_id || undefined,
          email: sub.customer_email || undefined,
          phone: sub.customer_phone || undefined,
        });

        const { data: pending } = await supabase
          .from('woovi_charges')
          .select('installment_id, value_cents, due_date, status')
          .eq('subscription_id', subId)
          .is('paid_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!profile) {
          out.status = 'skipped';
          out.reason = 'perfil não resolvido';
          wooviResults.push(out);
          continue;
        }

        const res = await sendDunningWhatsApp({
          supabase,
          profile,
          eventId: `reprocess-woovi-${subId}-${Date.now()}`,
          provider: 'woovi',
          subscriptionId: subId,
          paymentId: pending?.installment_id || null,
          paymentMethod: 'PIX',
          skipWindowCheck: true,
        });
        out.status = res?.sent ? 'sent' : 'not_sent';
        out.detail = res;
        out.pending_charge = pending?.installment_id || null;
      } catch (e) {
        out.status = 'error';
        out.error = (e as Error).message;
      }
      wooviResults.push(out);
    }
    return new Response(JSON.stringify({ provider: 'woovi', results: wooviResults }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

        // Modo degradado: sem profile ainda dá pra recuperar o pagamento —
        // usamos o telefone do gateway + link da fatura/portal (aviso genérico).
        if (rawPhone) {
          let degradedLink = invoice?.hosted_invoice_url || null;
          if (!degradedLink) {
            try {
              const portal = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: 'https://olaaura.com.br',
              });
              degradedLink = portal.url;
            } catch (_) { /* sem link → não envia */ }
          }
          if (degradedLink) {
            const degraded = await sendDunningWhatsAppDegraded({
              supabase,
              phone: rawPhone,
              name: cust.name,
              link: degradedLink,
              eventId: `${dunningRecord.event_id}-degraded`,
              provider: 'stripe',
              invoiceId: invoice?.id || null,
              subscriptionId: dunningRecord.subscription_id,
              customerId,
            });
            report.degraded_whatsapp = degraded;
          } else {
            report.degraded_whatsapp = { sent: false, skipped: 'no_link' };
          }
        } else {
          report.degraded_whatsapp = { sent: false, skipped: 'no_phone' };
        }

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
          await shortResp.text();
        }
      } catch (_) { /* use full URL */ }

      // 7a. WhatsApp é o canal principal de recuperação: dispara o degrau da
      // cadência do ciclo (aviso 1/2 → 30% off → Lite). O helper grava o
      // próprio registro em dunning_attempts e respeita o teto por ciclo.
      try {
        const wa = await sendDunningWhatsApp({
          supabase,
          profile: { user_id: profile.user_id, phone: profile.phone, name: profile.name },
          eventId: `${dunningRecord.event_id}-wa`,
          provider: 'stripe',
          invoiceId: invoice?.id || null,
          subscriptionId: dunningRecord.subscription_id,
          customerId,
        });
        report.whatsapp = wa;
      } catch (waErr) {
        report.whatsapp = { sent: false, error: waErr instanceof Error ? waErr.message : String(waErr) };
      }

      // 7b. E-mail como canal secundário (sempre acompanha o WhatsApp).
      const userName = profile.name || cust.name || 'Cliente';
      const recipientEmail = profile.email || cust.email;

      if (recipientEmail) {
        try {
          const { data: emailData, error: emailErr } = await supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'dunning-payment-failed',
              recipientEmail,
              idempotencyKey: `reprocess-dunning-${customerId}-${Date.now()}`,
              templateData: { name: userName, paymentLink },
            },
          });

          if (!emailErr) {
            dunningRecord.whatsapp_sent = true; // reusing field as notification_sent
            report.email_sent = true;
          } else {
            const errBody = JSON.stringify(emailErr);
            dunningRecord.error_stage = 'email_send_failed';
            dunningRecord.error_message = errBody;
            report.email_sent = false;
          }
        } catch (emailErr) {
          const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          dunningRecord.error_stage = 'email_send_failed';
          dunningRecord.error_message = errMsg;
          report.email_sent = false;
        }
      } else {
        dunningRecord.error_stage = 'no_email';
        dunningRecord.error_message = 'No email found for dunning';
        report.email_sent = false;
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
