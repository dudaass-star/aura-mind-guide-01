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

export type First14Direction = {
  action: First14Action;
  milestone: string;
} | null;

export function chooseFirst14Direction(signals: First14Signals): First14Direction {
  if (signals.ageDays < 0 || signals.ageDays > 14) return null;
  if (!signals.hasConversation) return { action: "conversation", milestone: "first_conversation" };
  if (signals.hasUpcomingSession || signals.hasPendingEpisode) return null;

  const experienced = [signals.hasConversation, signals.hasJourney, signals.hasCompletedSession, signals.hasPractice]
    .filter(Boolean).length;
  if (experienced >= 2 && signals.ageDays >= 10 && !signals.hasProgress) {
    return { action: "progress", milestone: "value_accumulated" };
  }
  if (!signals.hasJourney && signals.ageDays >= 2) {
    return { action: "journey", milestone: "discover_journey" };
  }
  if (!signals.hasCompletedSession && signals.ageDays >= 5) {
    return { action: "session", milestone: "discover_session" };
  }
  if (!signals.hasPractice && signals.ageDays >= 8) {
    return { action: "practice", milestone: "discover_practice" };
  }
  return null;
}