/**
 * Diagnóstico: consulta status final + alertas de uma mensagem da subaccount Twilio.
 * POST { "messageSid": "MMxxxx" }
 */
import { getRecoveryMessage, getRecoveryAlerts } from "../_shared/twilio-recovery-client.ts";

async function inspectTemplate(contentSid: string) {
  const sid = Deno.env.get("TWILIO_RECOVERY_ACCOUNT_SID")!;
  const token = Deno.env.get("TWILIO_RECOVERY_AUTH_TOKEN")!;
  const auth = btoa(`${sid}:${token}`);
  const [tpl, approval] = await Promise.all([
    fetch(`https://content.twilio.com/v1/Content/${contentSid}`, {
      headers: { Authorization: `Basic ${auth}` },
    }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) })),
    fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
      headers: { Authorization: `Basic ${auth}` },
    }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) })),
  ]);
  return { template: tpl, approval };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messageSid, contentSid } = await req.json();
    if (contentSid) {
      const tpl = await inspectTemplate(contentSid);
      return new Response(JSON.stringify(tpl, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!messageSid) {
      return new Response(JSON.stringify({ error: "messageSid or contentSid required" }), {
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