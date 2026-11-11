// Seleção única do bloco principal da aba Hoje (horário de Brasília).
// Ordem: encontro ≤4h/em andamento → noite com áudio → encontro >4h e ≤24h → fio <48h → rotina.

export type HeroSession = { id: string; scheduled_at: string; status: string; preparation_note?: string | null };
export type HeroLastSession = { id: string; ended_at?: string | null; scheduled_at: string; theme_label?: string | null; closure_text?: string | null };

export type TodayHero =
  | { kind: "session"; session: HeroSession; canEnter: boolean }
  | { kind: "night"; secondarySession: HeroSession | null }
  | { kind: "prepare"; session: HeroSession }
  | { kind: "thread"; session: HeroLastSession; text: string }
  | { kind: "routine"; secondarySession: HeroSession | null };

const MIN = 60_000;
const HOUR = 60 * MIN;

export function brtMinutes(nowMs: number) {
  const brt = new Date(nowMs - 3 * HOUR);
  return brt.getUTCHours() * 60 + brt.getUTCMinutes();
}

export function brtDayKey(nowMs: number) {
  return new Date(nowMs - 3 * HOUR).toISOString().slice(0, 10);
}

// Noite: 20h30 até 05h59 em Brasília, atravessando a meia-noite.
export function isNightBrt(nowMs: number) {
  const m = brtMinutes(nowMs);
  return m >= 20 * 60 + 30 || m < 6 * 60;
}

// Mesma regra de acesso de SessoesTab: em andamento ou de 15 min antes até 1h depois.
export function canEnterSession(session: HeroSession, nowMs: number) {
  const diff = new Date(session.scheduled_at).getTime() - nowMs;
  return session.status === "in_progress" || (session.status === "scheduled" && diff <= 15 * MIN && diff >= -60 * MIN);
}

const GENERIC = [
  /foi (muito )?bom (conversar|falar|te ouvir|estar)/i, /obrigad[oa]/i, /at[eé] (a pr[oó]xima|logo|breve|mais)/i,
  /cuide[- ]se/i, /boa (noite|tarde|semana|dia)/i, /bom (dia|descanso|fim de semana)/i, /estou (aqui|por aqui|sempre aqui)/i,
  /conte comigo/i, /um abra[cç]o/i, /fique bem/i, /tchau/i, /beijo/i,
];
// Marcadores de reflexão, intenção ou próximo passo concreto.
const CONCRETE = /\b(quer(ia|o)?|vai|vou|decid|perceb|notou|reconhec|escolh|tentar|experiment|pr[oó]xim[oa] passo|antes de|quando|limite|pergunta|leve|carregar|observar|perceber|praticar|retomar|come[cç]ar|parar|dizer|responder|conversar com)\w*/i;

export function threadText(closure: string | null | undefined): string | null {
  if (!closure) return null;
  const clean = closure.replace(/\[[^\]]*\]/g, " ").replace(/\|\|\|/g, " ").replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => s && !GENERIC.some((re) => re.test(s)));
  const kept = sentences.join(" ").trim();
  if (kept.split(/\s+/).filter((w) => w.length > 2).length < 6) return null;
  if (!CONCRETE.test(kept)) return null;
  return kept;
}

export function selectTodayHero(input: {
  nowMs: number;
  nextSession: HeroSession | null;
  lastSession: HeroLastSession | null;
  nightAudioAvailable: boolean;
  dismissedThreadId: string | null;
}): TodayHero {
  const { nowMs } = input;
  const s = input.nextSession && ["scheduled", "in_progress"].includes(input.nextSession.status) ? input.nextSession : null;
  const diff = s ? new Date(s.scheduled_at).getTime() - nowMs : Infinity;
  if (s && (s.status === "in_progress" || canEnterSession(s, nowMs) || (diff >= 0 && diff <= 4 * HOUR))) {
    return { kind: "session", session: s, canEnter: canEnterSession(s, nowMs) };
  }
  const within24 = s && diff > 4 * HOUR && diff <= 24 * HOUR ? s : null;
  if (isNightBrt(nowMs) && input.nightAudioAvailable) return { kind: "night", secondarySession: within24 };
  if (within24) return { kind: "prepare", session: within24 };
  const last = input.lastSession;
  if (last && last.id !== input.dismissedThreadId) {
    const endedMs = new Date(last.ended_at || last.scheduled_at).getTime();
    const text = threadText(last.closure_text);
    if (text && nowMs - endedMs >= 0 && nowMs - endedMs < 48 * HOUR) return { kind: "thread", session: last, text };
  }
  return { kind: "routine", secondarySession: s && diff > 4 * HOUR && diff <= 24 * HOUR ? s : null };
}

// Barra da tela inicial: só mostra o estado escolhido se ele merece ação imediata.
// Preparo (>4h) e rotina ficam ocultos; nunca busca outro estado para preencher o espaço.
export type HomeBar =
  | { kind: "session"; session: HeroSession; canEnter: boolean }
  | { kind: "night" }
  | { kind: "thread"; sessionId: string };

export function homeBarFromHero(hero: TodayHero): HomeBar | null {
  if (hero.kind === "session") return { kind: "session", session: hero.session, canEnter: hero.canEnter };
  if (hero.kind === "night") return { kind: "night" };
  if (hero.kind === "thread") return { kind: "thread", sessionId: hero.session.id };
  return null;
}

// "Para você levar": só fechamentos com frase, decisão ou passo concreto; despedidas ficam de fora.
export function takeawayFromClosure(closure: string | null | undefined): string | null {
  return threadText(closure);
}
