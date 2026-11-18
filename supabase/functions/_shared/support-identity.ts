// Identificação do cliente no suporte: o remetente nem sempre escreve com o mesmo
// e-mail cadastrado (Gmail ignora pontos e "+tag") e muitas vezes informa o telefone no corpo.
// deno-lint-ignore-file no-explicit-any

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Forma canônica para comparação: minúsculas; no Gmail remove pontos e "+tag". */
export function normalizeEmail(raw: string | null | undefined): string {
  const email = (raw || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split("+")[0].replace(/\./g, "");
    domain = "gmail.com";
  } else {
    local = local.split("+")[0];
  }
  return `${local}@${domain}`;
}

/** Extrai telefones brasileiros do texto no padrão 55+DDD+9+8 dígitos. */
export function extractBrazilPhones(texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  const re = /(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}/g;
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.match(re) || []) {
      let d = m.replace(/\D/g, "");
      if (d.length === 12 || d.length === 13) {
        if (!d.startsWith("55")) continue;
        d = d.slice(2);
      }
      if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
      if (d.length !== 11 || d[2] !== "9" || d.startsWith("0")) continue;
      found.add("55" + d);
    }
  }
  return [...found];
}

export type SupportIdentityMatch = {
  profile: { user_id: string; email: string | null; name: string | null } | null;
  matched_by: "email_exact" | "email_normalized" | "phone" | null;
  ambiguous: boolean;
};

/** Resolve o perfil por e-mail exato, e-mail normalizado e telefone citado; nunca escolhe entre candidatos diferentes. */
export async function resolveSupportProfile(
  supabase: any,
  fromEmail: string,
  texts: Array<string | null | undefined>,
): Promise<SupportIdentityMatch> {
  const email = (fromEmail || "").trim().toLowerCase();
  const sel = "user_id, email, name, phone";
  if (email) {
    const { data } = await supabase.from("profiles").select(sel).ilike("email", email).limit(2);
    if (data?.length === 1) return { profile: data[0], matched_by: "email_exact", ambiguous: false };
  }

  const canonical = normalizeEmail(email);
  const at = canonical.lastIndexOf("@");
  if (at > 0 && canonical.endsWith("@gmail.com")) {
    // Padrão tolerante a pontos/+tag; a igualdade é confirmada em memória.
    const local = canonical.slice(0, at);
    const pattern = local.split("").join("%") + "%@%mail.com";
    const { data } = await supabase.from("profiles").select(sel).ilike("email", pattern).limit(50);
    const hits = (data || []).filter((p: any) => normalizeEmail(p.email) === canonical);
    if (hits.length === 1) return { profile: hits[0], matched_by: "email_normalized", ambiguous: false };
    if (hits.length > 1) return { profile: null, matched_by: null, ambiguous: true };
  }

  const phones = extractBrazilPhones(texts);
  if (phones.length) {
    // Também aceita o cadastro antigo sem o nono dígito.
    const variants = phones.flatMap((p) => [p, p.slice(0, 4) + p.slice(5)]);
    const { data } = await supabase.from("profiles").select(sel).in("phone", variants).limit(3);
    const unique = new Map((data || []).map((p: any) => [p.user_id, p]));
    if (unique.size === 1) return { profile: [...unique.values()][0] as any, matched_by: "phone", ambiguous: false };
    if (unique.size > 1) return { profile: null, matched_by: null, ambiguous: true };
  }
  return { profile: null, matched_by: null, ambiguous: false };
}
