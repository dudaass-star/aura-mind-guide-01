import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import {
  groupByInstance,
  antiBurstDelayForInstance,
} from "../_shared/instance-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Resgate one-shot dos usuários Direção/Transformação sem sessão futura.
// Dispara o template `cheking_7dias` (categoria 'checkin') como abridor de janela.
// Payload opcional:
//   { user_ids?: string[], limit?: number, dry_run?: boolean }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const userIdsFilter: string[] | undefined = Array.isArray(body.user_ids) ? body.user_ids : undefined;
    const limit: number | undefined = typeof body.limit === "number" ? body.limit : undefined;
    const dryRun: boolean = !!body.dry_run;

    // Janela 08h-22h BRT
    const nowBRT = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
    );
    const hour = nowBRT.getHours();
    if (hour >= 22 || hour < 8) {
      return new Response(
        JSON.stringify({ error: "Fora da janela 08h-22h BRT" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Busca elegíveis: planos pagos com setup pendente e sem sessão futura
    let query = supabase
      .from("profiles")
      .select("user_id, name, phone, plan, status, pending_first_session_invite, needs_schedule_setup")
      .in("plan", ["direcao", "transformacao"])
      .in("status", ["active", "trialing", "trial"])
      .not("phone", "is", null);

    if (userIdsFilter && userIdsFilter.length > 0) {
      query = query.in("user_id", userIdsFilter);
    }

    const { data: candidates, error } = await query;
    if (error) throw error;

    // Filtra os que NÃO têm sessão futura
    const nowIso = new Date().toISOString();
    const eligible: typeof candidates = [];
    for (const u of candidates ?? []) {
      const { count } = await supabase
        .from("sessions")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", u.user_id)
        .eq("status", "scheduled")
        .gt("scheduled_at", nowIso);
      if (!count || count === 0) eligible.push(u);
    }

    const targets = typeof limit === "number" ? eligible.slice(0, limit) : eligible;

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          eligible_total: eligible.length,
          to_send: targets.length,
          users: targets.map((u) => ({ user_id: u.user_id, name: u.name, phone: u.phone, plan: u.plan })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`🚑 rescue-sessions-blast: ${targets.length} alvos`);

    const groups = groupByInstance(targets as any);
    let sent = 0;
    let errors = 0;
    const details: Array<{ user_id: string; ok: boolean; error?: string }> = [];

    await Promise.all(
      Array.from(groups.entries()).map(async ([instanceKey, users]) => {
        for (const user of users) {
          try {
            await antiBurstDelayForInstance(instanceKey);
            const cleanPhone = cleanPhoneNumber(user.phone);
            const nome = user.name?.split(" ")[0] || "Ei";
            // Texto de fallback caso janela 24h esteja aberta (sai como free text)
            const fallback = `Oi, ${nome}! Tudo bem? Tava pensando em te chamar pra a gente alinhar sua próxima sessão. Bora marcar? 💜`;
            const result = await sendProactive(cleanPhone, fallback, "checkin", user.user_id);

            if (result.success) {
              await supabase
                .from("profiles")
                .update({ last_reactivation_sent: new Date().toISOString() })
                .eq("user_id", user.user_id);
              await supabase.from("messages").insert({
                user_id: user.user_id,
                role: "assistant",
                content: fallback,
              });
              sent++;
              details.push({ user_id: user.user_id, ok: true });
            } else {
              errors++;
              details.push({ user_id: user.user_id, ok: false, error: result.error });
              await supabase.from("failed_message_log").insert({
                user_id: user.user_id,
                error_message: `rescue-sessions-blast: ${result.error}`,
                context: "rescue-sessions-blast",
              }).catch(() => {});
            }
          } catch (err) {
            errors++;
            const msg = err instanceof Error ? err.message : String(err);
            details.push({ user_id: user.user_id, ok: false, error: msg });
            console.error(`❌ user ${user.user_id}:`, msg);
          }
        }
      }),
    );

    console.log(`🏁 rescue-sessions-blast: ${sent} enviados, ${errors} erros`);

    return new Response(
      JSON.stringify({ sent, errors, total: targets.length, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("❌ rescue-sessions-blast erro:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});