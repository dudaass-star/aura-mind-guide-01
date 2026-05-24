import Stripe from "https://esm.sh/stripe@18.5.0";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  // Mapa por email pra deduplicar (mantém o customer mais recente com cartão)
  const byEmail = new Map<string, { name: string; email: string; phone: string; created: number }>();

  let hasMore = true;
  let starting_after: string | undefined;
  let totalScanned = 0;
  let totalWithCard = 0;

  while (hasMore) {
    const params: any = { limit: 100 };
    if (starting_after) params.starting_after = starting_after;
    const batch = await stripe.customers.list(params);
    totalScanned += batch.data.length;

    // Checa cartão pra cada customer (em paralelo, limitando 20 por vez)
    const checks = batch.data.map(async (c) => {
      try {
        const pms = await stripe.paymentMethods.list({ customer: c.id, type: "card", limit: 1 });
        if (pms.data.length === 0) return null;
        const email = (c.email || "").trim().toLowerCase();
        if (!email) return null;
        const rawPhone = (c.metadata?.phone || c.phone || "").trim();
        const normalized = rawPhone ? normalizeBrazilianPhone(rawPhone) : "";
        const phoneE164 = normalized ? `+${normalized}` : "";
        return {
          name: c.name || "",
          email,
          phone: phoneE164,
          created: c.created,
        };
      } catch (e) {
        console.error("PM list failed for", c.id, e instanceof Error ? e.message : e);
        return null;
      }
    });
    const results = await Promise.all(checks);
    for (const r of results) {
      if (!r) continue;
      totalWithCard++;
      const prev = byEmail.get(r.email);
      if (!prev || r.created > prev.created) byEmail.set(r.email, r);
    }

    hasMore = batch.has_more;
    if (batch.data.length) starting_after = batch.data[batch.data.length - 1].id;
    console.log(`Scanned ${totalScanned} customers, ${totalWithCard} with card so far`);
  }

  const rows = Array.from(byEmail.values()).map(({ name, email, phone }) => ({ name, email, phone }));
  return new Response(
    JSON.stringify({ total_scanned: totalScanned, total_with_card: totalWithCard, unique_emails: rows.length, rows }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});