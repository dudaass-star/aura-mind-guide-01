export type First14Action = "conversation" | "journey" | "session" | "practice" | "progress";

export type First14Signals = {
  ageDays: number;
  hasConversation: boolean;
  hasJourney: boolean;
  hasSessionExperience: boolean;
  hasPractice: boolean;
  hasProgress: boolean;
  hasPendingEpisode: boolean;
  hasUpcomingSession: boolean;
  ignoredActions?: First14Action[];
};

export type First14Direction = { action: First14Action; milestone: string } | null;

export type First14Profile = {
  user_id: string;
  created_at: string;
  converted_at?: string | null;
  trial_started_at?: string | null;
};

export type First14BatchState = {
  direction: First14Direction;
  reliable: boolean;
};

export function ignoredFirst14Actions(events: Array<{ event_type?: string; metadata?: { action?: string } | null }>) {
  const ignored: First14Action[] = [];
  for (const action of ["journey", "session", "practice", "progress"] as First14Action[]) {
    const relevant = events.filter((event) => event.metadata?.action === action);
    const presentations = relevant.filter((event) => event.event_type === "priority_presented").length;
    const acted = relevant.some((event) => ["priority_opened", "priority_initiated", "priority_completed"].includes(event.event_type || ""));
    if (presentations >= 3 && !acted) ignored.push(action);
  }
  return ignored;
}

export function chooseFirst14Direction(signals: First14Signals): First14Direction {
  if (signals.ageDays < 0 || signals.ageDays > 14) return null;
  if (!signals.hasConversation) return { action: "conversation", milestone: "first_conversation" };
  if (signals.hasUpcomingSession || signals.hasPendingEpisode) return null;

  const experienced = [signals.hasConversation, signals.hasJourney, signals.hasSessionExperience, signals.hasPractice]
    .filter(Boolean).length;
  if (experienced >= 2 && signals.ageDays >= 10 && !signals.hasProgress) {
    return { action: "progress", milestone: "value_accumulated" };
  }
  if (!signals.hasJourney && signals.ageDays >= 2 && !signals.ignoredActions?.includes("journey")) return { action: "journey", milestone: "discover_journey" };
  if (!signals.hasSessionExperience && signals.ageDays >= 5 && !signals.ignoredActions?.includes("session")) return { action: "session", milestone: "discover_session" };
  if (!signals.hasPractice && signals.ageDays >= 8 && !signals.ignoredActions?.includes("practice")) return { action: "practice", milestone: "discover_practice" };
  return null;
}

export function brtDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function first14AgeDaysBrt(startAt: string, now = new Date()) {
  const startDay = Date.parse(`${brtDateKey(new Date(startAt))}T12:00:00Z`);
  const currentDay = Date.parse(`${brtDateKey(now)}T12:00:00Z`);
  return Math.max(0, Math.floor((currentDay - startDay) / 86_400_000));
}

export async function loadFirst14Direction(db: any, userId: string) {
  const profileResult = await db.from("profiles")
    .select("created_at,converted_at,trial_started_at")
    .eq("user_id", userId).maybeSingle();
  if (profileResult.error || !profileResult.data) return { direction: null, reliable: false };

  const [conversation, sessions, episodes, practices, progress, todayEvents] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user").eq("channel", "in_app"),
    db.from("sessions").select("status,scheduled_at,preparation_note").eq("user_id", userId).in("status", ["scheduled", "in_progress", "completed"]),
    db.from("journey_episode_progress").select("status,opened_at").eq("user_id", userId),
    db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "practice").eq("event_type", "audio_started"),
    db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "progress").eq("event_type", "opened"),
    db.from("portal_value_events").select("event_type,metadata").eq("user_id", userId).eq("feature", "today").gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString()).limit(200),
  ]);
  if ([conversation, sessions, episodes, practices, progress, todayEvents].some((result) => result.error)) {
    return { direction: null, reliable: false };
  }
  const profile = profileResult.data;
  const startAt = profile.converted_at || profile.trial_started_at || profile.created_at;
  const sessionRows = sessions.data || [];
  const episodeRows = episodes.data || [];
  return {
    reliable: true,
    direction: chooseFirst14Direction({
      ageDays: first14AgeDaysBrt(startAt),
      hasConversation: (conversation.count || 0) > 0,
      hasJourney: episodeRows.some((item: { opened_at?: string | null }) => Boolean(item.opened_at)),
      hasSessionExperience: sessionRows.length > 0,
      hasPractice: (practices.count || 0) > 0,
      hasProgress: (progress.count || 0) > 0,
      hasPendingEpisode: episodeRows.some((item: { status: string }) => item.status === "released" || item.status === "in_progress"),
      hasUpcomingSession: sessionRows.some((item: { status: string; scheduled_at?: string }) => item.status === "in_progress" || (item.status === "scheduled" && item.scheduled_at && new Date(item.scheduled_at).getTime() >= Date.now())),
      ignoredActions: ignoredFirst14Actions(todayEvents.data || []),
    }),
  };
}

export async function loadFirst14BatchDirections(
  db: any,
  profiles: First14Profile[],
): Promise<Map<string, First14BatchState>> {
  const result = new Map<string, First14BatchState>();
  if (!profiles.length) return result;
  const userIds = profiles.map((profile) => profile.user_id);
  const [conversation, sessions, episodes, practices, progress, todayEvents] = await Promise.all([
    db.from("messages").select("user_id").in("user_id", userIds).eq("role", "user").eq("channel", "in_app"),
    db.from("sessions").select("user_id,status,scheduled_at,preparation_note").in("user_id", userIds).in("status", ["scheduled", "in_progress", "completed"]),
    db.from("journey_episode_progress").select("user_id,status,opened_at").in("user_id", userIds),
    db.from("portal_value_events").select("user_id").in("user_id", userIds).eq("feature", "practice").eq("event_type", "audio_started"),
    db.from("portal_value_events").select("user_id").in("user_id", userIds).eq("feature", "progress").eq("event_type", "opened"),
    db.from("portal_value_events").select("user_id,event_type,metadata").in("user_id", userIds).eq("feature", "today").gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
  ]);
  const reads = [conversation, sessions, episodes, practices, progress, todayEvents];
  if (reads.some((read) => read.error)) {
    for (const profile of profiles) result.set(profile.user_id, { direction: null, reliable: false });
    return result;
  }

  const conversationUsers = new Set((conversation.data || []).map((row: { user_id: string }) => row.user_id));
  const practiceUsers = new Set((practices.data || []).map((row: { user_id: string }) => row.user_id));
  const progressUsers = new Set((progress.data || []).map((row: { user_id: string }) => row.user_id));
  const sessionsByUser = new Map<string, Array<{ status: string; scheduled_at?: string | null; preparation_note?: string | null }>>();
  const episodesByUser = new Map<string, Array<{ status: string; opened_at?: string | null }>>();
  const todayEventsByUser = new Map<string, Array<{ event_type?: string; metadata?: { action?: string } | null }>>();
  for (const row of sessions.data || []) {
    const rows = sessionsByUser.get(row.user_id) || [];
    rows.push(row);
    sessionsByUser.set(row.user_id, rows);
  }
  for (const row of episodes.data || []) {
    const rows = episodesByUser.get(row.user_id) || [];
    rows.push(row);
    episodesByUser.set(row.user_id, rows);
  }
  for (const row of todayEvents.data || []) {
    const rows = todayEventsByUser.get(row.user_id) || [];
    rows.push(row);
    todayEventsByUser.set(row.user_id, rows);
  }

  const now = Date.now();
  for (const profile of profiles) {
    const sessionRows = sessionsByUser.get(profile.user_id) || [];
    const episodeRows = episodesByUser.get(profile.user_id) || [];
    const startAt = profile.converted_at || profile.trial_started_at || profile.created_at;
    result.set(profile.user_id, {
      reliable: true,
      direction: chooseFirst14Direction({
        ageDays: first14AgeDaysBrt(startAt),
        hasConversation: conversationUsers.has(profile.user_id),
        hasJourney: episodeRows.some((item) => Boolean(item.opened_at)),
        hasSessionExperience: sessionRows.length > 0,
        hasPractice: practiceUsers.has(profile.user_id),
        hasProgress: progressUsers.has(profile.user_id),
        hasPendingEpisode: episodeRows.some((item) => item.status === "released" || item.status === "in_progress"),
        hasUpcomingSession: sessionRows.some((item) => item.status === "in_progress" || (item.status === "scheduled" && item.scheduled_at && new Date(item.scheduled_at).getTime() >= now)),
        ignoredActions: ignoredFirst14Actions(todayEventsByUser.get(profile.user_id) || []),
      }),
    });
  }
  return result;
}

export function nextFirst14Cursor<T extends { user_id: string }>(rows: T[], batchSize: number) {
  return rows.length === batchSize ? rows.at(-1)?.user_id || null : null;
}

export function actionFromNotificationType(type: string): First14Action | null {
  const actions: Record<string, First14Action> = {
    first14_conversation: "conversation",
    first14_journey: "journey",
    first14_session: "session",
    first14_practice: "practice",
    first14_progress: "progress",
  };
  return actions[type] ?? null;
}

export async function isFirst14NotificationCurrent(db: any, userId: string, type: string) {
  const expectedAction = actionFromNotificationType(type);
  if (!expectedAction) return true;
  const state = await loadFirst14Direction(db, userId);
  return state.reliable && state.direction?.action === expectedAction;
}