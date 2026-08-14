// Cache de identidade do Meta: guarda o último fbp/fbc conhecido por e-mail/telefone
// e serve de fallback quando a compra acontece sem cookie (outro dispositivo,
// cookie apagado, bloqueador). Sem isso o Purchase chega ao Meta sem atribuição.

export interface MetaIdentity {
  fbp?: string | null;
  fbc?: string | null;
  /** Identificador estável de 1ª parte (cookie aura_eid) capturado no checkout. */
  externalId?: string | null;
}

const normEmail = (email?: string | null): string | null =>
  email ? email.trim().toLowerCase() || null : null;

const normPhone = (phone?: string | null): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  // Formato único (55 + DDD + número): o checkout manda 11 dígitos e os
  // webhooks já normalizados; sem isso o cache nunca casava por telefone.
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length <= 11) return `55${digits}`;
  return digits;
};

/** Variantes do telefone para alcançar registros gravados antes da normalização. */
const phoneVariants = (phone: string): string[] => {
  const set = new Set<string>([phone]);
  if (phone.startsWith("55")) set.add(phone.slice(2));
  return [...set];
};

/** Grava/atualiza o par fbp+fbc do lead. Fire-and-forget: nunca lança. */
export async function saveMetaIdentity(
  supabase: any,
  args: { email?: string | null; phone?: string | null; fbp?: string | null; fbc?: string | null; source?: string },
): Promise<void> {
  try {
    const email = normEmail(args.email);
    const phone = normPhone(args.phone);
    if (!email && !phone) return;
    if (!args.fbp && !args.fbc) return;

    // Upsert manual: o índice único é por expressão (lower(email)), o que o
    // PostgREST não sabe resolver via onConflict.
    const patch: Record<string, unknown> = {
      last_source: args.source || null,
      updated_at: new Date().toISOString(),
    };
    if (args.fbp) patch.fbp = args.fbp;
    if (args.fbc) patch.fbc = args.fbc;

    let query = supabase.from("meta_identity_cache").select("id").limit(1);
    query = email ? query.ilike("email", email) : query.eq("phone", phone);
    const { data: existing } = await query.maybeSingle();

    if (existing?.id) {
      if (email) patch.email = email;
      if (phone) patch.phone = phone;
      await supabase.from("meta_identity_cache").update(patch).eq("id", existing.id);
      return;
    }

    await supabase.from("meta_identity_cache").insert({ email, phone, ...patch });
  } catch (e) {
    console.warn("[meta-identity] save falhou (non-blocking):", (e as Error)?.message);
  }
}

/**
 * Devolve fbp/fbc, preferindo os valores da própria transação e caindo no
 * cache (janela de 90 dias, igual à validade do _fbc no Meta) quando faltarem.
 */
export async function resolveMetaIdentity(
  supabase: any,
  args: { email?: string | null; phone?: string | null; fbp?: string | null; fbc?: string | null },
): Promise<MetaIdentity> {
  const current: MetaIdentity = { fbp: args.fbp || null, fbc: args.fbc || null };
  if (current.fbp && current.fbc) return current;

  try {
    const email = normEmail(args.email);
    const phone = normPhone(args.phone);
    if (!email && !phone) return current;

    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    let query = supabase
      .from("meta_identity_cache")
      .select("fbp, fbc")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(1);
    query = email ? query.ilike("email", email) : query.eq("phone", phone);
    let { data } = await query.maybeSingle();

    // Sem registro por e-mail, tenta pelo telefone (compra em outro dispositivo
    // costuma trazer e-mail diferente do usado no primeiro contato).
    if (!data && email && phone) {
      const alt = await supabase
        .from("meta_identity_cache")
        .select("fbp, fbc")
        .eq("phone", phone)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = alt.data;
    }

    if (!data) return current;
    return {
      fbp: current.fbp || data.fbp || null,
      fbc: current.fbc || data.fbc || null,
    };
  } catch (e) {
    console.warn("[meta-identity] resolve falhou (non-blocking):", (e as Error)?.message);
    return current;
  }
}