/**
 * Envia resposta admin manual via subaccount Twilio de recuperação.
 *
 * - Requer admin role.
 * - Texto livre (não template). Só funciona dentro da janela de 24h após último inbound.
 * - Grava a mensagem em `recovery_messages` (direction=out, sent_by_admin=true).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Checa admin
    const { data: isAdminData, error: adminErr } = await supabase.rpc("has_role", {
      _user_id: userId, _role: "admin",
    });
    if (adminErr || !isAdminData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Body
    const { phone, text } = await req.json();
    if (!phone || typeof phone !== "string" || !text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "phone e text obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 1500) {
      return new Response(JSON.stringify({ error: "Mensagem muito longa (máx 1500 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/\D/g, "");

    // Valida janela 24h (último inbound)
    const { data: conv } = await supabase
      .from("recovery_conversations")
      .select("last_inbound_at")
      .eq("phone", cleanPhone)
      .maybeSingle();

    const lastInbound = conv?.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    const ageMs = Date.now() - lastInbound;
    if (!lastInbound || ageMs > 24 * 60 * 60 * 1000) {
      return new Response(JSON.stringify({
        error: "Janela de 24h fechada. Só é possível enviar texto livre se o lead respondeu nas últimas 24h.",
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Envia via Twilio subaccount
    const sid = Deno.env.get("TWILIO_RECOVERY_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_RECOVERY_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_RECOVERY_FROM");
    if (!sid || !authToken || !from) {
      return new Response(JSON.stringify({ error: "Credenciais Twilio recuperação ausentes" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fromFormatted = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
    const toFormatted = `whatsapp:+${normalizeBrazilianPhone(cleanPhone)}`;
    const basic = btoa(`${sid}:${authToken}`);
    const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: text }),
    });
    const twJson = await tw.json().catch(() => ({}));
    if (!tw.ok) {
      const msg = twJson?.message || `HTTP ${tw.status}`;
      console.error("❌ [admin-reply] Twilio falhou:", msg);
      return new Response(JSON.stringify({ error: msg, response: twJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageSid = twJson?.sid as string | undefined;
    const nowIso = new Date().toISOString();

    await supabase.from("recovery_messages").insert({
      phone: cleanPhone,
      direction: "out",
      body: text,
      message_sid: messageSid || null,
      sent_by_admin: true,
      metadata: { admin_user_id: userId },
    });

    await supabase.from("recovery_conversations").upsert({
      phone: cleanPhone,
      last_outbound_at: nowIso,
      last_message_preview: text.substring(0, 200),
      last_admin_read_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: "phone" });

    return new Response(JSON.stringify({ ok: true, messageSid }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ [admin-reply] erro:", err);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
