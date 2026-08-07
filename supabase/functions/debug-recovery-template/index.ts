/**
 * Diagnóstico da subconta de recuperação (Twilio):
 * - lê templates no Content API (variáveis, tipos, aprovações Meta)
 * - lê mensagens específicas (error_code / error_message final)
 * - envia um template de teste com variáveis controladas (test_send)
 * Uso: POST { content_sids: ["HX..."], message_sids: ["MM..."],
 *             test_send: { to: "55...", content_sid: "HX...", variables: {"1":"...","2":"..."} } }
 */
import { sendRecoveryTemplate } from "../_shared/twilio-recovery-client.ts";

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
      const alerts = await get(`https://monitor.twilio.com/v1/Alerts?ResourceSid=${ms}&PageSize=5`);
      out.messages.push({
        sid: ms,
        status: m.json?.status,
        error_code: m.json?.error_code,
        error_message: m.json?.error_message,
        to: m.json?.to,
        from: m.json?.from,
        http: m.status,
        alerts: (alerts.json?.alerts || []).map((a: any) => ({
          error_code: a.error_code,
          alert_text: a.alert_text,
          more_info: a.more_info,
        })),
      });
    }
  }

  if (body.test_send?.to && body.test_send?.content_sid) {
    const t = body.test_send;
    const statusCallback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-twilio-recovery`;
    const res = await sendRecoveryTemplate(
      t.to,
      t.content_sid,
      t.variables || {},
      t.status_callback === false ? undefined : statusCallback,
    );
    out.test_send = res;
  }

  // Cria um template novo + submete aprovação no WhatsApp (usado para
  // substituir SIDs que devolvem 63027 — template inexistente pro sender).
  if (body.create_template) {
    const t = body.create_template;
    const create = await fetch("https://content.twilio.com/v1/Content", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        friendly_name: t.friendly_name,
        language: t.language || "pt_BR",
        variables: t.variables || { "1": "Eduardo", "2": "abc123" },
        types: t.types,
      }),
    });
    const created = await create.json().catch(() => ({}));
    out.create_template = { status: create.status, sid: created?.sid, body: created };

    if (created?.sid) {
      const appr = await fetch(
        `https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/whatsapp`,
        {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: t.approval_name || t.friendly_name,
            category: t.category || "UTILITY",
            allow_category_change: true,
          }),
        },
      );
      out.create_template.approval = { status: appr.status, body: await appr.json().catch(() => ({})) };
    }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
