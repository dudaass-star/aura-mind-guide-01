export type RetentionTier = "pause" | "discount_30" | "lite" | "base";

const OFFERS_BY_REASON: Record<string, RetentionTier[]> = {
  expensive: ["discount_30", "lite", "base"],
  not_using: ["pause", "base"],
  come_back_later: ["pause", "base"],
  not_satisfied: [],
  other: ["discount_30", "lite", "base"],
};

export function retentionOffers(reason: string, gateway: string | undefined, discountAvailable: boolean, highlighted?: RetentionTier | null): RetentionTier[] {
  const ordered = highlighted
    ? [highlighted, ...(OFFERS_BY_REASON[reason] ?? []).filter(tier => tier !== highlighted)]
    : OFFERS_BY_REASON[reason] ?? [];
  return ordered.filter(tier => {
    if (gateway === "inter_pix") return false;
    if (gateway === "woovi_pix" && (tier === "pause" || tier === "discount_30")) return false;
    return tier !== "discount_30" || discountAvailable;
  });
}

export function canManageSubscription(status?: string | null): boolean {
  return ["active", "trial", "trialing", "past_due", "payment_failed", "canceling", "paused"].includes(String(status ?? "").toLowerCase());
}