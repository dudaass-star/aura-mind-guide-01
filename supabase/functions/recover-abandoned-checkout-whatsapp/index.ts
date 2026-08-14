/**
 * Recuperação de carrinho abandonado via WhatsApp (Twilio subaccount dedicada).
 *
 * - Roda EM PARALELO ao fluxo de e-mail (recover-abandoned-checkout).
 * - 2 estágios: 15min e 24h após criação do checkout.
 * - Fontes: checkout_sessions (Stripe/cartão) + asaas_payments (PIX).
 * - Respeita silêncio 22h-08h BRT APENAS no estágio 24h (estágio 15min é continuação de interação ativa e ignora quiet hours).
 * - Pula clientes já ativos/trial (mesma lógica do fluxo de e-mail).
 * - Usa subaccount Twilio separada → NÃO interfere no número da Aura.
 * - Dedup cross-source por telefone normalizado dentro do mesmo estágio.
 *
 * Cron sugerido: a cada 5 minutos.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone, getPhoneVariations } from "../_shared/zapi-client.ts";
import { sendRecoveryTemplate } from "../_shared/twilio-recovery-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ContentSids dos templates aprovados na subaccount
// Estágio 1: recuperacao_checkout_5min (texto, {{1}} = nome) — substitui HX988544a4...
const TEMPLATE_15MIN = "HX6d9a0bda6dad14e72017547b0deb51ba";
// Estágio 2: recuperacao_checkout_24hs (texto, {{1}} = nome) — substitui HX8d40a27b...
const TEMPLATE_24H = "HX5f0f3dffb5f95da970bdbfab08a2488";

// Cutoff de ativação: só dispara WhatsApp para checkouts criados a partir desta data.
// Todo backlog anterior fica restrito ao fluxo de e-mail (recover-abandoned-checkout).
const WHATSAPP_RECOVERY_CUTOFF = "2026-05-24T00:00:00Z";

interface StageConfig {
  stage: 1 | 2;
  label: "15min" | "24h";
  contentSid: string;
  minAgeMinutes: number;
  sentColumn: string;
  prevSentColumn: string | null;
  utmCampaign: string;
  respectsQuietHours: boolean;
}

const STAGES: StageConfig[] = [
  {
    stage: 1,
    label: "15min",
    contentSid: TEMPLATE_15MIN,
    minAgeMinutes: 15,
    sentColumn: "whatsapp_recovery_15min_sent_at",
    prevSentColumn: null,
    utmCampaign: "wa_stage1_15min",
    // Continuação de interação ativa: usuário acabou de quase contratar, ainda quente.
    respectsQuietHours: false,
  },
  {
    stage: 2,
    label: "24h",
    contentSid: TEMPLATE_24H,
    minAgeMinutes: 24 * 60,
    sentColumn: "whatsapp_recovery_24h_sent_at",
    prevSentColumn: "whatsapp_recovery_15min_sent_at",
    utmCampaign: "wa_stage2_24h",
    // Cold outreach 24h depois: respeita silêncio noturno.
    respectsQuietHours: true,
  },
];

// === Quiet hours: 22h-08h BRT (UTC-3) ===
function isQuietHourBRT(now: Date = new Date()): boolean {
  // BRT = UTC-3
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  return brtHour >= 22 || brtHour < 8;
}

function firstName(name: string | null | undefined): string {
  if (!name) return "tudo bem";
  const trimmed = name.trim().split(/\s+/)[0];
  return trimmed || "tudo bem";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("📱 [WA-RECOVERY] Iniciando recuperação WhatsApp (subaccount)...");

    // Kill switch (system_config.twilio_recovery_enabled). Default true.
    const { data: killCfg } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "twilio_recovery_enabled")
      .maybeSingle();
    if (killCfg && killCfg.value === false) {
      console.warn("🛑 [WA-RECOVERY] Disabled via system_config.twilio_recovery_enabled=false. Skipping.");
      return new Response(
        JSON.stringify({ status: "disabled_by_config" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pré-busca clientes ativos / trial (skip)
    const { data: activeProfiles } = await supabase
      .from("profiles")
      .select("phone, email")
      .in("status", ["active", "trial"]);

    const activePhoneSet = new Set<string>();
    const activeEmailSet = new Set<string>();
    if (activeProfiles) {
      for (const p of activeProfiles) {
        if (p.phone) {
          for (const v of getPhoneVariations(p.phone)) activePhoneSet.add(v);
        }
        if (p.email) activeEmailSet.add(p.email.toLowerCase());
      }
    }

    // Pré-busca checkouts já pagos (defesa contra race: profile ainda não virou active
    // mas o usuário já pagou em outra sessão). Janela larga para cobrir backlog.
    const { data: completedCheckouts } = await supabase
      .from("checkout_sessions")
      .select("phone, email")
      .eq("status", "completed")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const completedPhoneSet = new Set<string>();
    const completedEmailSet = new Set<string>();
    if (completedCheckouts) {
      for (const c of completedCheckouts) {
        if (c.phone) {
          for (const v of getPhoneVariations(c.phone)) completedPhoneSet.add(v);
        }
        if (c.email) completedEmailSet.add(c.email.toLowerCase());
      }
    }

    // Pré-busca PIX já pagos (RECEIVED/CONFIRMED): mesmo telefone/email não recebe lembrete.
    const { data: paidPix } = await supabase
      .from("asaas_payments")
      .select("customer_phone, customer_email")
      .in("status", ["RECEIVED", "CONFIRMED"])
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (paidPix) {
      for (const p of paidPix) {
        if (p.customer_phone) {
          for (const v of getPhoneVariations(p.customer_phone)) completedPhoneSet.add(v);
        }
        if (p.customer_email) completedEmailSet.add(p.customer_email.toLowerCase());
      }
    }

    // === LIFETIME CAP: telefones que já receberam >=2 envios ou já falharam alguma vez ===
    // Twilio cobra mesmo quando Meta rejeita; tratamos qualquer falha como banimento vitalício.
    const lifetimeBannedPhones = new Set<string>();

    const { data: outboundLog } = await supabase
      .from("recovery_messages")
      .select("phone")
      .eq("direction", "out")
      .eq("sent_by_admin", false);
    if (outboundLog) {
      const counts = new Map<string, number>();
      for (const m of outboundLog) {
        if (!m.phone) continue;
        const norm = normalizeBrazilianPhone(m.phone);
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
      for (const [norm, c] of counts) {
        if (c >= 2) {
          for (const v of getPhoneVariations(norm)) lifetimeBannedPhones.add(v);
        }
      }
    }

    const { data: failedAttempts } = await supabase
      .from("checkout_recovery_attempts")
      .select("phone_normalized")
      .like("status", "wa_%failed")
      .not("phone_normalized", "is", null);
    if (failedAttempts) {
      for (const a of failedAttempts) {
        if (a.phone_normalized) {
          for (const v of getPhoneVariations(a.phone_normalized)) lifetimeBannedPhones.add(v);
        }
      }
    }

    console.log(`🚫 [WA-RECOVERY] Lifetime cap: ${lifetimeBannedPhones.size} variações de telefone banidas.`);

    const totals = {
      sent: 0,
      failed: 0,
      skipped: 0,
      by_stage: {} as Record<string, number>,
    };

    for (const cfg of STAGES) {
      // Set compartilhado de telefones contatados neste ciclo (dedup cross-source).
      const contactedThisStage = new Set<string>();

      const r1 = await processStage(
        supabase,
        cfg,
        activeEmailSet,
        activePhoneSet,
        completedEmailSet,
        completedPhoneSet,
        contactedThisStage,
        lifetimeBannedPhones,
      );
      const r2 = await processStageAsaas(
        supabase,
        cfg,
        activeEmailSet,
        activePhoneSet,
        completedEmailSet,
        completedPhoneSet,
        contactedThisStage,
        lifetimeBannedPhones,
      );
      totals.sent += r1.sent + r2.sent;
      totals.failed += r1.failed + r2.failed;
      totals.skipped += r1.skipped + r2.skipped;
      totals.by_stage[`stripe_${cfg.label}`] = r1.sent;
      totals.by_stage[`pix_${cfg.label}`] = r2.sent;
    }

    console.log(
      `✅ [WA-RECOVERY] Finalizado — sent=${totals.sent} failed=${totals.failed} skipped=${totals.skipped}`,
      totals.by_stage,
    );

    return new Response(JSON.stringify({ status: "completed", ...totals }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ [WA-RECOVERY] Erro fatal:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function processStage(
  supabase: any,
  cfg: StageConfig,
  activeEmailSet: Set<string>,
  activePhoneSet: Set<string>,
  completedEmailSet: Set<string>,
  completedPhoneSet: Set<string>,
  contactedThisStage: Set<string>,
  lifetimeBannedPhones: Set<string>,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = Date.now();
  const createdBefore = new Date(now - cfg.minAgeMinutes * 60 * 1000).toISOString();

  if (cfg.respectsQuietHours && isQuietHourBRT()) {
    console.log(`🌙 [WA stage ${cfg.label}] quiet hours 22h-08h BRT, pulando este estágio.`);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let query = supabase
    .from("checkout_sessions")
    .select("id, phone, name, plan, email")
    .eq("status", "created")
    .not("phone", "is", null)
    .gte("created_at", WHATSAPP_RECOVERY_CUTOFF)
    .lt("created_at", createdBefore)
    .is(cfg.sentColumn, null)
    .limit(50);

  if (cfg.prevSentColumn) {
    query = query.not(cfg.prevSentColumn, "is", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error(`❌ [WA stage ${cfg.label}] Query error:`, error);
    return { sent: 0, failed: 0, skipped: 0 };
  }
  if (!rows || rows.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  console.log(`📋 [WA stage ${cfg.label}] ${rows.length} candidatos.`);

  // Dedup por phone
  const byKey = new Map<string, typeof rows[number]>();
  for (const s of rows) {
    const key = s.phone || s.email || `__${s.id}`;
    if (!byKey.has(key)) byKey.set(key, s);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const session of byKey.values()) {
    try {
      if (!session.phone) {
        await markSkipped(supabase, session.id, cfg, "no_phone");
        skipped++;
        continue;
      }

      // Skip clientes já ativos
      if (session.email && activeEmailSet.has(session.email.toLowerCase())) {
        await markSkipped(supabase, session.id, cfg, "active_customer_email");
        skipped++;
        continue;
      }
      const phoneVars = getPhoneVariations(session.phone);
      if (phoneVars.some(v => activePhoneSet.has(v))) {
        await markSkipped(supabase, session.id, cfg, "active_customer_phone");
        skipped++;
        continue;
      }

      // LIFETIME CAP: telefone já recebeu >=2 envios OU já falhou alguma vez.
      if (phoneVars.some(v => lifetimeBannedPhones.has(v))) {
        await markSkipped(supabase, session.id, cfg, "phone_lifetime_cap");
        skipped++;
        continue;
      }

      // Skip se já existe checkout pago para esse email/telefone (mesmo sem profile ativo)
      if (session.email && completedEmailSet.has(session.email.toLowerCase())) {
        await markSkipped(supabase, session.id, cfg, "already_paid_email");
        skipped++;
        continue;
      }
      if (phoneVars.some(v => completedPhoneSet.has(v))) {
        await markSkipped(supabase, session.id, cfg, "already_paid_phone");
        skipped++;
        continue;
      }

      // Dedup cross-source: telefone já contatado neste estágio (ex: PIX da mesma pessoa).
      if (phoneVars.some(v => contactedThisStage.has(v))) {
        await markSkipped(supabase, session.id, cfg, "already_contacted_this_stage");
        skipped++;
        continue;
      }

      const name = firstName(session.name);
      // Templates aprovados têm apenas {{1}} = nome.
      // Botão CTA tem URL fixa (https://olaaura.com.br/v2/checkout) no próprio template.
      const result = await sendRecoveryTemplate(session.phone, cfg.contentSid, {
        "1": name,
      });

      await supabase.from("checkout_recovery_attempts").insert({
        checkout_session_id: session.id,
        phone_raw: session.phone,
        phone_normalized: normalizeBrazilianPhone(session.phone),
        status: result.success ? `wa_stage_${cfg.stage}_sent` : `wa_stage_${cfg.stage}_failed`,
        error_message: result.success ? null : (result.error || "unknown"),
        provider_response: result.response ?? null,
      });

      if (result.success) {
        await supabase.from("checkout_sessions").update({
          [cfg.sentColumn]: new Date().toISOString(),
          whatsapp_recovery_last_error: null,
        }).eq("id", session.id);
        sent++;
        for (const v of phoneVars) contactedThisStage.add(v);
        console.log(`✅ [WA stage ${cfg.label}] enviado → ${session.phone.substring(0, 6)}*** sid=${result.messageSid}`);

        // Loga outbound no inbox admin (template aprovado)
        try {
          const cleanPhone = normalizeBrazilianPhone(session.phone);
          const previewBody = `[Template ${cfg.label}] Olá ${name}, finalize sua assinatura.`;
          const nowIso = new Date().toISOString();
          await supabase.from("recovery_messages").insert({
            phone: cleanPhone,
            direction: "out",
            body: previewBody,
            message_sid: result.messageSid || null,
            sent_by_admin: false,
            metadata: {
              template: cfg.label,
              content_sid: cfg.contentSid,
              checkout_session_id: session.id,
            },
          });
          await supabase.from("recovery_conversations").upsert({
            phone: cleanPhone,
            name: session.name || null,
            last_outbound_at: nowIso,
            last_message_preview: previewBody.substring(0, 200),
            checkout_session_id: session.id,
            updated_at: nowIso,
          }, { onConflict: "phone" });
        } catch (logErr) {
          console.warn(`⚠️ [WA stage ${cfg.label}] log inbox falhou:`, logErr);
        }
      } else {
        await supabase.from("checkout_sessions").update({
          whatsapp_recovery_last_error: result.error || "unknown",
        }).eq("id", session.id);
        failed++;
        console.error(`❌ [WA stage ${cfg.label}] falhou:`, result.error);
      }
    } catch (err) {
      console.error(`❌ [WA stage ${cfg.label}] exceção:`, err);
      failed++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return { sent, failed, skipped };
}

async function markSkipped(supabase: any, id: string, cfg: StageConfig, reason: string) {
  // Marca o estágio como "enviado" para não reavaliar nesta sequência
  await supabase.from("checkout_sessions").update({
    [cfg.sentColumn]: new Date().toISOString(),
    whatsapp_recovery_last_error: `skipped: ${reason}`,
  }).eq("id", id);

  try {
    await supabase.from("checkout_recovery_attempts").insert({
      checkout_session_id: id,
      status: `wa_stage_${cfg.stage}_skipped`,
      error_message: reason,
    });
  } catch (_) {
    // ignore
  }
}

// ============================================================
// Recuperação de PIX abandonado (asaas_payments)
// Mesma cadência e mesmos templates. Dedup cross-source via contactedThisStage.
// ============================================================
async function processStageAsaas(
  supabase: any,
  cfg: StageConfig,
  activeEmailSet: Set<string>,
  activePhoneSet: Set<string>,
  completedEmailSet: Set<string>,
  completedPhoneSet: Set<string>,
  contactedThisStage: Set<string>,
  lifetimeBannedPhones: Set<string>,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = Date.now();
  const createdBefore = new Date(now - cfg.minAgeMinutes * 60 * 1000).toISOString();

  if (cfg.respectsQuietHours && isQuietHourBRT()) {
    console.log(`🌙 [WA-PIX stage ${cfg.label}] quiet hours 22h-08h BRT, pulando este estágio.`);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let query = supabase
    .from("asaas_payments")
    .select("id, customer_phone, customer_name, customer_email, plan, billing_period, payment_method")
    .eq("status", "PENDING")
    .not("customer_phone", "is", null)
    .gte("created_at", WHATSAPP_RECOVERY_CUTOFF)
    .lt("created_at", createdBefore)
    .is(cfg.sentColumn, null)
    .limit(50);

  if (cfg.prevSentColumn) {
    query = query.not(cfg.prevSentColumn, "is", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error(`❌ [WA-PIX stage ${cfg.label}] Query error:`, error);
    return { sent: 0, failed: 0, skipped: 0 };
  }
  if (!rows || rows.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  console.log(`📋 [WA-PIX stage ${cfg.label}] ${rows.length} candidatos.`);

  // Dedup por telefone (mesmo cliente costuma ter PIX one-time + PIX_SUBSCRIPTION).
  const byKey = new Map<string, typeof rows[number]>();
  for (const p of rows) {
    const key = p.customer_phone || p.customer_email || `__${p.id}`;
    if (!byKey.has(key)) byKey.set(key, p);
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const payment of byKey.values()) {
    try {
      if (!payment.customer_phone) {
        await markSkippedAsaas(supabase, payment.id, cfg, "no_phone");
        skipped++;
        continue;
      }

      if (payment.customer_email && activeEmailSet.has(payment.customer_email.toLowerCase())) {
        await markSkippedAsaas(supabase, payment.id, cfg, "active_customer_email");
        skipped++;
        continue;
      }
      const phoneVars = getPhoneVariations(payment.customer_phone);
      if (phoneVars.some(v => activePhoneSet.has(v))) {
        await markSkippedAsaas(supabase, payment.id, cfg, "active_customer_phone");
        skipped++;
        continue;
      }

      // LIFETIME CAP: telefone já recebeu >=2 envios OU já falhou alguma vez.
      if (phoneVars.some(v => lifetimeBannedPhones.has(v))) {
        await markSkippedAsaas(supabase, payment.id, cfg, "phone_lifetime_cap");
        skipped++;
        continue;
      }

      if (payment.customer_email && completedEmailSet.has(payment.customer_email.toLowerCase())) {
        await markSkippedAsaas(supabase, payment.id, cfg, "already_paid_email");
        skipped++;
        continue;
      }
      if (phoneVars.some(v => completedPhoneSet.has(v))) {
        await markSkippedAsaas(supabase, payment.id, cfg, "already_paid_phone");
        skipped++;
        continue;
      }

      // Dedup cross-source: telefone já contatado por checkout_sessions OU outra cobrança PIX.
      if (phoneVars.some(v => contactedThisStage.has(v))) {
        await markSkippedAsaas(supabase, payment.id, cfg, "already_contacted_this_stage");
        skipped++;
        continue;
      }

      const name = firstName(payment.customer_name);
      const result = await sendRecoveryTemplate(payment.customer_phone, cfg.contentSid, {
        "1": name,
      });

      await supabase.from("checkout_recovery_attempts").insert({
        // sem checkout_session_id (origem PIX); referência via provider_response.
        checkout_session_id: null,
        phone_raw: payment.customer_phone,
        phone_normalized: normalizeBrazilianPhone(payment.customer_phone),
        status: result.success
          ? `wa_pix_stage_${cfg.stage}_sent`
          : `wa_pix_stage_${cfg.stage}_failed`,
        error_message: result.success ? null : (result.error || "unknown"),
        provider_response: {
          source: "asaas_payments",
          asaas_payment_id: payment.id,
          plan: payment.plan,
          billing_period: payment.billing_period,
          payment_method: payment.payment_method,
          twilio: result.response ?? null,
        },
      });

      if (result.success) {
        await supabase.from("asaas_payments").update({
          [cfg.sentColumn]: new Date().toISOString(),
          whatsapp_recovery_last_error: null,
        }).eq("id", payment.id);
        sent++;
        for (const v of phoneVars) contactedThisStage.add(v);
        console.log(`✅ [WA-PIX stage ${cfg.label}] enviado → ${payment.customer_phone.substring(0, 6)}*** sid=${result.messageSid}`);

        // Loga outbound no inbox admin.
        try {
          const cleanPhone = normalizeBrazilianPhone(payment.customer_phone);
          const previewBody = `[Template ${cfg.label} • PIX] Olá ${name}, finalize sua assinatura.`;
          const nowIso = new Date().toISOString();
          await supabase.from("recovery_messages").insert({
            phone: cleanPhone,
            direction: "out",
            body: previewBody,
            message_sid: result.messageSid || null,
            sent_by_admin: false,
            metadata: {
              template: cfg.label,
              content_sid: cfg.contentSid,
              source: "asaas_payments",
              asaas_payment_id: payment.id,
              plan: payment.plan,
              billing_period: payment.billing_period,
            },
          });
          await supabase.from("recovery_conversations").upsert({
            phone: cleanPhone,
            name: payment.customer_name || null,
            last_outbound_at: nowIso,
            last_message_preview: previewBody.substring(0, 200),
            // checkout_session_id fica null (origem PIX) — UI deve cair no fallback de metadata.
            updated_at: nowIso,
          }, { onConflict: "phone" });
        } catch (logErr) {
          console.warn(`⚠️ [WA-PIX stage ${cfg.label}] log inbox falhou:`, logErr);
        }
      } else {
        await supabase.from("asaas_payments").update({
          whatsapp_recovery_last_error: result.error || "unknown",
        }).eq("id", payment.id);
        failed++;
        console.error(`❌ [WA-PIX stage ${cfg.label}] falhou:`, result.error);
      }
    } catch (err) {
      console.error(`❌ [WA-PIX stage ${cfg.label}] exceção:`, err);
      failed++;
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return { sent, failed, skipped };
}

async function markSkippedAsaas(supabase: any, id: string, cfg: StageConfig, reason: string) {
  await supabase.from("asaas_payments").update({
    [cfg.sentColumn]: new Date().toISOString(),
    whatsapp_recovery_last_error: `skipped: ${reason}`,
  }).eq("id", id);
}
