/**
 * Diagnóstico da subconta de recuperação (Twilio):
 * - lê templates no Content API (variáveis, tipos, aprovações Meta)
 * - lê mensagens específicas (error_code / error_message final)
 * Uso: POST { content_sids: ["HX..."], message_sids: ["MM..."] }
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sid = Deno.env.get("TWILIO_RECOVERY_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_RECOVERY_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_RECOVERY_FROM");
  if (!sid || !token) {
    return new Response(JSON.stringify({ error: "missing TWILIO_RECOVERY_* secrets" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const auth = btoa(`${sid}:${token}`);
  const body = await req.json().catch(() => ({} as any));
  const out: any = { account_sid_tail: sid.slice(-4), from };

  async function get(url: string) {
    const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    const t = await r.text();
    try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, raw: t.slice(0, 500) }; }
  }

  if (Array.isArray(body.content_sids)) {
    out.contents = [];
    for (const cs of body.content_sids) {
      const content = await get(`https://content.twilio.com/v1/Content/${cs}`);
      const approval = await get(`https://content.twilio.com/v1/Content/${cs}/ApprovalRequests`);
      out.contents.push({ sid: cs, content, approval });
    }
  }

  if (Array.isArray(body.message_sids)) {
    out.messages = [];
    for (const ms of body.message_sids) {
      const m = await get(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${ms}.json`);
      out.messages.push({
        sid: ms,
        status: m.json?.status,
        error_code: m.json?.error_code,
        error_message: m.json?.error_message,
        to: m.json?.to,
        from: m.json?.from,
        http: m.status,
      });
    }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
