import { getRecoveryMessage, listRecoveryMessages, sendRecoveryTemplate } from "../_shared/twilio-recovery-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { phone, contentSid, name, messageSid, listOnly, vars } = await req.json();
    if (messageSid) {
      const status = await getRecoveryMessage(messageSid);
      return new Response(JSON.stringify(status), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: status.success ? 200 : 500,
      });
    }
    if (listOnly && phone) {
      const messages = await listRecoveryMessages(phone);
      return new Response(JSON.stringify(messages), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: messages.success ? 200 : 500,
      });
    }
    const sid = contentSid || "HX7ae71f9002839ec0ecdc58f6aa067a8a";
    const contentVars = vars && typeof vars === "object" ? vars : { "1": name || "Robson" };
    const result = await sendRecoveryTemplate(phone, sid, contentVars);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: result.success ? 200 : 500,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});