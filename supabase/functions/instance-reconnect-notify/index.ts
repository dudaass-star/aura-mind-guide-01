import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, cleanPhoneNumber } from "../_shared/zapi-client.ts";
import {
  getInstanceConfigById,
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const body = await req.json().catch(() => ({}));
    const instanceId: string | undefined = body.instance_id;

    // Build query for active/trial users with phone
    let query = supabase
      .from("profiles")
      .select("user_id, name, phone, whatsapp_instance_id")
      .in("status", ["active", "trial"])
      .not("phone", "is", null);

    if (instanceId) {
      query = query.eq("whatsapp_instance_id", instanceId);
    } else {
      query = query.not("whatsapp_instance_id", "is", null);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "Nenhum usuário encontrado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📡 [Reconnect Notify] ${users.length} users to notify`);

    let totalSent = 0;
    let totalErrors = 0;

    for (const user of users) {
      try {
        const instId = user.whatsapp_instance_id || "default";
        await antiBurstDelayForInstance(instId);

        const zapiConfig = await getInstanceConfigById(supabase, instId);
        const nome = user.name?.split(" ")[0] || "Ei";
        const message = `Oi, ${nome}! Tive um probleminha técnico, mas já voltei. 💚 Se você me mandou algo e eu não respondi, pode mandar de novo que estou aqui!`;

        const cleanPhone = cleanPhoneNumber(user.phone);
        const result = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);

        if (result.success) {
          totalSent++;
          console.log(`✅ Sent to ${cleanPhone.substring(0, 4)}***`);
        } else {
          totalErrors++;
          console.error(`❌ Failed for ${cleanPhone.substring(0, 4)}***: ${result.error}`);
        }
      } catch (err) {
        totalErrors++;
        console.error(`❌ Error for user ${user.user_id}:`, err);
      }
    }

    console.log(`🏁 [Reconnect Notify] ${totalSent} sent, ${totalErrors} errors`);

    return new Response(
      JSON.stringify({ sent: totalSent, errors: totalErrors, total: users.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ [Reconnect Notify] Fatal:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
