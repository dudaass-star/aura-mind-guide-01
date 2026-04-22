/**
 * audit-orphan-subscribers
 *
 * Audits active Stripe subscriptions that have no matching profile in the DB.
 * Read-only operation — makes no changes to Stripe or Supabase.
 *
 * Steps:
 *  1. Fetch ALL non-cancelled Stripe subscriptions (paginated)
 *  2. Fetch ALL profiles from Supabase
 *  3. Normalize + match by email and phone
 *  4. For orphans: check checkout_sessions and stripe_webhook_events
 *  5. Return detailed JSON report
 */

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Phone normalization ──────────────────────────────────────────────────────
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Already has country code (12-13 digits starting with 55 for Brazil)
  if (digits.length === 12 || digits.length === 13) return digits;

  // 10-11 digits: Brazilian number without country code → add 55
  if (digits.length === 10 || digits.length === 11) return "55" + digits;

  // Other lengths: return as-is (international numbers, etc.)
  return digits;
}

/** Generate all phone variations for matching (same logic as profile-resolver) */
function phoneVariations(raw: string | null | undefined): string[] {
  const norm = normalizePhone(raw);
  if (!norm) return [];

  const vars = new Set<string>([norm]);

  // For Brazilian 13-digit (55 + DDD + 9 + 8 digits): add version without leading 9
  if (norm.length === 13 && norm.startsWith("55")) {
    const ddd = norm.slice(2, 4);
    const rest = norm.slice(4);
    if (rest.startsWith("9") && rest.length === 9) {
      vars.add("55" + ddd + rest.slice(1)); // 12 digits
    }
  }

  // For Brazilian 12-digit (55 + DDD + 8 digits): add version with leading 9
  if (norm.length === 12 && norm.startsWith("55")) {
    const ddd = norm.slice(2, 4);
    const rest = norm.slice(4);
    if (rest.length === 8) {
      vars.add("55" + ddd + "9" + rest); // 13 digits
    }
  }

  return Array.from(vars);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Missing required env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── STEP 1: Fetch ALL non-cancelled Stripe subscriptions ────────────────────
    const ACTIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"] as const;
    console.log("STEP 1: Fetching Stripe subscriptions...");

    const allSubs: any[] = [];
    for (const status of ACTIVE_STATUSES) {
      let hasMore = true;
      let startingAfter: string | undefined;
      let pageCount = 0;

      while (hasMore) {
        const params: any = {
          status,
          limit: 100,
          expand: ["data.customer"],
        };
        if (startingAfter) params.starting_after = startingAfter;

        const page = await stripe.subscriptions.list(params);
        allSubs.push(...page.data);
        hasMore = page.has_more;
        pageCount++;
        if (page.data.length > 0) {
          startingAfter = page.data[page.data.length - 1].id;
        }
      }
      console.log(`  Status '${status}': fetched ${pageCount} pages`);
    }

    // Deduplicate by sub ID (in case a sub somehow appears in multiple status queries)
    const uniqueSubs = Array.from(
      new Map(allSubs.map((s) => [s.id, s])).values()
    );

    console.log(`STEP 1 complete: ${uniqueSubs.length} unique non-cancelled subscriptions`);

    // Extract subscription records
    const stripeRecords = uniqueSubs.map((sub) => {
      const cust = typeof sub.customer === "string" ? null : sub.customer;
      return {
        sub_id: sub.id,
        status: sub.status,
        customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
        email: cust?.email ?? null,
        phone_customer: normalizePhone(cust?.phone),
        phone_metadata: normalizePhone(cust?.metadata?.phone),
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      };
    });

    // ── STEP 2: Fetch ALL profiles ──────────────────────────────────────────────
    console.log("STEP 2: Fetching profiles from Supabase...");

    const { data: rawProfiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, email, phone, created_at, status, plan");

    if (profileError) {
      throw new Error(`Failed to fetch profiles: ${profileError.message}`);
    }

    const profiles = (rawProfiles || []) as Array<{
      user_id: string;
      email: string | null;
      phone: string | null;
      created_at: string;
      status: string | null;
      plan: string | null;
    }>;

    console.log(`STEP 2 complete: ${profiles.length} profiles loaded`);

    // ── STEP 3: Build lookup indexes ───────────────────────────────────────────
    // Email index: normalized email → profile
    const profileByEmail = new Map<string, typeof profiles[0]>();
    for (const p of profiles) {
      if (p.email) {
        profileByEmail.set(p.email.trim().toLowerCase(), p);
      }
    }

    // Phone index: all variations → profile
    const profileByPhone = new Map<string, typeof profiles[0]>();
    for (const p of profiles) {
      if (p.phone) {
        for (const v of phoneVariations(p.phone)) {
          profileByPhone.set(v, p);
        }
      }
    }

    // ── STEP 4: Match each Stripe sub against profiles ─────────────────────────
    console.log("STEP 4: Matching subscriptions against profiles...");

    let matchByEmail = 0;
    let matchByPhone = 0;
    let matchByBoth = 0;
    let matchByEither = 0;
    const orphans: any[] = [];
    const matched: any[] = [];

    for (const rec of stripeRecords) {
      const normEmail = rec.email ? rec.email.trim().toLowerCase() : null;

      // Try email match
      const emailMatch = normEmail ? profileByEmail.get(normEmail) : null;

      // Try phone match (try phone_customer and phone_metadata with all variations)
      let phoneMatch: typeof profiles[0] | undefined;
      const phonesToTry = [rec.phone_customer, rec.phone_metadata].filter(Boolean);

      outer: for (const ph of phonesToTry) {
        for (const v of phoneVariations(ph!)) {
          const candidate = profileByPhone.get(v);
          if (candidate) {
            phoneMatch = candidate;
            break outer;
          }
        }
      }

      const hasEmailMatch = !!emailMatch;
      const hasPhoneMatch = !!phoneMatch;

      if (hasEmailMatch) matchByEmail++;
      if (hasPhoneMatch) matchByPhone++;
      if (hasEmailMatch && hasPhoneMatch) matchByBoth++;
      if (hasEmailMatch || hasPhoneMatch) {
        matchByEither++;
        matched.push({ ...rec, matched_by: hasEmailMatch && hasPhoneMatch ? "both" : hasEmailMatch ? "email" : "phone" });
      } else {
        orphans.push({ ...rec });
      }
    }

    console.log(`STEP 4 complete: ${matchByEither} matched, ${orphans.length} orphans`);

    // ── STEP 5: Validate orphans against DB ────────────────────────────────────
    console.log("STEP 5: Checking orphans in checkout_sessions and stripe_webhook_events...");

    const enrichedOrphans: any[] = [];

    for (const orphan of orphans) {
      // Check checkout_sessions by email or phone
      let hasCheckoutSession = false;
      let checkoutDetails: any[] = [];

      // By email
      if (orphan.email) {
        const { data: csByEmail } = await supabase
          .from("checkout_sessions")
          .select("id, phone, email, plan, status, created_at, completed_at")
          .eq("email", orphan.email)
          .limit(5);

        if (csByEmail && csByEmail.length > 0) {
          hasCheckoutSession = true;
          checkoutDetails.push(...csByEmail);
        }
      }

      // By phone (customer phone variations)
      const phonesToCheck = [orphan.phone_customer, orphan.phone_metadata].filter(Boolean);
      for (const ph of phonesToCheck) {
        if (ph) {
          const vars = phoneVariations(ph);
          for (const v of vars) {
            const { data: csByPhone } = await supabase
              .from("checkout_sessions")
              .select("id, phone, email, plan, status, created_at, completed_at")
              .eq("phone", v)
              .limit(5);

            if (csByPhone && csByPhone.length > 0) {
              hasCheckoutSession = true;
              checkoutDetails.push(...csByPhone.filter((c: any) => !checkoutDetails.find((x: any) => x.id === c.id)));
            }
          }
        }
      }

      // Check stripe_webhook_events
      // Note: stripe_webhook_events only has: id, event_type, processed_at, amount
      // There is no customer_id or metadata column. We can only check if the event
      // ID matches a known Stripe event format. We'll note this limitation.
      // We check if any webhook event IDs match the subscription's customer events.
      // Since the table doesn't store customer_id, we can only note the absence.
      const webhookNote = "Table stripe_webhook_events has no customer_id column — cannot query by customer";

      // Diagnose
      let diagnosis = "";
      if (!hasCheckoutSession) {
        diagnosis = "Nenhum checkout_session encontrado — possível signup direto no Stripe, importação manual, ou webhook de criação nunca processado";
      } else {
        const completedCheckouts = checkoutDetails.filter((c: any) => c.status === "completed");
        if (completedCheckouts.length > 0) {
          diagnosis = `Checkout completado encontrado mas profile não foi criado — webhook customer.subscription.created pode ter falhado ou sido perdido`;
        } else {
          diagnosis = `Checkout encontrado mas não completado (status: ${checkoutDetails[0]?.status}) — pagamento pode ter ocorrido fora do fluxo normal`;
        }
      }

      enrichedOrphans.push({
        ...orphan,
        has_checkout_session: hasCheckoutSession,
        checkout_sessions: checkoutDetails.slice(0, 3),
        webhook_note: webhookNote,
        diagnosis,
      });
    }

    // ── STEP 6: Build report ───────────────────────────────────────────────────
    console.log("STEP 6: Building report...");

    // Count by status for summary
    const statusBreakdown: Record<string, number> = {};
    for (const s of stripeRecords) {
      statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
    }
    const orphanStatusBreakdown: Record<string, number> = {};
    for (const o of enrichedOrphans) {
      orphanStatusBreakdown[o.status] = (orphanStatusBreakdown[o.status] || 0) + 1;
    }

    // Divergence analysis
    const divergenceNotes: string[] = [
      `stripe_webhook_events table has no customer_id/metadata columns — orphan webhook check is limited to confirming table structure only.`,
      `Phone matching uses Brazilian phone variation logic (10-11 digit → add '55', handle 9th digit insertion/removal for mobile numbers).`,
      `Profiles with NULL email AND NULL phone cannot be matched even if they correspond to a Stripe customer — these would appear as false orphans.`,
      `Duplicate Stripe customers (same phone, different customer IDs) will count as 1 matched profile + N-1 apparent orphans.`,
      `Subscriptions in 'incomplete' status represent failed payment attempts where no profile may have been created yet (expected behavior).`,
    ];

    const report = {
      generated_at: new Date().toISOString(),
      summary: {
        total_stripe_non_cancelled_subscriptions: stripeRecords.length,
        by_status: statusBreakdown,
        profiles_in_db: profiles.length,
        match_by_email_only: matchByEmail - matchByBoth,
        match_by_phone_only: matchByPhone - matchByBoth,
        match_by_both: matchByBoth,
        match_by_at_least_one: matchByEither,
        orphans_confirmed: enrichedOrphans.length,
        orphans_with_checkout_session: enrichedOrphans.filter((o) => o.has_checkout_session).length,
        orphans_without_checkout_session: enrichedOrphans.filter((o) => !o.has_checkout_session).length,
        orphan_status_breakdown: orphanStatusBreakdown,
      },
      orphans: enrichedOrphans.map((o) => ({
        email: o.email,
        phone_stripe_customer: o.phone_customer,
        phone_stripe_metadata: o.phone_metadata,
        status: o.status,
        current_period_end: o.current_period_end,
        customer_id: o.customer_id,
        has_checkout_session: o.has_checkout_session,
        checkout_sessions: o.checkout_sessions,
        webhook_note: o.webhook_note,
        diagnosis: o.diagnosis,
      })),
      divergence_notes: divergenceNotes,
      methodology: {
        phone_normalization: "Digits only; 10-11 digits → prepend '55'; generates variations with/without 9th digit for Brazilian mobiles",
        email_normalization: "trim() + toLowerCase()",
        match_strategies: ["email (normalized)", "phone_customer (normalized + variations)", "phone_metadata (normalized + variations)"],
        orphan_definition: "Subscription where NEITHER email match NOR any phone variation match found in profiles table",
      },
    };

    console.log(`Done. ${enrichedOrphans.length} orphans found out of ${stripeRecords.length} active subscriptions.`);

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error:", err.message, err.stack);
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deployed: 2026-04-22T15:46:03Z
