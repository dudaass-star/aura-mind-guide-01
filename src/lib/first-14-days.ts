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

export type First14Direction = {
  action: First14Action;
  milestone: string;
} | null;

export function chooseFirst14Direction(signals: First14Signals): First14Direction {
  if (signals.ageDays < 0 || signals.ageDays > 14) return null;
  if (!signals.hasConversation) return { action: "conversation", milestone: "first_conversation" };
  if (signals.hasUpcomingSession || signals.hasPendingEpisode) return null;

  const experienced = [signals.hasConversation, signals.hasJourney, signals.hasSessionExperience, signals.hasPractice]
    .filter(Boolean).length;
  if (experienced >= 2 && signals.ageDays >= 10 && !signals.hasProgress) {
    return { action: "progress", milestone: "value_accumulated" };
  }
  if (!signals.hasJourney && signals.ageDays >= 2 && !signals.ignoredActions?.includes("journey")) {
    return { action: "journey", milestone: "discover_journey" };
  }
  if (!signals.hasSessionExperience && signals.ageDays >= 5 && !signals.ignoredActions?.includes("session")) {
    return { action: "session", milestone: "discover_session" };
  }
  if (!signals.hasPractice && signals.ageDays >= 8 && !signals.ignoredActions?.includes("practice")) {
    return { action: "practice", milestone: "discover_practice" };
  }
  return null;
}

export function first14AgeDaysBrt(startAt: string, now = new Date()) {
  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  const startDay = Date.parse(`${day(new Date(startAt))}T12:00:00Z`);
  const currentDay = Date.parse(`${day(now)}T12:00:00Z`);
  return Math.max(0, Math.floor((currentDay - startDay) / 86_400_000));
}