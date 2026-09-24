export type First14Action = "conversation" | "journey" | "session" | "practice" | "progress";

export type First14Signals = {
  ageDays: number;
  hasConversation: boolean;
  hasJourney: boolean;
  hasCompletedSession: boolean;
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

  const experienced = [signals.hasConversation, signals.hasJourney, signals.hasCompletedSession, signals.hasPractice]
    .filter(Boolean).length;
  if (experienced >= 2 && signals.ageDays >= 10 && !signals.hasProgress) {
    return { action: "progress", milestone: "value_accumulated" };
  }
  if (!signals.hasJourney && signals.ageDays >= 2) return { action: "journey", milestone: "discover_journey" };
  if (!signals.hasCompletedSession && signals.ageDays >= 5) return { action: "session", milestone: "discover_session" };
  if (!signals.hasPractice && signals.ageDays >= 8) return { action: "practice", milestone: "discover_practice" };
  return null;
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
  const { data: profile } = await db.from("profiles")
    .select("created_at,converted_at,trial_started_at,current_journey_id,last_user_message_at")
    .eq("user_id", userId).maybeSingle();
  if (!profile) return false;
  const [sessions, episodes, practices, progress] = await Promise.all([
    db.from("sessions").select("status,scheduled_at").eq("user_id", userId).in("status", ["completed", "scheduled", "in_progress"]),
    db.from("journey_episode_progress").select("status").eq("user_id", userId),
    db.from("user_meditation_history").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("portal_value_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", "progress").in("event_type", ["opened", "experienced"]),
  ]);
  const startAt = profile.converted_at || profile.trial_started_at || profile.created_at;
  const direction = chooseFirst14Direction({
    ageDays: Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 86_400_000)),
    hasConversation: Boolean(profile.last_user_message_at),
    hasJourney: Boolean(profile.current_journey_id) || (episodes.data?.length || 0) > 0,
    hasCompletedSession: (sessions.data || []).some((item: { status: string }) => item.status === "completed"),
    hasPractice: (practices.count || 0) > 0,
    hasProgress: (progress.count || 0) > 0,
    hasPendingEpisode: (episodes.data || []).some((item: { status: string }) => item.status === "released" || item.status === "in_progress"),
    hasUpcomingSession: (sessions.data || []).some((item: { status: string; scheduled_at?: string }) => item.status === "in_progress" || (item.status === "scheduled" && item.scheduled_at && new Date(item.scheduled_at).getTime() >= Date.now())),
  });
  return direction?.action === expectedAction;
}