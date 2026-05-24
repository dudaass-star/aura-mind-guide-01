/**
 * Webhook da SUBACCOUNT Twilio de recuperação de carrinho abandonado.
 *
 * - Recebe respostas dos leads ao template de recuperação.
 * - Grava em `recovery_messages` e atualiza `recovery_conversations`.
 * - NÃO encaminha para `process-webhook-message` (esses leads ainda não são usuários da Aura).
 * - Tenta linkar com um checkout_session pelo telefone para mostrar contexto no painel admin.
 *
 * Configurar este endpoint como "When a message comes in" no console da subaccount Twilio.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractPhone(twilioFrom: string): string {
  return twilioFrom.replace("whatsapp:", "").replace("+", "").trim();
}

function isValidPhone(phone: string): boolean {
  return /^\d{10,15}$/.test(phone);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, string> = {};

    const raw = await req.text();
    if (contentType.includes("application/json")) {
      try { body = JSON.parse(raw); } catch { body = {}; }
    } else {
      const params = new URLSearchParams(raw);
      for (const [k, v] of params.entries()) body[k] = v;
    }

    console.log("📩 [recovery-webhook] payload:", JSON.stringify(body));

    const from = body.From || "";
    const messageBody = body.Body || "";
    const messageSid = body.MessageSid || body.SmsSid || "";
    const numMedia = parseInt(body.NumMedia || "0", 10);
    const mediaUrl0 = numMedia > 0 ? (body.MediaUrl0 || "") : "";
    const profileName = body.ProfileName || null;
    const buttonText = body.ButtonText || "";

    if (!from) {
      return new Response("", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    const cleanPhone = extractPhone(from);
    if (!isValidPhone(cleanPhone)) {
      console.warn("⚠️ [recovery-webhook] telefone inválido:", cleanPhone.substring(0, 4) + "***");
      return new Response("", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    // Eventos sem conteúdo (status callbacks) — ignorar
    const finalBody = messageBody || buttonText;
    if (!finalBody && !mediaUrl0) {
      return new Response("", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Dedup por message_sid (UNIQUE constraint cuida)
    const { error: insertErr } = await supabase.from("recovery_messages").insert({
      phone: cleanPhone,
      direction: "in",
      body: finalBody || null,
      media_url: mediaUrl0 || null,
      message_sid: messageSid || null,
      sent_by_admin: false,
      metadata: { profile_name: profileName, button_text: buttonText || undefined },
    });

    if (insertErr && !String(insertErr.message || "").includes("duplicate")) {
      console.error("❌ [recovery-webhook] insert recovery_messages falhou:", insertErr);
    }

    // Tenta linkar com um checkout_session recente pelo telefone
    let checkoutSessionId: string | null = null;
    try {
      const phoneVars = getPhoneVariations(cleanPhone);
      const { data: ck } = await supabase
        .from("checkout_sessions")
        .select("id")
        .in("phone", phoneVars)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      checkoutSessionId = ck?.id ?? null;
    } catch (_) { /* ignore */ }

    const nowIso = new Date().toISOString();
    const preview = (finalBody || "[mídia]").substring(0, 200);

    // Upsert conversa
    const { error: convErr } = await supabase
      .from("recovery_conversations")
      .upsert({
        phone: cleanPhone,
        name: profileName,
        last_inbound_at: nowIso,
        last_message_preview: preview,
        checkout_session_id: checkoutSessionId,
        updated_at: nowIso,
      }, { onConflict: "phone" });

    if (convErr) {
      console.error("❌ [recovery-webhook] upsert recovery_conversations falhou:", convErr);
    } else {
      console.log(`✅ [recovery-webhook] inbound registrado phone=${cleanPhone.substring(0, 6)}***`);
    }

    return new Response("", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  } catch (err) {
    console.error("❌ [recovery-webhook] erro:", err);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
