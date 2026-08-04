// Backfill one-shot: preenche profiles.billing_cycle pra usuários ativos que
// estão com NULL. Lê a assinatura ativa no Stripe (por email) e detecta o ciclo
// pelo priceId. Para PIX Asaas, infere via asaas_payments.billing_period.
//
// Uso: invoke sem body. Retorna {processed, stripe_synced, asaas_synced, skipped}.
// Idempotente: roda quantas vezes precisar; só toca quem está com billing_cycle null.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECURRING_PRICES: Record<string, string> = {
  "price_1TZyoCQU15XnZ7VvyI45t8um": "quarterly",
  "price_1U0pUoQU15XnZ7Vvqc4DcNi2": "quarterly",
  "price_1TZyoDQU15XnZ7VvOegMIXQi": "semiannual",
  "price_1U0pVHQU15XnZ7VvvCChiLHP": "semiannual",
  "price_1TZyoEQU15XnZ7Vvx02qKKPF": "yearly",
  "price_1U0pW5QU15XnZ7VvBVHvYUnU": "yearly",
  "price_1TZyoFQU15XnZ7VvAfRFoTOh": "quarterly",
  "price_1U0pWPQU15XnZ7VviqtmRsYR": "quarterly",
  "price_1TZyoGQU15XnZ7VvZiGk2ifY": "semiannual",
  "price_1U0pWhQU15XnZ7VvEveOB9DP": "semiannual",
  "price_1TZyoHQU15XnZ7VvwUFUX9Bm": "yearly",
  "price_1U0pYFQU15XnZ7Vvu6ylUTEM": "yearly",
  "price_1TZyoIQU15XnZ7VvCMjzuaZr": "quarterly",
  "price_1U0pa7QU15XnZ7VvEqEFDPWg": "quarterly",
  "price_1TZyoJQU15XnZ7Vv3FqH75Nb": "semiannual",
  "price_1U0paYQU15XnZ7VvmTzRNyGG": "semiannual",
  "price_1TZyoKQU15XnZ7VvJzJNnub7": "yearly",
  "price_1U0pavQU15XnZ7VvQErVkBV7": "yearly",
};

function detectCycle(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const monthlyIds = [
    Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_DIRECAO_MONTHLY"),
    Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_MONTHLY"),
  ].filter(Boolean) as string[];
  if (monthlyIds.includes(priceId)) return "monthly";
  const yearlyIds = [
    Deno.env.get("STRIPE_PRICE_ESSENCIAL_YEARLY"),
    Deno.env.get("STRIPE_PRICE_DIRECAO_YEARLY"),
    Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_YEARLY"),
  ].filter(Boolean) as string[];
  if (yearlyIds.includes(priceId)) return "yearly";
  return RECURRING_PRICES[priceId] ?? null;
}

// Mapeia billing_period do Asaas pra nosso enum
function asaasCycle(period: string | null | undefined): string | null {
  if (!period) return null;
  const p = period.toUpperCase();
  if (p === "MONTHLY") return "monthly";
  if (p === "QUARTERLY") return "quarterly";
  if (p === "SEMIANNUALLY" || p === "SEMIANNUAL") return "semiannual";
  if (p === "YEARLY" || p === "ANNUALLY") return "yearly";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY missing" }), { status: 500, headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, user_id, email, plan, status, asaas_customer_id")
    .is("billing_cycle", null)
    .in("status", ["active", "trial"])
    .limit(500);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  let stripeSynced = 0;
  let asaasSynced = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of profiles ?? []) {
    try {
      // 1) PIX Asaas: pega billing_period da última payment com subscription_id
      if (p.asaas_customer_id) {
        const { data: ap } = await supabase
          .from("asaas_payments")
          .select("billing_period")
          .eq("asaas_customer_id", p.asaas_customer_id)
          .not("asaas_subscription_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const cycle = asaasCycle(ap?.billing_period);
        if (cycle) {
          await supabase.from("profiles").update({ billing_cycle: cycle }).eq("id", p.id);
          asaasSynced++;
          continue;
        }
      }

      // 2) Stripe: lookup por email
      if (!p.email) { skipped++; continue; }
      const customers = await stripe.customers.list({ email: p.email, limit: 5 });
      let cycle: string | null = null;
      for (const c of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 5 });
        const sub = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
        const priceId = sub?.items?.data?.[0]?.price?.id;
        const detected = detectCycle(priceId);
        if (detected) { cycle = detected; break; }
      }
      if (cycle) {
        await supabase.from("profiles").update({ billing_cycle: cycle }).eq("id", p.id);
        stripeSynced++;
      } else {
        skipped++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${p.email}: ${msg}`);
      skipped++;
    }
  }

  return new Response(
    JSON.stringify({
      processed: profiles?.length ?? 0,
      stripe_synced: stripeSynced,
      asaas_synced: asaasSynced,
      skipped,
      errors: errors.slice(0, 20),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});