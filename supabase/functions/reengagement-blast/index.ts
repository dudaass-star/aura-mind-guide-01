import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { cleanPhoneNumber, getPhoneVariations } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const { dry_run = true } = await req.json().catch(() => ({ dry_run: true }));

    // Quiet hours check (22h-8h BRT)
    const nowBRT = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    );
    const hour = nowBRT.getHours();
    if (hour >= 22 || hour < 8) {
      return new Response(
        JSON.stringify({ error: "Horário silencioso (22h-8h BRT)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🚀 [Reengagement] Starting (dry_run=${dry_run}) — Stripe-first approach`);

    // 1. List ALL active + trialing subscriptions from Stripe (source of truth)
    const allSubs: Stripe.Subscription[] = [];
    for (const status of ["active", "trialing"] as const) {
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore) {
        const params: any = { status, limit: 100, expand: ["data.customer"] };
        if (startingAfter) params.starting_after = startingAfter;
        const batch = await stripe.subscriptions.list(params);
        allSubs.push(...batch.data);
        hasMore = batch.has_more;
        if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
      }
    }

    console.log(`📋 [Reengagement] Found ${allSubs.length} active/trialing subscriptions in Stripe`);

    // 2. Deduplicate by customer ID
    const seenCustomers = new Set<string>();
    const uniqueSubs: { sub: Stripe.Subscription; customer: Stripe.Customer }[] = [];
    for (const sub of allSubs) {
      const customer = sub.customer as Stripe.Customer;
      if (!customer || typeof customer === "string") continue;
      if (seenCustomers.has(customer.id)) continue;
      seenCustomers.add(customer.id);
      uniqueSubs.push({ sub, customer });
    }

    console.log(`👥 [Reengagement] ${uniqueSubs.length} unique customers with valid subs`);

    const results: any[] = [];
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const { sub, customer } of uniqueSubs) {
      try {
        // 3. Extract phone from customer metadata or phone field
        const rawPhone = customer.metadata?.phone || customer.phone || null;
        const email = customer.email || null;

        if (!rawPhone && !email) {
          skipped++;
          results.push({
            stripe_customer: customer.id,
            name: customer.name,
            status: "skipped",
            reason: "No phone or email in Stripe customer",
          });
          continue;
        }

        // 4. Find profile in DB by phone variations, then email fallback
        let profile: any = null;

        if (rawPhone) {
          const cleanPhone = rawPhone.replace(/\D/g, "");
          const variations = getPhoneVariations(cleanPhone);
          for (const v of variations) {
            const { data } = await supabase
              .from("profiles")
              .select("user_id, name, phone, last_user_message_at, status")
              .eq("phone", v)
              .maybeSingle();
            if (data) {
              profile = data;
              break;
            }
          }
        }

        if (!profile && email) {
          const { data } = await supabase
            .from("profiles")
            .select("user_id, name, phone, last_user_message_at, status")
            .eq("email", email)
            .maybeSingle();
          if (data) profile = data;
        }

        if (!profile) {
          skipped++;
          results.push({
            stripe_customer: customer.id,
            name: customer.name,
            email,
            phone: rawPhone?.substring(0, 4) + "***",
            status: "skipped",
            reason: "No matching profile in DB",
          });
          continue;
        }

        // 5. Skip admin/test
        if (profile.phone === "test-admin") {
          skipped++;
          results.push({ name: profile.name, status: "skipped", reason: "Admin/test" });
          continue;
        }

        // 6. Check if already talking to new number
        if (profile.last_user_message_at) {
          skipped++;
          results.push({
            name: profile.name?.split(" ")[0],
            phone: profile.phone?.substring(0, 4) + "***",
            status: "skipped",
            reason: "Already messaged new number",
            last_msg: profile.last_user_message_at,
          });
          continue;
        }

        // 7. Eligible — send or report
        const nome = profile.name?.split(" ")[0] || "você";
        const message = `Oi, ${nome}! A Aura mudou de número 💜 Me manda um oi aqui pra gente continuar de onde paramos?`;

        if (dry_run) {
          sent++;
          results.push({
            name: nome,
            phone: profile.phone?.substring(0, 4) + "***",
            stripe_customer: customer.id,
            sub_status: sub.status,
            status: "would_send",
          });
        } else {
          const cleanPhone = cleanPhoneNumber(profile.phone!);
          await new Promise((r) => setTimeout(r, 500));

          const result = await sendProactive(
            cleanPhone,
            message,
            "reconnect",
            profile.user_id,
            undefined,
            undefined,
            [nome],
          );

          if (result.success) {
            await supabase.from("messages").insert({
              user_id: profile.user_id,
              role: "assistant",
              content: message,
            });
            sent++;
            results.push({
              name: nome,
              phone: cleanPhone.substring(0, 4) + "***",
              status: "sent",
              provider: result.provider,
            });
            console.log(`✅ Sent to ${cleanPhone.substring(0, 4)}***`);
          } else {
            errors++;
            results.push({
              name: nome,
              phone: cleanPhone.substring(0, 4) + "***",
              status: "error",
              error: result.error,
            });
            console.error(`❌ Failed: ${result.error}`);
          }
        }
      } catch (err: any) {
        errors++;
        results.push({
          stripe_customer: customer.id,
          status: "error",
          error: err.message,
        });
      }
    }

    const summary = {
      dry_run,
      total_stripe_subs: allSubs.length,
      unique_customers: uniqueSubs.length,
      sent,
      skipped,
      errors,
      details: results,
    };

    console.log(
      `🏁 [Reengagement] Done: ${sent} ${dry_run ? "would send" : "sent"}, ${skipped} skipped, ${errors} errors`
    );

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("❌ [Reengagement] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
