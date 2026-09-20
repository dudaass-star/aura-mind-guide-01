const encoder = new TextEncoder();

export type RetentionOfferStatus =
  | "created" | "sent" | "delivered" | "opened" | "accepted"
  | "payment_pending" | "paid" | "applied" | "failed" | "expired" | "declined";

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function createRetentionOffer(supabase: any, input: {
  profileUserId: string;
  profileId?: string | null;
  phone?: string | null;
  email?: string | null;
  origin: string;
  reason?: string | null;
  tier: string;
  gateway: string;
  channel?: string;
  plan?: string | null;
  billingCycle?: string | null;
  amountCents?: number | null;
  metadata?: Record<string, unknown>;
  expiresInHours?: number;
}): Promise<{ id: string; code: string }> {
  const code = randomCode();
  const codeHash = await sha256(code);
  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 168) * 3600000).toISOString();
  const { data, error } = await supabase.from("retention_offers").insert({
    profile_user_id: input.profileUserId,
    profile_id: input.profileId ?? null,
    phone_normalized: input.phone?.replace(/\D/g, "") || null,
    email_normalized: input.email?.trim().toLowerCase() || null,
    origin: input.origin,
    reason: input.reason ?? null,
    tier: input.tier,
    gateway: input.gateway,
    channel: input.channel ?? "whatsapp",
    plan: input.plan ?? null,
    billing_cycle: input.billingCycle ?? null,
    amount_cents: input.amountCents ?? null,
    public_code_hash: codeHash,
    metadata: input.metadata ?? {},
    expires_at: expiresAt,
  }).select("id").single();
  if (error || !data?.id) throw new Error(`Falha ao criar oferta rastreável: ${error?.message || "sem id"}`);
  await recordRetentionOfferEvent(supabase, data.id, "created", input.origin);
  return { id: data.id, code };
}

export async function findRetentionOfferByCode(supabase: any, code: string): Promise<any | null> {
  if (!code || code.length < 20) return null;
  const codeHash = await sha256(code);
  const { data } = await supabase.from("retention_offers").select("*")
    .eq("public_code_hash", codeHash).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now() && !["paid", "applied"].includes(data.status)) {
    await recordRetentionOfferEvent(supabase, data.id, "expired", "retention_link");
    return null;
  }
  return data;
}

export async function recordRetentionOfferEvent(
  supabase: any,
  offerId: string | null | undefined,
  eventType: RetentionOfferStatus | "reconciled",
  source: string,
  providerReference?: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  if (!offerId) return;
  const { error } = await supabase.rpc("record_retention_offer_event", {
    _offer_id: offerId,
    _event_type: eventType,
    _source: source,
    _provider_reference: providerReference ?? null,
    _metadata: metadata,
  });
  if (error) console.error("[retention-offers] falha registrando evento:", error.message);
}