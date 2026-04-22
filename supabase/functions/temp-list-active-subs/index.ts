import Stripe from "https://esm.sh/stripe@18.5.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
  const all: any[] = [];
  let hasMore = true; let after: string | undefined;
  while (hasMore) {
    const p: any = { status: "active", limit: 100, expand: ["data.customer"] };
    if (after) p.starting_after = after;
    const b = await stripe.subscriptions.list(p);
    all.push(...b.data); hasMore = b.has_more;
    if (b.data.length) after = b.data[b.data.length - 1].id;
  }
  const rows = all.map(s => {
    const c = s.customer as any;
    const phone = c?.metadata?.phone || c?.phone || "";
    return {
      cust_id: c.id, sub_id: s.id, name: c?.name||"", email: c?.email||"",
      phone_raw: phone, phone_norm: phone.replace(/\D/g,""),
      created: new Date(s.created*1000).toISOString().slice(0,10),
      price_id: s.items.data[0]?.price?.id,
    };
  });
  return new Response(JSON.stringify(rows), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
