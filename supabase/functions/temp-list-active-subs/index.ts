import Stripe from "https://esm.sh/stripe@18.5.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

  // Modo "payments": recebe lista de customer_ids e devolve último pagamento de cada um
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.customer_ids) && body.customer_ids.length) {
      const out: any[] = [];
      for (const cid of body.customer_ids) {
        const invs = await stripe.invoices.list({ customer: cid, limit: 5 });
        const paid = invs.data.filter((i: any) => i.status === "paid")
          .sort((a: any, b: any) => (b.status_transitions?.paid_at ?? 0) - (a.status_transitions?.paid_at ?? 0));
        const last = paid[0];
        const open = invs.data.find((i: any) => i.status === "open");
        out.push({
          cust_id: cid,
          last_paid_at: last?.status_transitions?.paid_at ? new Date(last.status_transitions.paid_at*1000).toISOString() : null,
          last_paid_amount_cents: last?.amount_paid ?? null,
          last_paid_invoice_id: last?.id ?? null,
          total_paid_invoices: paid.length,
          has_open_invoice: !!open,
          open_invoice_amount_cents: open?.amount_due ?? null,
        });
      }
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

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
