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

    // ─── Status callback de entrega (StatusCallback dos templates de dunning) ───
    // A Twilio aceita o POST e devolve `queued`; só depois manda o status final.
    // Sem isso, `dunning_attempts` gravava "enviado" pra mensagem que nunca chegou.
    const messageStatus = (body.MessageStatus || body.SmsStatus || "").toLowerCase();
    if (messageStatus && !messageBody && !buttonText && messageSid) {
      const supabaseCb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const failed = messageStatus === "failed" || messageStatus === "undelivered";
      if (failed) {
        const errorCode = body.ErrorCode || "unknown";
        console.warn(
          `⚠️ [recovery-webhook] entrega falhou sid=${messageSid} status=${messageStatus} code=${errorCode}`,
        );
        // whatsapp_sent=false + error_stage preenchido ⇒ o degrau não conta na
        // cota da escada (ver dunning-whatsapp.ts) e pode ser reofertado depois.
        await supabaseCb
          .from("dunning_attempts")
          .update({
            whatsapp_sent: false,
            error_stage: "twilio_delivery_failed",
            error_message: `${messageStatus} (ErrorCode ${errorCode})`,
          })
          .eq("message_sid", messageSid);

        // Fallback: entrega falhou ⇒ e-mail hoje + nova tentativa de WhatsApp amanhã 09h BRT.
        try {
          const { data: att } = await supabaseCb
            .from("dunning_attempts")
            .select("profile_user_id, provider, invoice_id, subscription_id, payment_id, customer_id, attempt_number")
            .eq("message_sid", messageSid)
            .maybeSingle();

          if (att?.profile_user_id) {
            // 1) Reagenda o MESMO degrau pra amanhã 09h BRT (12h UTC).
            const retryAt = new Date();
            retryAt.setUTCDate(retryAt.getUTCDate() + 1);
            retryAt.setUTCHours(12, 0, 0, 0);
            await supabaseCb.from("scheduled_tasks").insert({
              user_id: att.profile_user_id,
              task_type: "dunning_offer_whatsapp",
              execute_at: retryAt.toISOString(),
              status: "pending",
              payload: {
                event_id: `retry-${messageSid}`,
                provider: att.provider || "stripe",
                invoice_id: att.invoice_id,
                subscription_id: att.subscription_id,
                payment_id: att.payment_id,
                customer_id: att.customer_id,
                attempt_number: att.attempt_number || 1,
                retry_of_sid: messageSid,
              },
            });

            // 2) E-mail imediato como canal secundário.
            const { data: prof } = await supabaseCb
              .from("profiles")
              .select("email, name")
              .eq("user_id", att.profile_user_id)
              .maybeSingle();
            const { data: tokenRow } = await supabaseCb
              .from("user_portal_tokens")
              .select("token")
              .eq("user_id", att.profile_user_id)
              .maybeSingle();
            if (prof?.email && tokenRow?.token) {
              await supabaseCb.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "dunning-payment-failed",
                  recipientEmail: prof.email,
                  idempotencyKey: `dunning-wa-fallback-${messageSid}`,
                  templateData: {
                    name: prof.name || "Cliente",
                    paymentLink: `https://olaaura.com.br/pagamento?t=${tokenRow.token}`,
                  },
                },
              });
            }
          }
        } catch (fbErr) {
          console.error("❌ [recovery-webhook] fallback pós-falha de entrega:", fbErr);
        }
      } else if (messageStatus === "delivered" || messageStatus === "read") {
        await supabaseCb
          .from("dunning_attempts")
          .update({ whatsapp_sent: true, error_stage: null, error_message: null })
          .eq("message_sid", messageSid);
      }
      return new Response("", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

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

    // Dispara o agente de resposta (fire-and-forget). Não bloqueia o 200 OK para o Twilio.
    try {
      const invokePromise = supabase.functions.invoke("recovery-agent", {
        body: { phone: cleanPhone, inbound_text: finalBody || "" },
      }).then(
        (r) => console.log("[recovery-webhook] recovery-agent ->", JSON.stringify(r?.data || r?.error || {})),
        (e) => console.error("[recovery-webhook] recovery-agent invoke falhou:", e?.message || e),
      );
      // @ts-ignore - EdgeRuntime existe no runtime Deno deploy
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(invokePromise);
      }
    } catch (e) {
      console.error("[recovery-webhook] erro ao agendar recovery-agent:", e);
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
