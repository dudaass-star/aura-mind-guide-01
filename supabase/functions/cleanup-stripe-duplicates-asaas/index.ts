// One-off: cancela subs Stripe (active/past_due/trialing) de clientes que
// migraram pra PIX Asaas. Chamado manualmente com { emails: string[], dry_run?: boolean }.
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { emails = [], dry_run = true } = await req.json();
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: any[] = [];

    for (const email of emails) {
      const customers = await stripe.customers.list({ email, limit: 10 });
      for (const c of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
        for (const s of subs.data) {
          if (!["active", "past_due", "trialing"].includes(s.status)) continue;
          if (dry_run) {
            results.push({ email, customer: c.id, sub: s.id, status: s.status, action: "would_cancel" });
          } else {
            await stripe.subscriptions.cancel(s.id, { invoice_now: false, prorate: false });
            results.push({ email, customer: c.id, sub: s.id, status: s.status, action: "canceled" });
          }
        }
      }
    }

    return new Response(JSON.stringify({ dry_run, count: results.length, results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});