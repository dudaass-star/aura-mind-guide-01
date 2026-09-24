import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { chooseTodayDirection, type TodayAction } from "../_shared/today-direction.ts";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization") || "";
  if (!url || !anonKey || !serviceKey || !authorization.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
  try {
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: claimsData, error: claimsError } = await auth.auth.getClaims(authorization.slice(7));
    const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
    if (claimsError || !userId) return json({ error: "auth_required" }, 401);
    const db = createClient(url, serviceKey);
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [profile, sessions, episodes, conversation, practices, progress, events, devices] = await Promise.all([
      db.from("profiles").select("created_at,converted_at,trial_started_at").eq("user_id", userId).maybeSingle(),
      db.from("sessions").select("id,scheduled_at,status,preparation_note,ended_at,focus_topic,theme_label,closure_text,session_summary").eq("user_id", userId).in("status", ["scheduled", "in_progress", "completed"]).order("scheduled_at", { ascending: false }).limit(80),
      db.from("journey_episode_progress").select("episode_id,status,opened_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(80),
      db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user").eq("channel", "in_app"),
      db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "practice").eq("event_type", "audio_started"),
      db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "progress").eq("event_type", "opened"),
      db.from("portal_value_events").select("event_type,metadata,created_at").eq("user_id", userId).eq("feature", "today").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
      db.from("push_devices").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("enabled", true),
    ]);
    const reads = [profile, sessions, episodes, conversation, practices, progress, events, devices];
    if (reads.some((result) => result.error) || !profile.data) return json({ reliable: false, error: "direction_unavailable" }, 503);

    const sessionRows = sessions.data || [];
    const now = Date.now();
    const nextSession = sessionRows
      .filter((item) => item.status === "in_progress" || (item.status === "scheduled" && new Date(item.scheduled_at).getTime() >= now - 60 * 60_000))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] || null;
    const lastSession = sessionRows
      .filter((item) => item.status === "completed")
      .sort((a, b) => new Date(b.ended_at || b.scheduled_at).getTime() - new Date(a.ended_at || a.scheduled_at).getTime())[0] || null;
    const pendingProgress = (episodes.data || []).find((item) => item.status === "in_progress")
      || (episodes.data || []).find((item) => item.status === "released")
      || null;
    let pendingEpisode = null;
    if (pendingProgress?.episode_id) {
      const episode = await db.from("journey_episodes").select("id,title,stage_title,episode_number").eq("id", pendingProgress.episode_id).maybeSingle();
      if (episode.error) return json({ reliable: false, error: "direction_unavailable" }, 503);
      pendingEpisode = episode.data;
    }

    const ignoredActions: TodayAction[] = [];
    for (const action of ["journey", "session", "practice", "progress"] as TodayAction[]) {
      const relevant = (events.data || []).filter((item) => (item.metadata as { action?: string } | null)?.action === action);
      const presented = relevant.filter((item) => item.event_type === "priority_presented").length;
      const opened = relevant.some((item) => ["priority_opened", "priority_initiated", "priority_completed"].includes(item.event_type));
      if (presented >= 3 && !opened) ignoredActions.push(action);
    }

    const result = chooseTodayDirection({
      nowMs: now,
      accountStartAt: profile.data.converted_at || profile.data.trial_started_at || profile.data.created_at,
      hasConversation: (conversation.count || 0) > 0,
      hasJourneyExperience: (episodes.data || []).some((item) => Boolean(item.opened_at)),
      hasSessionExperience: sessionRows.length > 0,
      hasPracticeExperience: (practices.count || 0) > 0,
      hasProgressExperience: (progress.count || 0) > 0,
      nextSession,
      pendingEpisode,
      lastSession,
      ignoredActions,
    });
    return json({ ...result, pushEnabled: (devices.count || 0) > 0, reliable: true, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Falha ao calcular a direção do Hoje", error);
    return json({ reliable: false, error: "direction_unavailable" }, 500);
  }
});