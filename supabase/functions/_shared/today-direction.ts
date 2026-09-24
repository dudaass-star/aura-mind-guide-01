import { chooseFirst14Direction, first14AgeDaysBrt, type First14Direction } from "./first-14-days.ts";

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

export type TodaySignals = {
  nowMs: number;
  accountStartAt: string;
  hasConversation: boolean;
  hasJourneyExperience: boolean;
  hasSessionExperience: boolean;
  hasPracticeExperience: boolean;
  hasProgressExperience: boolean;
  nextSession: { id: string; scheduled_at: string; status: string; preparation_note?: string | null } | null;
  pendingEpisode: { id: string; title?: string | null; stage_title?: string | null; episode_number: number } | null;
  lastSession: { focus_topic?: string | null; theme_label?: string | null; closure_text?: string | null; session_summary?: string | null } | null;
  ignoredActions?: TodayAction[];
};

function fromFirst14(direction: First14Direction): TodayDirection | null {
  if (!direction) return null;
  const items: Record<NonNullable<First14Direction>["action"], Omit<TodayDirection, "milestone">> = {
    conversation: { action: "conversation", eyebrow: "Seu começo", title: "Pode começar do seu jeito", description: "Conte o que está passando por você agora, por texto ou áudio.", button: "Conversar com a AURA", target: "conversation", reason: "first14_conversation" },
    journey: { action: "journey", eyebrow: "Um segundo jeito de cuidar de você", title: "Escolha um tema para acompanhar no seu ritmo", description: "As Jornadas organizam um assunto em episódios curtos. Você escolhe o que faz sentido agora.", button: "Conhecer Jornadas", target: "jornadas", reason: "first14_journey" },
    session: { action: "session", eyebrow: "Mais tempo para um assunto", title: "Conheça seus encontros com a AURA", description: "Nas sessões, você reserva um tempo maior para olhar com calma o que precisa de direção.", button: "Conhecer Sessões", target: "sessoes", reason: "first14_session" },
    practice: { action: "practice", eyebrow: "Uma pausa no seu ritmo", title: "Há práticas em áudio para momentos diferentes", description: "Use quando ouvir fizer mais sentido do que conversar ou ler.", button: "Explorar práticas", target: "meditacoes", reason: "first14_practice" },
    progress: { action: "progress", eyebrow: "Continuidade construída", title: "Seu percurso começa a ganhar forma", description: "Veja o que já ficou registrado, sempre como uma leitura que você pode confirmar ou corrigir.", button: "Ver meu percurso", target: "insights", reason: "first14_progress" },
  };
  return { ...items[direction.action], milestone: direction.milestone };
}

export function chooseTodayDirection(signals: TodaySignals): { direction: TodayDirection; continuation: TodayDirection | null } {
  const next = signals.nextSession;
  const sessionDiff = next ? new Date(next.scheduled_at).getTime() - signals.nowMs : Number.POSITIVE_INFINITY;
  if (next && (next.status === "in_progress" || (sessionDiff >= -60 * 60_000 && sessionDiff <= 15 * 60_000))) {
    return { direction: { action: "session", eyebrow: next.status === "in_progress" ? "Seu encontro está acontecendo" : "Seu encontro começa em breve", title: next.status === "in_progress" ? "Continue sua sessão" : "Está quase na hora", description: next.scheduled_at, button: next.status === "in_progress" ? "Continuar sessão" : "Entrar na sessão", target: "sessoes", targetId: next.id, reason: "session_imminent" }, continuation: null };
  }
  if (next && sessionDiff > 15 * 60_000 && sessionDiff <= 48 * 60 * 60_000 && !next.preparation_note) {
    return { direction: { action: "session_preparation", eyebrow: "Antes do próximo encontro", title: "Tem algo que você não quer esquecer?", description: next.scheduled_at, button: "Preparar este encontro", target: "sessoes", targetId: next.id, reason: "session_prepare_48h" }, continuation: null };
  }
  if (signals.pendingEpisode) {
    return { direction: { action: "journey", eyebrow: "Sua jornada continua", title: signals.pendingEpisode.stage_title || signals.pendingEpisode.title || "Seu próximo episódio", description: `Episódio ${signals.pendingEpisode.episode_number} disponível para você continuar no seu ritmo.`, button: "Abrir episódio", target: "episode", targetId: signals.pendingEpisode.id, reason: "pending_episode" }, continuation: next ? distantSession(next) : null };
  }

  const first14 = fromFirst14(chooseFirst14Direction({
    ageDays: first14AgeDaysBrt(signals.accountStartAt, new Date(signals.nowMs)),
    hasConversation: signals.hasConversation,
    hasJourney: signals.hasJourneyExperience,
    hasSessionExperience: signals.hasSessionExperience,
    hasPractice: signals.hasPracticeExperience,
    hasProgress: signals.hasProgressExperience,
    hasPendingEpisode: false,
    hasUpcomingSession: Boolean(next),
    ignoredActions: signals.ignoredActions?.filter((action): action is "conversation" | "journey" | "session" | "practice" | "progress" => action !== "session_preparation" && action !== "continuity"),
  }));
  if (first14) return { direction: first14, continuation: next ? distantSession(next) : null };

  if (signals.lastSession?.closure_text || signals.lastSession?.session_summary) {
    return { direction: { action: "continuity", eyebrow: "Um fio para continuar", title: signals.lastSession.theme_label || signals.lastSession.focus_topic || "O que ficou do último encontro", description: signals.lastSession.closure_text || signals.lastSession.session_summary || "", button: "Retomar com a AURA", target: "conversation", reason: "last_session_continuity" }, continuation: next ? distantSession(next) : null };
  }
  return { direction: { action: "conversation", eyebrow: "Seu momento agora", title: "O que merece atenção hoje?", description: "Você não precisa chegar com tudo organizado. Comece pelo que estiver mais vivo.", button: "Conversar com a AURA", target: "conversation", reason: "open_conversation" }, continuation: next ? distantSession(next) : null };
}

function distantSession(session: TodaySignals["nextSession"]): TodayDirection | null {
  if (!session) return null;
  return { action: "session", eyebrow: "Próxima sessão", title: "Seu próximo encontro", description: session.scheduled_at, button: "Ver em Sessões", target: "sessoes", targetId: session.id, reason: "upcoming_session" };
}