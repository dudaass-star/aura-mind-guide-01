import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
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

    console.log(`🚀 [Reengagement] Starting (dry_run=${dry_run})`);

    // 1. Fetch profiles: active/trial, has phone, never messaged new number
    const { data: users, error } = await supabase
      .from("profiles")
      .select("user_id, name, phone, email, status")
      .in("status", ["active", "trial"])
      .not("phone", "is", null)
      .is("last_user_message_at", null);

    if (error) throw error;
    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0, message: "Nenhum usuário elegível." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out admin/test
    const eligible = users.filter(u => u.phone !== "test-admin");
    console.log(`📋 [Reengagement] ${eligible.length} profiles to check against Stripe`);

    const results: any[] = [];
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of eligible) {
      try {
        // 2. Check Stripe subscription
        let hasValidSub = false;
        let stripeCustomerId: string | null = null;

        // Search by email first, then phone metadata
        if (user.email) {
          const customers = await stripe.customers.list({ email: user.email, limit: 1 });
          if (customers.data.length > 0) {
            stripeCustomerId = customers.data[0].id;
          }
        }

        if (!stripeCustomerId && user.phone) {
          const clean = cleanPhoneNumber(user.phone);
          const searchResult = await stripe.customers.search({
            query: `metadata["phone"]:"${clean}"`,
            limit: 1,
          });
          if (searchResult.data.length > 0) {
            stripeCustomerId = searchResult.data[0].id;
          }
        }

        if (stripeCustomerId) {
          const subs = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            limit: 5,
          });
          hasValidSub = subs.data.some(s => s.status === "active" || s.status === "trialing");
        }

        if (!hasValidSub) {
          skipped++;
          results.push({
            phone: user.phone?.substring(0, 4) + "***",
            name: user.name?.split(" ")[0],
            status: "skipped",
            reason: stripeCustomerId ? "No active/trialing subscription" : "No Stripe customer found",
          });
          continue;
        }

        // 3. Send or report
        const nome = user.name?.split(" ")[0] || "você";
        const message = `Oi, ${nome}! A Aura mudou de número 💜 Me manda um oi aqui pra gente continuar de onde paramos?`;

        if (dry_run) {
          results.push({
            phone: user.phone?.substring(0, 4) + "***",
            name: nome,
            status: "would_send",
            stripe_customer: stripeCustomerId,
          });
          sent++;
        } else {
          const cleanPhone = cleanPhoneNumber(user.phone!);

          // Anti-burst delay
          await new Promise(r => setTimeout(r, 500));

          const result = await sendProactive(
            cleanPhone,
            message,
            "reconnect",
            user.user_id,
            undefined,
            [nome],
          );

          if (result.success) {
            // Log message
            await supabase.from("messages").insert({
              user_id: user.user_id,
              role: "assistant",
              content: message,
            });

            sent++;
            results.push({
              phone: cleanPhone.substring(0, 4) + "***",
              name: nome,
              status: "sent",
              provider: result.provider,
            });
            console.log(`✅ Sent to ${cleanPhone.substring(0, 4)}***`);
          } else {
            errors++;
            results.push({
              phone: cleanPhone.substring(0, 4) + "***",
              name: nome,
              status: "error",
              error: result.error,
            });
            console.error(`❌ Failed: ${result.error}`);
          }
        }
      } catch (err: any) {
        errors++;
        results.push({
          phone: user.phone?.substring(0, 4) + "***",
          status: "error",
          error: err.message,
        });
      }
    }

    const summary = {
      dry_run,
      total_checked: eligible.length,
      sent,
      skipped,
      errors,
      details: results,
    };

    console.log(`🏁 [Reengagement] Done: ${sent} ${dry_run ? "would send" : "sent"}, ${skipped} skipped, ${errors} errors`);

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
