// Teste E2E do fluxo Asaas: insere payment PENDING, dispara webhook-asaas
// com PAYMENT_RECEIVED usando o ASAAS_WEBHOOK_TOKEN real, e devolve um
// relatório do que foi criado (profile, portal token, pending_insight, etc).
// Não publicar — função interna de validação.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const stamp = Date.now();
    const paymentId = `pay_e2e_${stamp}`;
    const customerId = `cus_e2e_${stamp}`;
    const subId = `sub_e2e_${stamp}`;
    const email = `e2e+${stamp}@olaaura.com.br`;
    const phone = `5511999${String(stamp).slice(-7)}`;
    const name = "Cliente E2E";

    // 1) Insere payment PENDING (estado inicial do criar-pix-asaas)
    const { error: insErr } = await supabase.from("asaas_payments").insert({
      asaas_payment_id: paymentId,
      asaas_customer_id: customerId,
      asaas_subscription_id: subId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      customer_cpf: "00000000000",
      plan: "essencial",
      billing_period: "monthly",
      amount_cents: 2990,
      status: "PENDING",
      payment_method: "PIX",
    });
    if (insErr) throw new Error(`insert payment: ${insErr.message}`);

    // 2) Dispara webhook-asaas com PAYMENT_RECEIVED
    const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-asaas`;
    const wbRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_TOKEN,
      },
      body: JSON.stringify({
        event: "PAYMENT_RECEIVED",
        payment: { id: paymentId, status: "RECEIVED", value: 29.9 },
      }),
    });
    const wbBody = await wbRes.json();

    // 3) Espera um pouco e coleta artefatos
    await new Promise((r) => setTimeout(r, 1500));

    const { data: payment } = await supabase
      .from("asaas_payments")
      .select("status, paid_at, user_id")
      .eq("asaas_payment_id", paymentId)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "user_id, name, phone, email, plan, status, plan_expires_at, current_journey_id, trial_phase, pending_insight, asaas_customer_id",
      )
      .eq("email", email)
      .maybeSingle();

    let portalToken: string | null = null;
    if (profile?.user_id) {
      const { data: tk } = await supabase
        .from("user_portal_tokens")
        .select("token")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      portalToken = tk?.token ?? null;
    }

    const report = {
      webhook: { status: wbRes.status, body: wbBody },
      payment_updated: payment,
      profile_created: profile
        ? {
            ...profile,
            pending_insight_starts_with_welcome: (profile.pending_insight || "").startsWith("[WELCOME]"),
            pending_insight_len: (profile.pending_insight || "").length,
          }
        : null,
      portal_token_created: !!portalToken,
      portal_link: portalToken ? `https://olaaura.com.br/meu-espaco?t=${portalToken}` : null,
      checks: {
        webhook_200: wbRes.status === 200,
        payment_marked_received: payment?.status === "RECEIVED",
        payment_has_user_id: !!payment?.user_id,
        profile_active: profile?.status === "active",
        profile_has_expiry: !!profile?.plan_expires_at,
        profile_has_journey: profile?.current_journey_id === "j1-ansiedade",
        pending_welcome_saved: (profile?.pending_insight || "").startsWith("[WELCOME]"),
        portal_token_ok: !!portalToken,
      },
      test_data: { paymentId, email, phone, subId },
      next_step:
        "Confira logs de webhook-asaas para resultado do template WhatsApp (sendProactive) e enfileiramento do email welcome.",
    };

    // 4) Cleanup opcional
    const cleanup = new URL(req.url).searchParams.get("cleanup") === "1";
    if (cleanup && profile?.user_id) {
      await supabase.from("user_portal_tokens").delete().eq("user_id", profile.user_id);
      await supabase.from("profiles").delete().eq("user_id", profile.user_id);
      await supabase.from("asaas_payments").delete().eq("asaas_payment_id", paymentId);
    }

    return new Response(JSON.stringify({ ok: true, cleanup, report }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});