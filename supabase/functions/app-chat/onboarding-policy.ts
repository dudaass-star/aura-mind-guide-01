export type PortalEntryContext = "new" | "migration" | "regular";

type ProfileDates = {
  created_at?: string | null;
  converted_at?: string | null;
  trial_started_at?: string | null;
};

const FIRST_ENTRY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isRecentCustomer(profile: ProfileDates, now = new Date()): boolean {
  const candidates = [profile.converted_at, profile.trial_started_at, profile.created_at]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!candidates.length) return false;
  const mostRecentStart = Math.max(...candidates);
  const age = now.getTime() - mostRecentStart;
  return age >= 0 && age <= FIRST_ENTRY_WINDOW_MS;
}

export function resolveEntryContext(
  requested: PortalEntryContext,
  profile: ProfileDates,
  now = new Date(),
): PortalEntryContext {
  if (requested === "migration") return "migration";
  if (requested === "new" || isRecentCustomer(profile, now)) return "new";
  return "regular";
}

export function buildPortalWelcome(firstName: string, context: PortalEntryContext): string | null {
  if (context === "migration") {
    return `Oi, ${firstName}. Chegamos ao nosso novo espaço. Sua história continua aqui — pode falar comigo do seu jeito, por texto ou áudio.`;
  }
  if (context === "new") {
    return `Oi, ${firstName}. Que bom te receber aqui. Quero começar pelo que importa de verdade pra você: o que fez você chegar até mim hoje?`;
  }
  return null;
}

export function portalWelcomeSource(context: Exclude<PortalEntryContext, "regular">): string {
  return `portal-welcome-v1:${context}`;
}