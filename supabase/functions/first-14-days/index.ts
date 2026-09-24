import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.25.76";
import { brtDateKey, loadFirst14BatchDirections, nextFirst14Cursor, type First14Action, type First14Profile } from "../_shared/first-14-days.ts";
import { routeNotification } from "../_shared/notification-router.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const DAY_MS = 86_400_000;
const BATCH_SIZE = 20;
const BodySchema = z.object({
  cursor: z.string().uuid().optional(),
  runKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();
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
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados inválidos" }, 400);
    const startedAt = performance.now();
    const runKey = parsed.data.runKey || brtDateKey();
    let profileQuery = db.from("profiles")
      .select("user_id,name,created_at,converted_at,trial_started_at")
      .in("status", ["active", "trial", "trialing"])
      .or(`created_at.gte.${new Date(Date.now() - 15 * DAY_MS).toISOString()},converted_at.gte.${new Date(Date.now() - 15 * DAY_MS).toISOString()},trial_started_at.gte.${new Date(Date.now() - 15 * DAY_MS).toISOString()}`)
      .order("user_id", { ascending: true })
      .limit(BATCH_SIZE);
    if (parsed.data.cursor) profileQuery = profileQuery.gt("user_id", parsed.data.cursor);
    const { data: profiles, error } = await profileQuery;
    if (error) throw error;

    const typedProfiles = (profiles || []) as Array<First14Profile & { name?: string | null }>;
    const userIds = typedProfiles.map((profile) => profile.user_id);
    const [states, deliveries, devices] = await Promise.all([
      loadFirst14BatchDirections(db, typedProfiles),
      userIds.length
        ? db.from("notification_deliveries").select("user_id,notification_type,status").in("user_id", userIds).like("notification_type", "first14_%")
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? db.from("push_devices").select("user_id").in("user_id", userIds).eq("enabled", true)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (deliveries.error || devices.error) throw deliveries.error || devices.error;
    const usersWithPush = new Set((devices.data || []).map((device: { user_id: string }) => device.user_id));
    const deliveriesByUser = new Map<string, Array<{ notification_type: string; status: string }>>();
    for (const delivery of deliveries.data || []) {
      const rows = deliveriesByUser.get(delivery.user_id) || [];
      rows.push(delivery);
      deliveriesByUser.set(delivery.user_id, rows);
    }

    let sent = 0;
    let scheduled = 0;
    let skipped = 0;
    let withoutPush = 0;
    let failed = 0;
    for (const profile of typedProfiles) {
      const state = states.get(profile.user_id);
      if (!state?.reliable) { skipped++; continue; }
      const direction = state.direction;
      const prior = deliveriesByUser.get(profile.user_id) || [];
      const sentPushes = prior.filter((item) => ["sent", "opened", "converted"].includes(item.status)).length;
      const activeAttempt = prior.some((item) => item.notification_type === (direction ? COPY[direction.action].type : "") && ["pending", "scheduled", "sent", "opened", "converted"].includes(item.status));
      if (!direction || sentPushes >= 3 || activeAttempt) {
        skipped++;
        continue;
      }
      if (!usersWithPush.has(profile.user_id)) {
        withoutPush++;
        continue;
      }
      const item = COPY[direction.action];
      try {
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
          first14StateAlreadyValidated: true,
        });
        if (result.channel === "push") sent++;
        else if (["scheduled_for_preferred_hour", "deferred_daily_cap"].includes(result.reason || "")) scheduled++;
        else skipped++;
      } catch (notificationError) {
        failed++;
        console.warn("Falha isolada ao avaliar cliente na condução inicial", profile.user_id, notificationError);
      }
    }

    const cursor = nextFirst14Cursor(typedProfiles, BATCH_SIZE);
    let continuationScheduled = false;
    if (cursor) {
      const { error: continuationError } = await db.from("scheduled_tasks").insert({
        user_id: cursor,
        task_type: "first14_batch",
        execute_at: new Date(Date.now() + 30_000).toISOString(),
        status: "pending",
        payload: { cursor, run_key: runKey },
      });
      if (continuationError?.code !== "23505") {
        if (continuationError) throw continuationError;
        continuationScheduled = true;
      }
    }
    const durationMs = Math.round(performance.now() - startedAt);
    console.log(JSON.stringify({ event: "first14_batch", run_key: runKey, cursor: parsed.data.cursor || null, next_cursor: cursor, processed: typedProfiles.length, sent, scheduled, skipped, without_push: withoutPush, failed, duration_ms: durationMs }));
    return json({ success: true, processed: typedProfiles.length, sent, scheduled, skipped, withoutPush, failed, durationMs, continuationScheduled, nextCursor: cursor });
  } catch (error) {
    console.error("Falha na condução dos primeiros 14 dias", error);
    return json({ error: "Não foi possível avaliar a condução inicial" }, 500);
  }
});