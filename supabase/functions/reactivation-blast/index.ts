import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage, sendProactive } from "../_shared/whatsapp-provider.ts";
import {
  getInstanceConfigForUser,
  groupByInstance,
  antiBurstDelayForInstance,
} from "../_shared/instance-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Quiet hours check (22h-8h BRT = UTC-3)
    const nowBRT = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    );
    const hour = nowBRT.getHours();
    if (hour >= 22 || hour < 8) {
      return new Response(
        JSON.stringify({
          error: "Horário silencioso (22h-8h BRT). Tente novamente mais tarde.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch eligible trial users: had conversations, not yet subscribed
    const { data: users, error } = await supabase
      .from("profiles")
      .select("user_id, name, phone, whatsapp_instance_id, trial_conversations_count, trial_phase")
      .eq("status", "trial")
      .gte("trial_conversations_count", 3)
      .not("phone", "is", null);

    if (error) throw error;

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "Nenhum trial finalizado encontrado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🚀 Reactivation blast: ${users.length} eligible users`);

    // Group by instance for parallel per-instance, sequential within
    const groups = groupByInstance(users);
    let totalSent = 0;
    let totalErrors = 0;

    const instancePromises = Array.from(groups.entries()).map(
      async ([instanceKey, instanceUsers]) => {
        for (const user of instanceUsers) {
          try {
            const nome = user.name?.split(" ")[0] || "Ei";
            const message = `Oi, ${nome}! Tava pensando em você... podemos conversar mais um pouco? 💜`;

            // Anti-burst delay per instance
            await antiBurstDelayForInstance(instanceKey);

            // Get instance config
            const zapiConfig = await getInstanceConfigForUser(
              supabase,
              user.user_id
            );

            const cleanPhone = cleanPhoneNumber(user.phone);
            // Reativação consolidada na categoria 'checkin' (template cheking_7dias)
            const result = await sendProactive(cleanPhone, message, 'checkin', user.user_id);

            if (result.success) {
              await supabase
                .from("profiles")
                .update({
                  last_reactivation_sent: new Date().toISOString(),
                })
                .eq("user_id", user.user_id);

              // Save message to history
              await supabase.from("messages").insert({
                user_id: user.user_id,
                role: "assistant",
                content: message,
              });

              totalSent++;
              console.log(`✅ Sent to ${cleanPhone.substring(0, 4)}***`);
            } else {
              totalErrors++;
              console.error(
                `❌ Failed for ${cleanPhone.substring(0, 4)}***: ${result.error}`
              );
            }
          } catch (err) {
            totalErrors++;
            console.error(`❌ Error for user ${user.user_id}:`, err);
          }
        }
      }
    );

    await Promise.all(instancePromises);

    console.log(
      `🏁 Reactivation blast complete: ${totalSent} sent, ${totalErrors} errors`
    );

    return new Response(
      JSON.stringify({
        sent: totalSent,
        errors: totalErrors,
        total: users.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Reactivation blast error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
