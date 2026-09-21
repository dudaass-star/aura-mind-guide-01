function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashCheckoutAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

export function isCheckoutAccessToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

export async function saveCheckoutAccessClaim(
  supabase: any,
  input: {
    token: string;
    gateway: "stripe" | "asaas" | "inter" | "woovi";
    providerReference: string;
    checkoutSessionId?: string | null;
    email: string;
    phone: string;
    name?: string | null;
    plan: string;
    billing: string;
  },
): Promise<string | null> {
  if (!isCheckoutAccessToken(input.token)) return null;
  const tokenHash = await hashCheckoutAccessToken(input.token);
  const { data, error } = await supabase.from("checkout_access_claims").insert({
    token_hash: tokenHash,
    gateway: input.gateway,
    provider_reference: input.providerReference,
    checkout_session_id: input.checkoutSessionId || null,
    email: input.email.trim().toLowerCase(),
    phone: input.phone.replace(/\D/g, ""),
    name: input.name || null,
    plan: input.plan,
    billing: input.billing,
    status: "pending",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505" && input.providerReference) {
      const { data: existing } = await supabase.from("checkout_access_claims")
        .select("id")
        .eq("gateway", input.gateway)
        .eq("provider_reference", input.providerReference)
        .maybeSingle();
      if (existing?.id) return existing.id;
    }
    console.error("[checkout-access] Falha ao salvar intenção:", error.message);
    return null;
  }
  return data?.id || null;
}

export async function markCheckoutAccessPaid(
  supabase: any,
  claimId: string | null | undefined,
  profileUserId: string,
): Promise<void> {
  if (!claimId) return;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", profileUserId)
    .maybeSingle();
  if (!profile?.id) return;
  const { error } = await supabase.from("checkout_access_claims").update({
    status: "paid",
    profile_id: profile.id,
    paid_at: new Date().toISOString(),
  }).eq("id", claimId).in("status", ["pending", "confirming", "paid"]);
  if (error) console.error("[checkout-access] Falha ao liberar intenção:", error.message);
}

export async function markCheckoutAccessPaidByReference(
  supabase: any,
  gateway: "stripe" | "asaas" | "inter" | "woovi",
  providerReference: string | null | undefined,
  profileUserId: string,
): Promise<void> {
  if (!providerReference) return;
  const { data: claim } = await supabase.from("checkout_access_claims")
    .select("id").eq("gateway", gateway).eq("provider_reference", providerReference).maybeSingle();
  await markCheckoutAccessPaid(supabase, claim?.id, profileUserId);
}