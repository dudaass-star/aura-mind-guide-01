import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { recordRetentionOfferEvent } from "../_shared/retention-offers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (req.headers.get("authorization") !== `Bearer ${serviceKey}`) return json({ error: "Não autorizado" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; limit?: number };
  const dryRun = body.dry_run !== false;
  const limit = Math.min(Math.max(Number(body.limit || 100), 1), 250);
  const staleBefore = new Date(Date.now() - 15 * 60000).toISOString();
  const { data: offers, error } = await supabase.from("retention_offers").select("*")
    .in("status", ["accepted", "payment_pending", "paid"])
    .lt("updated_at", staleBefore).order("updated_at").limit(limit);
  if (error) return json({ error: error.message }, 500);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2023-10-16" }) : null;
  const results: Record<string, unknown>[] = [];

  for (const offer of offers || []) {
    let observed = offer.status;
    let reference: string | null = null;
    try {
      if (offer.gateway === "stripe" && stripe && offer.provider_subscription_id) {
        const invoices = await stripe.invoices.list({ subscription: offer.provider_subscription_id, status: "paid", limit: 3 });
        const paid = invoices.data.find((invoice: Stripe.Invoice) => Number(invoice.amount_paid || 0) > 0 && invoice.created * 1000 >= new Date(offer.created_at).getTime());
        if (paid) { observed = "paid"; reference = paid.id; }
      } else if ((offer.gateway === "woovi" || offer.gateway === "woovi_pix") && offer.provider_subscription_id) {
        const { data: sub } = await supabase.from("woovi_subscriptions").select("id,entry_paid_at")
          .eq("subscription_id", offer.provider_subscription_id).maybeSingle();
        if (sub) {
          const { data: charge } = await supabase.from("woovi_charges").select("installment_id,paid_at")
            .eq("subscription_id", offer.provider_subscription_id).not("paid_at", "is", null)
            .gte("paid_at", offer.created_at).order("paid_at", { ascending: false }).limit(1).maybeSingle();
          if (charge?.paid_at) { observed = "paid"; reference = charge.installment_id || offer.provider_subscription_id; }
        }
      }

      if (!dryRun && observed === "paid" && offer.status !== "applied") {
        await supabase.from("retention_offers").update({ provider_payment_id: reference }).eq("id", offer.id);
        if (offer.status !== "paid") await recordRetentionOfferEvent(supabase, offer.id, "paid", "retention_reconciler", reference);
        await recordRetentionOfferEvent(supabase, offer.id, "applied", "retention_reconciler", reference);
        await recordRetentionOfferEvent(supabase, offer.id, "reconciled", "retention_reconciler", reference);
      }
      results.push({ offer_id: offer.id, gateway: offer.gateway, before: offer.status, observed, reference });
    } catch (err) {
      results.push({ offer_id: offer.id, gateway: offer.gateway, before: offer.status, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return json({ dry_run: dryRun, processed: results.length, results });
});