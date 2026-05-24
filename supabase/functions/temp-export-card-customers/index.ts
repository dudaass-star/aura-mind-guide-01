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
  // Prefer record with more info; tie-break by most recent
  const score = (x: Row) => (x.name ? 1 : 0) + (x.phone ? 1 : 0);
  if (score(r) > score(prev) || (score(r) === score(prev) && r.created > prev.created)) {
    map.set(r.email, { ...prev, ...r, name: r.name || prev.name, phone: r.phone || prev.phone });
  } else if (!prev.name && r.name) {
    prev.name = r.name;
  } else if (!prev.phone && r.phone) {
    prev.phone = r.phone;
  }
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
  const source = (url.searchParams.get("source") || "all").toLowerCase();
  // hard time budget per request pra não estourar timeout da edge function
  const maxMs = Number(url.searchParams.get("max_ms") || 120000);
  const deadline = Date.now() + maxMs;

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
        phone: (cc.metadata?.phone as string) || cc.phone || "",
      };
      customerCache.set(id, data);
      return data;
    } catch {
      const empty = { email: "", name: "", phone: "" };
      customerCache.set(id, empty);
      return empty;
    }
  }

  const stats: Record<string, number> = { charges: 0, setup_intents: 0, payment_intents: 0 };

  // ---------- CHARGES ----------
  async function sweepCharges() {
    let starting_after: string | undefined;
    while (true) {
      if (Date.now() > deadline) { console.log("deadline hit during charges"); return; }
      const params: any = { limit: 100 };
      if (starting_after) params.starting_after = starting_after;
      const batch = await stripe.charges.list(params);
      stats.charges += batch.data.length;
      for (const ch of batch.data) {
        const isCard = ch.payment_method_details?.type === "card";
        if (!isCard) continue;
        const bd = ch.billing_details || ({} as any);
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
      if (!batch.has_more) break;
      starting_after = batch.data[batch.data.length - 1].id;
      console.log(`charges scanned=${stats.charges} unique=${byEmail.size}`);
    }
  }

  // ---------- SETUP INTENTS (cartão salvo sem cobrança, ex: trial) ----------
  async function sweepSetupIntents() {
    let starting_after: string | undefined;
    while (true) {
      if (Date.now() > deadline) { console.log("deadline hit during setup_intents"); return; }
      const params: any = { limit: 100 };
      if (starting_after) params.starting_after = starting_after;
      const batch = await stripe.setupIntents.list(params);
      stats.setup_intents += batch.data.length;
      for (const si of batch.data) {
        if (si.status !== "succeeded") continue;
        // SetupIntent não tem billing_details direto; depende do customer
        if (typeof si.customer !== "string") continue;
        const c = await resolveCustomer(si.customer);
        const r = toRow(c.name, c.email, c.phone, si.created);
        if (r) upsert(byEmail, r);
      }
      if (!batch.has_more) break;
      starting_after = batch.data[batch.data.length - 1].id;
      console.log(`setup_intents scanned=${stats.setup_intents} unique=${byEmail.size}`);
    }
  }

  try {
    if (source === "charges" || source === "all") await sweepCharges();
    if (source === "setup_intents" || source === "all") await sweepSetupIntents();
  } catch (e) {
    console.error("sweep error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e), stats, partial: Array.from(byEmail.values()) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = Array.from(byEmail.values())
    .map(({ name, email, phone }) => ({ name, email, phone }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return new Response(
    JSON.stringify({ stats, unique_emails: rows.length, rows }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});