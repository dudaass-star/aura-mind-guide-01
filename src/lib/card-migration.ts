/** A migração existente encerra automaticamente apenas mandatos Woovi de planos completos. */
export function canMigratePixToCard(gateway: string, tier?: string | null): boolean {
  return gateway === "woovi-pix" && !tier;
}