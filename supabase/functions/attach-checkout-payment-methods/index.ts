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
    const { dry_run = true, include_past_due = true, force_retry_invoices = false } = await req.json().catch(() => ({ dry_run: true, include_past_due: true, force_retry_invoices: false }));
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

    console.log(`🔧 [AttachPM] Starting (dry_run=${dry_run}, include_past_due=${include_past_due})`);

    const statuses: Stripe.SubscriptionListParams.Status[] = ['trialing'];
    if (include_past_due) statuses.push('past_due');

    const allSubs: Stripe.Subscription[] = [];
    for (const status of statuses) {
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

    console.log(`📋 [AttachPM] Found ${allSubs.length} subscriptions to check`);

    const results: any[] = [];

    for (const sub of allSubs) {
      const customer = sub.customer as Stripe.Customer;
      if (!customer || customer.deleted) continue;

      const report: any = {
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        subscription_id: sub.id,
        subscription_status: sub.status,
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      };

      // Check existing payment methods on customer
      const existingPMs = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card',
        limit: 10,
      });

      report.existing_cards = existingPMs.data.map(pm => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        exp: `${pm.card?.exp_month}/${pm.card?.exp_year}`,
      }));

      // Check current default PM
      const subDefaultPM = sub.default_payment_method;
      const custDefaultPM = customer.invoice_settings?.default_payment_method;
      report.sub_default_pm = subDefaultPM ? (typeof subDefaultPM === 'string' ? subDefaultPM : subDefaultPM.id) : null;
      report.cust_default_pm = custDefaultPM ? (typeof custDefaultPM === 'string' ? custDefaultPM : custDefaultPM.id) : null;

      // Find the original checkout session for this subscription
      let checkoutSession: Stripe.Checkout.Session | null = null;
      try {
        const sessions = await stripe.checkout.sessions.list({
          subscription: sub.id,
          limit: 1,
          expand: ['data.setup_intent'],
        });
        if (sessions.data.length > 0) {
          checkoutSession = sessions.data[0];
        }
      } catch (e: any) {
        report.checkout_error = e.message;
      }

      if (!checkoutSession) {
        report.status = 'no_checkout_session';
        report.reason = 'Could not find original checkout session';
        results.push(report);
        continue;
      }

      report.checkout_session_id = checkoutSession.id;
      report.checkout_payment_status = checkoutSession.payment_status;

      // Try to get payment method from setup_intent
      let paymentMethodId: string | null = null;

      // Method 1: From setup_intent
      const setupIntent = checkoutSession.setup_intent;
      if (setupIntent) {
        const si = typeof setupIntent === 'string'
          ? await stripe.setupIntents.retrieve(setupIntent, { expand: ['payment_method'] })
          : setupIntent;
        
        if (si.payment_method) {
          paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method.id;
          report.pm_source = 'setup_intent';
        }
      }

      // Method 2: From payment_intent (if no setup_intent)
      if (!paymentMethodId && checkoutSession.payment_intent) {
        const pi = typeof checkoutSession.payment_intent === 'string'
          ? await stripe.paymentIntents.retrieve(checkoutSession.payment_intent)
          : checkoutSession.payment_intent;
        
        if (pi.payment_method) {
          paymentMethodId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method.id;
          report.pm_source = 'payment_intent';
        }
      }

      // Method 3: If we still don't have a PM, use the first existing card
      if (!paymentMethodId && existingPMs.data.length > 0) {
        paymentMethodId = existingPMs.data[0].id;
        report.pm_source = 'existing_card';
      }

      if (!paymentMethodId) {
        report.status = 'no_payment_method';
        report.reason = 'No payment method found anywhere';
        results.push(report);
        continue;
      }

      report.payment_method_id = paymentMethodId;

      // Check if PM is already attached to customer
      let pmAttached = existingPMs.data.some(pm => pm.id === paymentMethodId);
      report.pm_already_attached = pmAttached;

      // Check if defaults are already set correctly
      const subHasCorrectDefault = report.sub_default_pm === paymentMethodId;
      const custHasCorrectDefault = report.cust_default_pm === paymentMethodId;

      if (subHasCorrectDefault && custHasCorrectDefault && pmAttached) {
        report.status = 'already_correct';
        report.reason = 'PM attached and set as default everywhere';
        results.push(report);
        continue;
      }

      // Need to fix
      report.needs_attach = !pmAttached;
      report.needs_sub_default = !subHasCorrectDefault;
      report.needs_cust_default = !custHasCorrectDefault;

      if (!dry_run) {
        try {
          // Attach PM to customer if not attached
          if (!pmAttached) {
            await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
            report.attached = true;
          }

          // Set as default on subscription
          await stripe.subscriptions.update(sub.id, {
            default_payment_method: paymentMethodId,
          });
          report.sub_default_set = true;

          // Set as default on customer invoice settings
          await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
          report.cust_default_set = true;

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
                  payment_method: paymentMethodId,
                });
                report.invoice_retried = true;
                report.invoice_id = invoices.data[0].id;
              }
            } catch (invoiceErr: any) {
              report.invoice_retry_error = invoiceErr.message;
            }
          }

          report.status = 'fixed';
          report.reason = 'Payment method attached and set as default';
        } catch (fixErr: any) {
          report.status = 'fix_error';
          report.reason = fixErr.message;
        }
      } else {
        report.status = 'would_fix';
        report.reason = `Would attach=${!pmAttached}, set_sub_default=${!subHasCorrectDefault}, set_cust_default=${!custHasCorrectDefault}`;
      }

      results.push(report);
    }

    const summary = {
      total_checked: allSubs.length,
      already_correct: results.filter(r => r.status === 'already_correct').length,
      would_fix: results.filter(r => r.status === 'would_fix').length,
      fixed: results.filter(r => r.status === 'fixed').length,
      no_payment_method: results.filter(r => r.status === 'no_payment_method').length,
      no_checkout_session: results.filter(r => r.status === 'no_checkout_session').length,
      fix_error: results.filter(r => r.status === 'fix_error').length,
      dry_run,
      details: results,
    };

    console.log(`✅ [AttachPM] Done: ${summary.already_correct} correct, ${summary.would_fix || summary.fixed} ${dry_run ? 'would fix' : 'fixed'}, ${summary.no_payment_method} no PM`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ [AttachPM] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
