// Ritmo do convite do Movimento: raro, só em momentos de alívio e nunca na degustação.
export const GIFT_COOLDOWN_DAYS = 21;
export const GIFT_MIN_PRAYERS = 3;
export const GIFT_MIN_RATING = 4;
const DAY = 86_400_000;

export type GiftState = { lastPromptAt?: number; sharedAt?: number; prayersCompleted?: number };

export function canOfferGift(input: {
  status?: string | null;
  isDemo?: boolean;
  state: GiftState;
  now: number;
  trigger: "session" | "prayer";
  rating?: number;
}): boolean {
  if (input.isDemo) return false;
  if (input.status !== "active" && input.status !== "trial") return false;
  // Quem já compartilhou não recebe novos pedidos.
  if (input.state.sharedAt) return false;
  if (input.state.lastPromptAt && input.now - input.state.lastPromptAt < GIFT_COOLDOWN_DAYS * DAY) return false;
  if (input.trigger === "session") return (input.rating ?? 0) >= GIFT_MIN_RATING;
  return (input.state.prayersCompleted ?? 0) >= GIFT_MIN_PRAYERS;
}

const key = (userId: string) => `aura-movement-gift:${userId}`;
export function readGiftState(userId: string): GiftState {
  try { return JSON.parse(localStorage.getItem(key(userId)) || "{}"); } catch { return {}; }
}
export function writeGiftState(userId: string, patch: Partial<GiftState>) {
  try { localStorage.setItem(key(userId), JSON.stringify({ ...readGiftState(userId), ...patch })); } catch { /* armazenamento indisponível */ }
}
