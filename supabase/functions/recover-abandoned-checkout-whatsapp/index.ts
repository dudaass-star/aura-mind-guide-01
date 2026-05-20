/**
 * Recuperação de carrinho abandonado via WhatsApp (Twilio subaccount dedicada).
 *
 * - Roda EM PARALELO ao fluxo de e-mail (recover-abandoned-checkout).
 * - 2 estágios: 15min e 24h após criação do checkout_session.
 * - Respeita silêncio 22h-08h BRT.
 * - Pula clientes já ativos/trial (mesma lógica do fluxo de e-mail).
 * - Usa subaccount Twilio separada → NÃO interfere no número da Aura.
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
const TEMPLATE_15MIN = "HX7ae71f9002839ec0ecdc58f6aa067a8a";
const TEMPLATE_24H = "HXb34b27fda2f45a0c10fc19960bac61c1";

interface StageConfig {
  stage: 1 | 2;
  label: "15min" | "24h";
  contentSid: string;
  minAgeMinutes: number;
  sentColumn: string;
  prevSentColumn: string | null;
  utmCampaign: string;
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
  },
  {
    stage: 2,
    label: "24h",
    contentSid: TEMPLATE_24H,
    minAgeMinutes: 24 * 60,
    sentColumn: "whatsapp_recovery_24h_sent_at",
    prevSentColumn: "whatsapp_recovery_15min_sent_at",
    utmCampaign: "wa_stage2_24h",
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

    if (isQuietHourBRT()) {
      console.log("🌙 [WA-RECOVERY] Quiet hours (22h-08h BRT). Aguardando próximo ciclo.");
      return new Response(
        JSON.stringify({ status: "skipped_quiet_hours" }),
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

    const totals = {
      sent: 0,
      failed: 0,
      skipped: 0,
      by_stage: {} as Record<string, number>,
    };

    for (const cfg of STAGES) {
      const result = await processStage(supabase, cfg, activeEmailSet, activePhoneSet);
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      totals.by_stage[cfg.label] = result.sent;
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
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = Date.now();
  const createdBefore = new Date(now - cfg.minAgeMinutes * 60 * 1000).toISOString();

  let query = supabase
    .from("checkout_sessions")
    .select("id, phone, name, plan, email")
    .eq("status", "created")
    .not("phone", "is", null)
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

      const plan = session.plan || "essencial";
      const name = firstName(session.name);
      const checkoutLink = `https://olaaura.com.br/checkout?plan=${plan}&utm_source=whatsapp&utm_medium=recovery&utm_campaign=${cfg.utmCampaign}`;

      // ContentVariables: {{1}} nome, {{2}} plano, {{3}} link (botão CTA dinâmico)
      const result = await sendRecoveryTemplate(session.phone, cfg.contentSid, {
        "1": name,
        "2": plan,
        "3": checkoutLink,
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
        console.log(`✅ [WA stage ${cfg.label}] enviado → ${session.phone.substring(0, 6)}*** sid=${result.messageSid}`);
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

  await supabase.from("checkout_recovery_attempts").insert({
    checkout_session_id: id,
    status: `wa_stage_${cfg.stage}_skipped`,
    error_message: reason,
  }).catch(() => {});
}
