// Edge function (cron): rede de segurança do welcome de WhatsApp.
//
// Por que existe: cliente paga → webhook libera acesso, grava [WELCOME] no
// pending_insight e dispara o template. Se esse disparo falha (Meta fora,
// template inativo, fallback Twilio recusado), o cliente fica com acesso e
// nenhuma mensagem — e ninguém descobre até ele reclamar no suporte.
//
// Esta varredura procura exatamente esse estado: perfil ativo, criado nos
// últimos dias, com [WELCOME] pendente, sem welcome_sent_at e sem nenhuma
// mensagem trocada. Reenvia o template e registra o resultado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendWelcomeWhatsApp } from "../_shared/welcome-delivery.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOOKBACK_DAYS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body.dry_run === true;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();

  const report: Array<Record<string, unknown>> = [];

  try {
    const { data: candidates, error } = await supabase
      .from("profiles")
      .select("id, user_id, name, phone, created_at, pending_insight, welcome_sent_at, status")
      .gte("created_at", since)
      .is("welcome_sent_at", null)
      .in("status", ["active", "trial"])
      .limit(100);

    if (error) throw error;

    for (const p of candidates || []) {
      const pending = String(p.pending_insight || "");
      if (!pending.startsWith("[WELCOME]")) continue;
      if (!p.phone) continue;

      // Já conversou? Então o welcome chegou (ou foi entregue no clique).
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", p.user_id);
      if ((count ?? 0) > 0) {
        await supabase.from("profiles")
          .update({ welcome_sent_at: new Date().toISOString() })
          .eq("user_id", p.user_id);
        report.push({ user: p.user_id, action: "marcado_como_entregue" });
        continue;
      }

      const phone = normalizeBrazilianPhone(p.phone);
      if (!phone) continue;

      if (dryRun) {
        report.push({ user: p.user_id, action: "reenviaria", phone: phone.slice(0, 6) + "***" });
        continue;
      }

      const sent = await sendWelcomeWhatsApp(supabase, {
        phone,
        name: String(p.name || "").split(" ")[0] || "tudo bem",
        userId: p.user_id,
        functionName: "welcome-safety-net",
      });
      report.push({ user: p.user_id, action: sent ? "reenviado" : "falhou" });
    }

    console.log(`[welcome-safety-net] ${report.length} caso(s): ${JSON.stringify(report)}`);
    return new Response(JSON.stringify({ ok: true, dryRun, cases: report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[welcome-safety-net] erro:", (e as Error)?.message);
    return new Response(JSON.stringify({ ok: false, error: (e as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
