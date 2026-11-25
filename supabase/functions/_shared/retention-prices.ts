export function offerValueCents(tier: string, fullCents: number): number {
  if (tier === "discount_30") return Math.round(fullCents * 0.7);
  if (tier === "lite") return 1990;
  if (tier === "base") return 990;
  return fullCents;
}

export function retentionBillingCycle(tier: string | null, currentCycle: string): string {
  return tier === "lite" || tier === "base" ? "monthly" : currentCycle;
}