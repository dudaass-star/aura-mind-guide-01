import Stripe from "https://esm.sh/stripe@18.5.0";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { fix = false } = await req.json().catch(() => ({ fix: false }));
    console.log(`🔍 [Audit] Starting (fix=${fix})`);

    // 1. List ALL customers (paginated)
    const allCustomers: Stripe.Customer[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const params: any = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const batch = await stripe.customers.list(params);
      allCustomers.push(...batch.data);
      hasMore = batch.has_more;
      if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
    }
    console.log(`📋 Total customers: ${allCustomers.length}`);

    // 2. Get all subscriptions at once (much faster than per-customer)
    const allSubs: Stripe.Subscription[] = [];
    for (const status of ["active", "trialing", "past_due", "canceled", "incomplete"] as const) {
      let subHasMore = true;
      let subAfter: string | undefined;
      while (subHasMore) {
        const params: any = { status, limit: 100 };
        if (subAfter) params.starting_after = subAfter;
        const batch = await stripe.subscriptions.list(params);
        allSubs.push(...batch.data);
        subHasMore = batch.has_more;
        if (batch.data.length > 0) subAfter = batch.data[batch.data.length - 1].id;
      }
    }
    console.log(`📋 Total subscriptions: ${allSubs.length}`);

    // Map subs by customer ID
    const subsByCustomer: Record<string, { id: string; status: string; created: number }[]> = {};
    for (const s of allSubs) {
      const custId = typeof s.customer === "string" ? s.customer : s.customer.id;
      if (!subsByCustomer[custId]) subsByCustomer[custId] = [];
      subsByCustomer[custId].push({ id: s.id, status: s.status, created: s.created });
    }

    // 3. Enrich customers
    type CustInfo = {
      id: string; name: string | null; email: string | null;
      phoneNorm: string | null; subs: typeof subsByCustomer[string];
    };
    const enriched: CustInfo[] = allCustomers.map(c => {
      const rawPhone = c.metadata?.phone || c.phone || null;
      return {
        id: c.id, name: c.name, email: c.email,
        phoneNorm: rawPhone ? rawPhone.replace(/\D/g, "") : null,
        subs: subsByCustomer[c.id] || [],
      };
    });

    // 4. Group by canonical phone
    const byPhone: Record<string, CustInfo[]> = {};
    const noPhone: CustInfo[] = [];
    for (const c of enriched) {
      if (c.phoneNorm && c.phoneNorm.length >= 10) {
        const key = getPhoneVariations(c.phoneNorm)[0];
        if (!byPhone[key]) byPhone[key] = [];
        if (!byPhone[key].find(x => x.id === c.id)) byPhone[key].push(c);
      } else {
        noPhone.push(c);
      }
    }

    // 5. Analyze
    const duplicateGroups: any[] = [];
    const orphans: any[] = [];
    const multiSubCustomers: any[] = [];
    const actionsLog: any[] = [];

    for (const [phone, customers] of Object.entries(byPhone)) {
      // Duplicate phone groups
      if (customers.length > 1) {
        const withActive = customers.filter(c => c.subs.some(s => s.status === "active" || s.status === "trialing"));
        const keeper = (withActive.length > 0 ? withActive : customers)
          .sort((a, b) => {
            const aMax = a.subs.length > 0 ? Math.max(...a.subs.map(s => s.created)) : 0;
            const bMax = b.subs.length > 0 ? Math.max(...b.subs.map(s => s.created)) : 0;
            return bMax - aMax;
          })[0];
        const dups = customers.filter(c => c.id !== keeper.id);

        duplicateGroups.push({
          phone: phone.substring(0, 6) + "***",
          keeper: { id: keeper.id, name: keeper.name, subs: keeper.subs.length },
          duplicates: dups.map(d => ({
            id: d.id, name: d.name,
            subs: d.subs.map(s => `${s.id} (${s.status})`),
          })),
        });

        if (fix) {
          for (const dup of dups) {
            for (const sub of dup.subs) {
              if (sub.status === "active" || sub.status === "trialing") {
                await stripe.subscriptions.cancel(sub.id);
                actionsLog.push({ action: "cancel_dup_sub", sub_id: sub.id, customer: dup.id });
              }
            }
            if (dup.subs.length === 0 || dup.subs.every(s => s.status === "canceled" || s.status === "incomplete")) {
              await stripe.customers.del(dup.id);
              actionsLog.push({ action: "delete_dup_customer", customer: dup.id });
            }
          }
        }
      }

      // Multi-sub on same customer
      for (const c of customers) {
        const active = c.subs.filter(s => s.status === "active" || s.status === "trialing");
        if (active.length > 1) {
          const sorted = active.sort((a, b) => b.created - a.created);
          multiSubCustomers.push({
            customer: c.id, name: c.name,
            keep: `${sorted[0].id} (${sorted[0].status})`,
            cancel: sorted.slice(1).map(s => `${s.id} (${s.status})`),
          });
          if (fix) {
            for (const extra of sorted.slice(1)) {
              await stripe.subscriptions.cancel(extra.id);
              actionsLog.push({ action: "cancel_extra_sub", sub_id: extra.id, customer: c.id });
            }
          }
        }
      }

      // Orphans (no subs at all)
      for (const c of customers) {
        if (c.subs.length === 0) {
          orphans.push({ id: c.id, name: c.name, email: c.email, phone: phone.substring(0, 6) + "***" });
          if (fix) {
            await stripe.customers.del(c.id);
            actionsLog.push({ action: "delete_orphan", customer: c.id });
          }
        }
      }
    }

    // No-phone orphans
    for (const c of noPhone) {
      if (c.subs.length === 0) {
        orphans.push({ id: c.id, name: c.name, email: c.email, phone: null });
        if (fix) {
          await stripe.customers.del(c.id);
          actionsLog.push({ action: "delete_orphan", customer: c.id });
        }
      }
    }

    const summary = {
      fix,
      total_customers: allCustomers.length,
      total_subscriptions: allSubs.length,
      duplicate_phone_groups: duplicateGroups.length,
      multi_sub_customers: multiSubCustomers.length,
      orphan_customers: orphans.length,
      actions_taken: actionsLog.length,
      details: { duplicate_groups: duplicateGroups, multi_sub_customers: multiSubCustomers, orphans, actions: fix ? actionsLog : "dry_run" },
    };

    console.log(`🏁 Done: ${duplicateGroups.length} dup groups, ${multiSubCustomers.length} multi-sub, ${orphans.length} orphans`);
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
