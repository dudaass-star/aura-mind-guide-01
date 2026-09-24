import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { brtDateKey, loadFirst14Direction, type First14Action } from "../_shared/first-14-days.ts";
import { routeNotification } from "../_shared/notification-router.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const DAY_MS = 86_400_000;
const COPY: Record<First14Action, { type: "first14_conversation" | "first14_journey" | "first14_session" | "first14_practice" | "first14_progress"; path: string }> = {
  conversation: { type: "first14_conversation", path: "/meu-espaco?tab=conversar&open=1" },
  journey: { type: "first14_journey", path: "/meu-espaco?tab=jornadas" },
  session: { type: "first14_session", path: "/meu-espaco?tab=sessoes" },
  practice: { type: "first14_practice", path: "/meu-espaco?tab=meditacoes" },
  progress: { type: "first14_progress", path: "/meu-espaco?tab=percurso" },
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !url || req.headers.get("authorization") !== `Bearer ${serviceKey}`) return json({ error: "Não autorizado" }, 401);
  const db = createClient(url, serviceKey);
  try {
    const { data: profiles, error } = await db.from("profiles")
      .select("user_id,name,created_at,converted_at,trial_started_at")
      .in("status", ["active", "trial", "trialing"])
      .limit(500);
    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const profile of profiles || []) {
      const [state, deliveries] = await Promise.all([
        loadFirst14Direction(db, profile.user_id),
        db.from("notification_deliveries").select("id,notification_type,status").eq("user_id", profile.user_id).like("notification_type", "first14_%"),
      ]);
      if (!state.reliable || deliveries.error) { skipped++; continue; }
      const direction = state.direction;
      const prior = deliveries.data || [];
      const sentPushes = prior.filter((item) => ["sent", "opened", "converted"].includes(item.status)).length;
      const activeAttempt = prior.some((item) => item.notification_type === (direction ? COPY[direction.action].type : "") && ["pending", "scheduled", "sent", "opened", "converted"].includes(item.status));
      if (!direction || sentPushes >= 3 || activeAttempt) {
        skipped++;
        continue;
      }
      const item = COPY[direction.action];
      const result = await routeNotification(db, {
        userId: profile.user_id,
        idempotencyKey: `first14:${direction.milestone}:${brtDateKey()}`,
        category: "engagement",
        type: item.type,
        firstName: profile.name?.split(" ")[0],
        path: item.path,
        whatsappText: "",
        whatsappCategory: "checkin",
        fallback: "none",
        expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
      });
      if (result.channel === "push") sent++;
      else skipped++;
    }
    return json({ success: true, processed: profiles?.length || 0, sent, skipped });
  } catch (error) {
    console.error("Falha na condução dos primeiros 14 dias", error);
    return json({ error: "Não foi possível avaliar a condução inicial" }, 500);
  }
});