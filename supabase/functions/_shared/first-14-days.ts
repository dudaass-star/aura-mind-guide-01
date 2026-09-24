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
};

export type First14Direction = { action: First14Action; milestone: string } | null;

export function chooseFirst14Direction(signals: First14Signals): First14Direction {
  if (signals.ageDays < 0 || signals.ageDays > 14) return null;
  if (!signals.hasConversation) return { action: "conversation", milestone: "first_conversation" };
  if (signals.hasUpcomingSession || signals.hasPendingEpisode) return null;

  const experienced = [signals.hasConversation, signals.hasJourney, signals.hasSessionExperience, signals.hasPractice]
    .filter(Boolean).length;
  if (experienced >= 2 && signals.ageDays >= 10 && !signals.hasProgress) {
    return { action: "progress", milestone: "value_accumulated" };
  }
  if (!signals.hasJourney && signals.ageDays >= 2) return { action: "journey", milestone: "discover_journey" };
  if (!signals.hasSessionExperience && signals.ageDays >= 5) return { action: "session", milestone: "discover_session" };
  if (!signals.hasPractice && signals.ageDays >= 8) return { action: "practice", milestone: "discover_practice" };
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

  const [conversation, sessions, episodes, practices, progress] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user").eq("channel", "in_app"),
    db.from("sessions").select("status,scheduled_at,preparation_note").eq("user_id", userId).in("status", ["scheduled", "in_progress", "completed"]),
    db.from("journey_episode_progress").select("status,opened_at").eq("user_id", userId),
    db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "practice").eq("event_type", "audio_started"),
    db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "progress").eq("event_type", "opened"),
  ]);
  if ([conversation, sessions, episodes, practices, progress].some((result) => result.error)) {
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
    }),
  };
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