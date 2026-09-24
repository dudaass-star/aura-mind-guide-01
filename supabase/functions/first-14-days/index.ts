import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { chooseFirst14Direction, type First14Action } from "../_shared/first-14-days.ts";
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
    const cutoff = new Date(Date.now() - 15 * DAY_MS).toISOString();
    const { data: profiles, error } = await db.from("profiles")
      .select("user_id,name,created_at,converted_at,trial_started_at,current_journey_id,last_user_message_at")
      .in("status", ["active", "trial", "trialing"])
      .gte("created_at", cutoff)
      .limit(500);
    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    for (const profile of profiles || []) {
      const startAt = profile.converted_at || profile.trial_started_at || profile.created_at;
      const ageDays = Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / DAY_MS));
      const nowIso = new Date().toISOString();
      const [sessions, episodes, practices, progress, deliveries] = await Promise.all([
        db.from("sessions").select("status,scheduled_at").eq("user_id", profile.user_id).in("status", ["completed", "scheduled", "in_progress"]),
        db.from("journey_episode_progress").select("status").eq("user_id", profile.user_id),
        db.from("user_meditation_history").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id),
        db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", profile.user_id).eq("feature", "progress").in("event_type", ["opened", "experienced"]),
        db.from("notification_deliveries").select("id,notification_type,status").eq("user_id", profile.user_id).like("notification_type", "first14_%"),
      ]);
      const direction = chooseFirst14Direction({
        ageDays,
        hasConversation: Boolean(profile.last_user_message_at),
        hasJourney: Boolean(profile.current_journey_id) || (episodes.data?.length || 0) > 0,
        hasCompletedSession: (sessions.data || []).some((item) => item.status === "completed"),
        hasPractice: (practices.count || 0) > 0,
        hasProgress: (progress.count || 0) > 0,
        hasPendingEpisode: (episodes.data || []).some((item) => item.status === "released" || item.status === "in_progress"),
        hasUpcomingSession: (sessions.data || []).some((item) => item.status === "in_progress" || (item.status === "scheduled" && item.scheduled_at && item.scheduled_at >= nowIso)),
      });
      const prior = deliveries.data || [];
      if (!direction || prior.length >= 3 || prior.some((item) => item.notification_type === COPY[direction.action].type)) {
        skipped++;
        continue;
      }
      const item = COPY[direction.action];
      const result = await routeNotification(db, {
        userId: profile.user_id,
        idempotencyKey: `first14:${direction.milestone}`,
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