/**
 * Diagnóstico: consulta status final + alertas de uma mensagem da subaccount Twilio.
 * POST { "messageSid": "MMxxxx" }
 */
import { getRecoveryMessage, getRecoveryAlerts } from "../_shared/twilio-recovery-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messageSid } = await req.json();
    if (!messageSid) {
      return new Response(JSON.stringify({ error: "messageSid required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [msg, alerts] = await Promise.all([
      getRecoveryMessage(messageSid),
      getRecoveryAlerts(messageSid),
    ]);
    return new Response(JSON.stringify({ message: msg, alerts }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});