import Stripe from "https://esm.sh/stripe@18.5.0";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

type Row = { name: string; email: string; phone: string; created: number };

function upsert(map: Map<string, Row>, r: Row) {
  if (!r.email) return;
  const prev = map.get(r.email);
  if (!prev) { map.set(r.email, r); return; }
  if (!prev.name && r.name) prev.name = r.name;
  if (!prev.phone && r.phone) prev.phone = r.phone;
  if (r.created > prev.created) prev.created = r.created;
}

function toRow(name: string, email: string, phoneRaw: string, created: number): Row | null {
  const e = (email || "").trim().toLowerCase();
  if (!e) return null;
  const normalized = phoneRaw ? normalizeBrazilianPhone(phoneRaw.trim()) : "";
  const phone = normalized ? `+${normalized}` : "";
  return { name: (name || "").trim(), email: e, phone, created: created || 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  const url = new URL(req.url);
  const source = (url.searchParams.get("source") || "charges").toLowerCase();
  const maxMs = Number(url.searchParams.get("max_ms") || 20000);
  const deadline = Date.now() + maxMs;
  const cursorIn = url.searchParams.get("starting_after") || undefined;

  const byEmail = new Map<string, Row>();
  const customerCache = new Map<string, { email: string; name: string; phone: string }>();

  async function resolveCustomer(id: string) {
    if (customerCache.has(id)) return customerCache.get(id)!;
    try {
      const c = await stripe.customers.retrieve(id);
      if ((c as any).deleted) {
        const empty = { email: "", name: "", phone: "" };
        customerCache.set(id, empty);
        return empty;
      }
      const cc = c as Stripe.Customer;
      const data = {
        email: cc.email || "",
        name: cc.name || "",
        phone: ((cc.metadata?.phone as string) || cc.phone || ""),
      };
      customerCache.set(id, data);
      return data;
    } catch {
      const empty = { email: "", name: "", phone: "" };
      customerCache.set(id, empty);
      return empty;
    }
  }

  const stats: Record<string, number> = { scanned: 0 };
  let cursorOut: string | undefined;
  let done = false;

  try {
    let starting_after: string | undefined = cursorIn;
    while (true) {
      if (Date.now() > deadline) { cursorOut = starting_after; break; }
      const params: any = { limit: 100 };
      if (starting_after) params.starting_after = starting_after;

      if (source === "charges") {
        const batch = await stripe.charges.list(params);
        stats.scanned += batch.data.length;
        for (const ch of batch.data) {
          if (ch.payment_method_details?.type !== "card") continue;
          const bd: any = ch.billing_details || {};
          let name = bd.name || "";
          let email = bd.email || "";
          let phone = bd.phone || "";
          if ((!email || !name || !phone) && typeof ch.customer === "string") {
            const c = await resolveCustomer(ch.customer);
            email = email || c.email;
            name = name || c.name;
            phone = phone || c.phone;
          }
          const r = toRow(name, email, phone, ch.created);
          if (r) upsert(byEmail, r);
        }
        if (!batch.has_more) { done = true; break; }
        starting_after = batch.data[batch.data.length - 1].id;
        cursorOut = starting_after;
        console.log(`charges scanned=${stats.scanned} unique=${byEmail.size}`);
      } else if (source === "setup_intents") {
        const batch = await stripe.setupIntents.list(params);
        stats.scanned += batch.data.length;
        for (const si of batch.data) {
          if (si.status !== "succeeded") continue;
          if (typeof si.customer !== "string") continue;
          const c = await resolveCustomer(si.customer);
          const r = toRow(c.name, c.email, c.phone, si.created);
          if (r) upsert(byEmail, r);
        }
        if (!batch.has_more) { done = true; break; }
        starting_after = batch.data[batch.data.length - 1].id;
        cursorOut = starting_after;
        console.log(`setup_intents scanned=${stats.scanned} unique=${byEmail.size}`);
      } else {
        return new Response(JSON.stringify({ error: "source must be 'charges' or 'setup_intents'" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  } catch (e) {
    console.error("sweep error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e), stats, next_cursor: cursorOut, partial: Array.from(byEmail.values()) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = Array.from(byEmail.values()).map(({ name, email, phone }) => ({ name, email, phone }));

  return new Response(
    JSON.stringify({ source, stats, unique_emails: rows.length, done, next_cursor: cursorOut, rows }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});