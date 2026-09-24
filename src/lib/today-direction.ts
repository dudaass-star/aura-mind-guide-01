import { supabasePortal } from "@/integrations/supabase/portal-client";

export type TodayAction = "conversation" | "session" | "session_preparation" | "journey" | "continuity" | "practice" | "progress";

export type TodayDirection = {
  action: TodayAction;
  eyebrow: string;
  title: string;
  description: string;
  button: string;
  target: "conversation" | "sessoes" | "jornadas" | "meditacoes" | "insights" | "episode";
  targetId?: string | null;
  milestone?: string | null;
  reason: string;
};

export type TodayDirectionResponse = {
  direction: TodayDirection;
  continuation: TodayDirection | null;
  pushEnabled: boolean;
  reliable: boolean;
  generatedAt: string;
};

const ATTRIBUTION_KEY = "aura-today-direction";

export function rememberTodayDirection(direction: TodayDirection) {
  localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
    action: direction.action,
    reason: direction.reason,
    milestone: direction.milestone ?? null,
    openedAt: Date.now(),
  }));
}

export function notifyTodayChanged() {
  window.dispatchEvent(new Event("aura:today-changed"));
}

export function reportTodayDirectionProgress(userId: string, stage: "initiated" | "completed", expectedAction: TodayAction) {
  const raw = localStorage.getItem(ATTRIBUTION_KEY);
  if (!raw) {
    notifyTodayChanged();
    return;
  }
  try {
    const attribution = JSON.parse(raw) as { action?: TodayAction; reason?: string; milestone?: string | null; openedAt?: number };
    if (attribution.action !== expectedAction || !attribution.openedAt || Date.now() - attribution.openedAt > 7 * 86_400_000) {
      notifyTodayChanged();
      return;
    }
    void supabasePortal.from("portal_value_events").insert({
      user_id: userId,
      feature: "today",
      event_type: `priority_${stage}`,
      source: "app",
      metadata: {
        action: expectedAction,
        reason: attribution.reason ?? null,
        milestone: attribution.milestone ?? null,
        elapsed_ms: Date.now() - attribution.openedAt,
      },
    }).then(({ error }) => {
      if (!error && stage === "completed") localStorage.removeItem(ATTRIBUTION_KEY);
    });
  } catch {
    localStorage.removeItem(ATTRIBUTION_KEY);
  }
  notifyTodayChanged();
}