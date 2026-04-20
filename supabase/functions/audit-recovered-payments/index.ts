import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '180', 10);

  const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' as any });
  const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  const recovered: any[] = [];
  let total = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: any = {
      status: 'paid',
      created: { gte: since },
      limit: 100,
    };
    if (startingAfter) params.starting_after = startingAfter;

    const resp = await stripe.invoices.list(params);
    for (const inv of resp.data) {
      total++;
      const attempts = inv.attempt_count ?? 0;
      if (attempts > 1) {
        let name: string | null = null;
        let email: string | null = null;
        let phone: string | null = null;
        try {
          const cust: any = await stripe.customers.retrieve(inv.customer as string);
          if (!cust.deleted) {
            name = cust.name ?? null;
            email = cust.email ?? null;
            phone = cust.metadata?.phone ?? null;
          }
        } catch (_) {}

        recovered.push({
          invoice_id: inv.id,
          customer_id: inv.customer,
          name, email, phone,
          amount_brl: (inv.amount_paid / 100).toFixed(2),
          currency: inv.currency,
          attempt_count: attempts,
          billing_reason: inv.billing_reason,
          subscription_id: (inv as any).subscription || null,
          created_at: new Date(inv.created * 1000).toISOString(),
          paid_at: (inv as any).status_transitions?.paid_at
            ? new Date((inv as any).status_transitions.paid_at * 1000).toISOString()
            : null,
        });
      }
    }
    hasMore = resp.has_more;
    if (resp.data.length > 0) startingAfter = resp.data[resp.data.length - 1].id;
  }

  return new Response(JSON.stringify({
    window_days: days,
    total_paid_invoices: total,
    recovered_count: recovered.length,
    recovered,
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
