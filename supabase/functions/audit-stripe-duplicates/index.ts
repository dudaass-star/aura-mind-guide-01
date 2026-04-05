import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CustomerInfo {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  subscriptions: { id: string; status: string; created: number }[];
  hasPayments: boolean;
}

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

    // 2. Enrich each customer with subscriptions and payment info
    const enriched: CustomerInfo[] = [];
    for (const c of allCustomers) {
      const subs = await stripe.subscriptions.list({ customer: c.id, limit: 100 });
      const rawPhone = c.metadata?.phone || c.phone || null;
      const phoneNorm = rawPhone ? rawPhone.replace(/\D/g, "") : null;

      // Check if customer has any successful payments
      const charges = await stripe.charges.list({ customer: c.id, limit: 1 });
      const hasPayments = charges.data.length > 0 && charges.data.some(ch => ch.status === "succeeded");

      enriched.push({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: rawPhone,
        phoneNormalized: phoneNorm,
        subscriptions: subs.data.map(s => ({ id: s.id, status: s.status, created: s.created })),
        hasPayments,
      });
    }

    // 3. Group by normalized phone
    const byPhone: Record<string, CustomerInfo[]> = {};
    const noPhone: CustomerInfo[] = [];
    for (const c of enriched) {
      if (c.phoneNormalized && c.phoneNormalized.length >= 10) {
        // Normalize to base form (remove 9th digit variations)
        const variations = getPhoneVariations(c.phoneNormalized);
        const key = variations[0]; // use first variation as canonical
        if (!byPhone[key]) byPhone[key] = [];
        // Avoid adding same customer twice
        if (!byPhone[key].find(x => x.id === c.id)) {
          byPhone[key].push(c);
        }
      } else {
        noPhone.push(c);
      }
    }

    // 4. Identify issues
    const duplicateGroups: any[] = [];
    const orphans: any[] = [];
    const multiSubCustomers: any[] = [];
    const actionsLog: any[] = [];

    // Check phone groups for duplicates
    for (const [phone, customers] of Object.entries(byPhone)) {
      if (customers.length > 1) {
        // Find the "keeper" - the one with active/trialing sub, or most recent sub
        const withActiveSub = customers.filter(c =>
          c.subscriptions.some(s => s.status === "active" || s.status === "trialing")
        );
        const keeper = withActiveSub.length > 0
          ? withActiveSub.sort((a, b) => {
              const aMax = Math.max(...a.subscriptions.map(s => s.created));
              const bMax = Math.max(...b.subscriptions.map(s => s.created));
              return bMax - aMax;
            })[0]
          : customers.sort((a, b) => {
              const aMax = a.subscriptions.length > 0 ? Math.max(...a.subscriptions.map(s => s.created)) : 0;
              const bMax = b.subscriptions.length > 0 ? Math.max(...b.subscriptions.map(s => s.created)) : 0;
              return bMax - aMax;
            })[0];

        const duplicates = customers.filter(c => c.id !== keeper.id);

        duplicateGroups.push({
          phone: phone.substring(0, 6) + "***",
          keeper: { id: keeper.id, name: keeper.name, subs: keeper.subscriptions.length },
          duplicates: duplicates.map(d => ({
            id: d.id,
            name: d.name,
            subs: d.subscriptions.map(s => `${s.id} (${s.status})`),
            hasPayments: d.hasPayments,
          })),
        });

        if (fix) {
          for (const dup of duplicates) {
            // Cancel any active/trialing subs on duplicates
            for (const sub of dup.subscriptions) {
              if (sub.status === "active" || sub.status === "trialing") {
                await stripe.subscriptions.cancel(sub.id);
                actionsLog.push({ action: "cancel_sub", sub_id: sub.id, customer: dup.id });
                console.log(`❌ Cancelled sub ${sub.id} on duplicate ${dup.id}`);
              }
            }
            // Delete customer if no payments
            if (!dup.hasPayments) {
              await stripe.customers.del(dup.id);
              actionsLog.push({ action: "delete_customer", customer: dup.id });
              console.log(`🗑️ Deleted orphan duplicate ${dup.id}`);
            }
          }
        }
      }

      // Check for multi-sub on single customer
      for (const c of customers) {
        const activeSubs = c.subscriptions.filter(s => s.status === "active" || s.status === "trialing");
        if (activeSubs.length > 1) {
          // Keep the most recent, cancel the rest
          const sorted = activeSubs.sort((a, b) => b.created - a.created);
          const keepSub = sorted[0];
          const extraSubs = sorted.slice(1);

          multiSubCustomers.push({
            customer: c.id,
            name: c.name,
            phone: (c.phoneNormalized || "").substring(0, 6) + "***",
            keep: `${keepSub.id} (${keepSub.status})`,
            cancel: extraSubs.map(s => `${s.id} (${s.status})`),
          });

          if (fix) {
            for (const extra of extraSubs) {
              await stripe.subscriptions.cancel(extra.id);
              actionsLog.push({ action: "cancel_extra_sub", sub_id: extra.id, customer: c.id });
              console.log(`❌ Cancelled extra sub ${extra.id} on ${c.id}`);
            }
          }
        }
      }
    }

    // Check no-phone customers
    for (const c of noPhone) {
      if (c.subscriptions.length === 0 && !c.hasPayments) {
        orphans.push({ id: c.id, name: c.name, email: c.email });
        if (fix) {
          await stripe.customers.del(c.id);
          actionsLog.push({ action: "delete_orphan", customer: c.id });
          console.log(`🗑️ Deleted no-phone orphan ${c.id}`);
        }
      }
    }

    // Also check phone customers with no subs and no payments
    for (const customers of Object.values(byPhone)) {
      for (const c of customers) {
        if (c.subscriptions.length === 0 && !c.hasPayments) {
          orphans.push({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: (c.phoneNormalized || "").substring(0, 6) + "***",
          });
          if (fix) {
            await stripe.customers.del(c.id);
            actionsLog.push({ action: "delete_orphan", customer: c.id });
            console.log(`🗑️ Deleted orphan ${c.id}`);
          }
        }
      }
    }

    const summary = {
      fix,
      total_customers: allCustomers.length,
      duplicate_phone_groups: duplicateGroups.length,
      multi_sub_customers: multiSubCustomers.length,
      orphan_customers: orphans.length,
      actions_taken: actionsLog.length,
      details: {
        duplicate_groups: duplicateGroups,
        multi_sub_customers: multiSubCustomers,
        orphans: orphans,
        actions: fix ? actionsLog : "dry_run - no actions taken",
      },
    };

    console.log(`🏁 [Audit] Done: ${duplicateGroups.length} dup groups, ${multiSubCustomers.length} multi-sub, ${orphans.length} orphans`);

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("❌ [Audit] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
