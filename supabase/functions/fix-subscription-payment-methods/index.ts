import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not set' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { dry_run = true } = await req.json().catch(() => ({ dry_run: true }));
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    console.log(`🔧 [FixPM] Starting (dry_run=${dry_run})`);

    // Get all subscriptions that are trialing, active, or past_due
    const allSubs: Stripe.Subscription[] = [];
    for (const status of ['trialing', 'active', 'past_due'] as const) {
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const params: any = { status, limit: 100, expand: ['data.customer'] };
        if (startingAfter) params.starting_after = startingAfter;
        const subs = await stripe.subscriptions.list(params);
        allSubs.push(...subs.data);
        hasMore = subs.has_more;
        if (subs.data.length > 0) startingAfter = subs.data[subs.data.length - 1].id;
      }
    }

    console.log(`📋 [FixPM] Found ${allSubs.length} subscriptions to check`);

    const results: any[] = [];

    for (const sub of allSubs) {
      const customer = sub.customer as Stripe.Customer;
      if (!customer || customer.deleted) continue;

      const report: any = {
        customer_id: customer.id,
        customer_name: customer.name,
        subscription_id: sub.id,
        subscription_status: sub.status,
      };

      // Check if subscription already has a default payment method
      const subDefaultPM = sub.default_payment_method;
      const custDefaultPM = customer.invoice_settings?.default_payment_method;

      if (subDefaultPM) {
        report.status = 'ok';
        report.reason = 'Subscription already has default PM';
        report.payment_method_id = typeof subDefaultPM === 'string' ? subDefaultPM : subDefaultPM.id;
        results.push(report);
        continue;
      }

      if (custDefaultPM) {
        report.status = 'ok';
        report.reason = 'Customer has default PM on invoice_settings';
        report.payment_method_id = typeof custDefaultPM === 'string' ? custDefaultPM : custDefaultPM.id;
        results.push(report);
        continue;
      }

      // No default PM — look for any attached payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card',
        limit: 5,
      });

      if (paymentMethods.data.length === 0) {
        report.status = 'no_card';
        report.reason = 'No payment methods found on customer';
        results.push(report);
        continue;
      }

      // Found a card — set it as default
      const pm = paymentMethods.data[0];
      report.payment_method_id = pm.id;
      report.card_brand = pm.card?.brand;
      report.card_last4 = pm.card?.last4;

      if (!dry_run) {
        // Set as default on subscription
        await stripe.subscriptions.update(sub.id, {
          default_payment_method: pm.id,
        });

        // Also set as default on customer invoice settings
        await stripe.customers.update(customer.id, {
          invoice_settings: { default_payment_method: pm.id },
        });

        // If past_due, retry the latest open invoice
        if (sub.status === 'past_due') {
          try {
            const invoices = await stripe.invoices.list({
              subscription: sub.id,
              status: 'open',
              limit: 1,
            });
            if (invoices.data.length > 0) {
              await stripe.invoices.pay(invoices.data[0].id, {
                payment_method: pm.id,
              });
              report.invoice_retried = true;
              report.invoice_id = invoices.data[0].id;
            }
          } catch (invoiceErr: any) {
            report.invoice_retry_error = invoiceErr.message;
          }
        }

        report.status = 'fixed';
        report.reason = 'Default PM set on subscription + customer';
      } else {
        report.status = 'would_fix';
        report.reason = `Would set ${pm.card?.brand} •••${pm.card?.last4} as default`;
      }

      results.push(report);
    }

    const summary = {
      total_checked: allSubs.length,
      ok: results.filter(r => r.status === 'ok').length,
      fixed: results.filter(r => r.status === 'fixed').length,
      would_fix: results.filter(r => r.status === 'would_fix').length,
      no_card: results.filter(r => r.status === 'no_card').length,
      dry_run,
      details: results,
    };

    console.log(`✅ [FixPM] Done: ${summary.ok} ok, ${summary.fixed || summary.would_fix} ${dry_run ? 'would fix' : 'fixed'}, ${summary.no_card} no card`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ [FixPM] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
