// Sugestão do próximo encontro conforme o ritmo do plano (BRT).
// Essencial: quinzenal (2/mês). Direção: semanal (4/mês). Transformação: 2x por semana (8/mês).
const DAY = 86_400_000;

export const PLAN_SESSION_LIMITS: Record<string, number> = { essencial: 2, mensal: 2, direcao: 4, transformacao: 8 };

export function planSessionLimit(plan?: string | null, tier?: string | null): number {
  const t = String(tier || "").toLowerCase();
  if (t === "base") return 0;
  if (t === "lite" || t === "taster") return 1;
  return PLAN_SESSION_LIMITS[String(plan || "").toLowerCase()] || 0;
}

/** Intervalo em dias a partir do último encontro. */
export function intervalDays(plan: string | null | undefined, lastAt: Date): number {
  const p = String(plan || "").toLowerCase();
  if (p === "essencial" || p === "mensal") return 14;
  if (p === "transformacao") {
    // Dia da semana em BRT: seg–qua → +3 (ex.: seg→qui); qui–dom → +4 (ex.: qui→seg).
    const wd = new Date(lastAt.getTime() - 3 * 3_600_000).getUTCDay();
    return wd >= 1 && wd <= 3 ? 3 : 4;
  }
  return 7;
}

/** Mesmo horário do último encontro, deslocado pelo ritmo do plano; sempre ao menos 15 min no futuro. */
export function suggestNextSession(plan: string | null | undefined, lastScheduledAt: string, now = new Date()): Date {
  const last = new Date(lastScheduledAt);
  const rounded = new Date(Math.round(last.getTime() / (15 * 60_000)) * 15 * 60_000);
  let next = new Date(rounded.getTime() + intervalDays(plan, rounded) * DAY);
  while (next.getTime() < now.getTime() + 15 * 60_000) next = new Date(next.getTime() + intervalDays(plan, next) * DAY);
  return next;
}
