/**
 * Guarda "já pagou / já autorizou" do trilho Woovi para as rotinas de
 * recuperação de checkout abandonado.
 *
 * Por que existe: a parcela do carnê (PIX Automático) NÃO chega por webhook e
 * NÃO aparece em `/api/v1/charge` — só no extrato (`/api/v1/transaction`). Como
 * a reconciliação local depende da varredura de extrato, existe uma janela em
 * que quem acabou de pagar continua parecendo abandono e recebe o WhatsApp de
 * recuperação (caso real de 19/08/2026).
 *
 * Duas camadas:
 *   1. `loadWooviCommitmentSets` — sets locais de e-mail/telefone com mandato
 *      aprovado, entrada paga ou parcela paga (barato, uma vez por execução).
 *   2. `hasLiveWooviCommitment` — checagem ao vivo na Woovi imediatamente antes
 *      de disparar, só para candidatos de PIX Automático. Mantém o gatilho em
 *      15 min sem precisar aumentar a carência.
 */

import { wooviFetch, MANDATE_ACTIVE_STATUSES, WOOVI_APPROVED_STATUSES } from "./woovi.ts";
import { getPhoneVariations, normalizeBrazilianPhone } from "./zapi-client.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

const COMMITTED_STATUSES = new Set(
  [...MANDATE_ACTIVE_STATUSES, ...WOOVI_APPROVED_STATUSES, "ACTIVE", "APPROVED"]
    .map((s) => String(s).toUpperCase()),
);

const onlyDigits = (v: unknown) => String(v || "").replace(/\D/g, "");

/**
 * Status remotos que provam autorização do MANDATO (não da assinatura).
 * `ACTIVE` fica de fora de propósito: a Woovi devolve a assinatura como ACTIVE
 * desde a criação, antes de qualquer autorização.
 */
const REMOTE_MANDATE_APPROVED = new Set([
  "APPROVED",
  "AUTHORIZED",
  "PIX_AUTOMATIC_APPROVED",
  "APROVADA",
  "ATIVA",
]);

const REMOTE_PAID = new Set(["COMPLETED", "PAID", "CONFIRMED", "PIX_AUTOMATIC_COBR_COMPLETED"]);

/** Alguma parcela do carnê já paga no objeto remoto da assinatura? */
function hasPaidInstallment(remote: Record<string, unknown>): boolean {
  // deno-lint-ignore no-explicit-any
  const lists: any[] = [
    (remote as any)?.installments,
    (remote as any)?.charges,
    (remote as any)?.payments,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item?.paidAt || item?.paid_at) return true;
      const s = String(item?.status || "").toUpperCase();
      if (REMOTE_PAID.has(s)) return true;
    }
  }
  return false;
}

function isCommitted(sub: Record<string, unknown>): boolean {
  if (sub.entry_paid_at || sub.access_granted_at || sub.mandate_approved_at) return true;
  const status = String(sub.status || "").toUpperCase();
  const pix = String(sub.pix_status || "").toUpperCase();
  return COMMITTED_STATUSES.has(status) || COMMITTED_STATUSES.has(pix);
}

/**
 * Monta sets de e-mail/telefone (variações) que já têm compromisso Woovi nos
 * últimos 30 dias: mandato aprovado, entrada paga ou parcela paga.
 */
export async function loadWooviCommitmentSets(
  supabase: Supa,
): Promise<{ emails: Set<string>; phones: Set<string> }> {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: subs } = await supabase
    .from("woovi_subscriptions")
    .select("subscription_id, customer_email, customer_phone, status, pix_status, entry_paid_at, access_granted_at, mandate_approved_at")
    .gte("created_at", since)
    .limit(1000);

  const bySubId = new Map<string, Record<string, unknown>>();
  const add = (sub: Record<string, unknown>) => {
    if (sub.customer_email) emails.add(String(sub.customer_email).toLowerCase());
    if (sub.customer_phone) {
      for (const v of getPhoneVariations(String(sub.customer_phone))) phones.add(v);
    }
  };

  for (const sub of subs || []) {
    if (sub.subscription_id) bySubId.set(String(sub.subscription_id), sub);
    if (isCommitted(sub)) add(sub);
  }

  // Parcelas pagas: cobre o caso em que o status do mandato ficou defasado.
  const { data: paidCharges } = await supabase
    .from("woovi_charges")
    .select("subscription_id")
    .not("paid_at", "is", null)
    .gte("created_at", since)
    .limit(1000);

  for (const c of paidCharges || []) {
    const sub = bySubId.get(String(c.subscription_id));
    if (sub) add(sub);
  }

  return { emails, phones };
}

export interface LiveWooviCheck {
  committed: boolean;
  reason?: string;
}

/**
 * Checagem ao vivo: existe mandato/parcela paga na Woovi para este contato?
 *
 * Ordem: mandato local → detalhe do mandato na Woovi → extrato (única fonte da
 * parcela do carnê). Falha de rede nunca bloqueia o envio (retorna false).
 */
export async function hasLiveWooviCommitment(
  supabase: Supa,
  contact: { email?: string | null; phone?: string | null },
): Promise<LiveWooviCheck> {
  const email = contact.email ? contact.email.toLowerCase() : null;
  const phone = contact.phone ? normalizeBrazilianPhone(contact.phone) : null;
  if (!email && !phone) return { committed: false };

  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  let sub: Record<string, unknown> | null = null;
  if (email) {
    const { data } = await supabase
      .from("woovi_subscriptions")
      .select("*")
      .eq("customer_email", email)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    sub = data?.[0] ?? null;
  }
  if (!sub && phone) {
    const { data } = await supabase
      .from("woovi_subscriptions")
      .select("*")
      .ilike("customer_phone", `%${phone.slice(-8)}%`)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    sub = data?.[0] ?? null;
  }

  if (sub && isCommitted(sub)) {
    return { committed: true, reason: "woovi_mandate_local" };
  }

  try {
    if (sub?.subscription_id) {
      const r = await wooviFetch<Record<string, unknown>>(
        `/api/v1/subscriptions/${encodeURIComponent(String(sub.subscription_id))}`,
      );
      if (r.ok && r.data) {
        const remote = ((r.data as Record<string, unknown>)?.subscription || r.data) as Record<string, unknown>;
        // ATENÇÃO: o `status` da assinatura na Woovi nasce como ACTIVE no
        // momento em que ela é criada, ANTES de qualquer autorização de
        // mandato. Usá-lo como prova silenciava todo lead que apenas abriu o
        // QR (caso real 20/08/2026: Ursula e Vivien). Só vale como
        // compromisso: status do bloco pixAutomatic autorizado OU parcela paga.
        const mandateStatus = String(
          ((remote?.pixAutomatic as Record<string, unknown>)?.status as string) ||
            (remote?.pixAutomaticStatus as string) ||
            "",
        ).toUpperCase();
        if (REMOTE_MANDATE_APPROVED.has(mandateStatus)) {
          return { committed: true, reason: "woovi_mandate_remote" };
        }
        if (hasPaidInstallment(remote)) {
          return { committed: true, reason: "woovi_installment_remote" };
        }
      }
    }

    // Extrato: a parcela do carnê aparece SÓ aqui.
    const cpf = onlyDigits(sub?.customer_cpf);
    const tx = await wooviFetch<Record<string, unknown>>("/api/v1/transaction?limit=100");
    const transactions: Record<string, unknown>[] =
      // deno-lint-ignore no-explicit-any
      Array.isArray((tx.data as any)?.transactions) ? (tx.data as any).transactions : [];
    const cutoff = Date.now() - 2 * 86400000;

    for (const t of transactions) {
      const when = String(t?.time || t?.createdAt || "");
      const ts = Date.parse(when);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (!Number(t?.value || 0)) continue;
      const payer = (t?.payer || {}) as Record<string, unknown>;
      const payerCpf = onlyDigits((payer?.taxID as Record<string, unknown>)?.taxID);
      const payerEmail = String(payer?.email || "").toLowerCase();
      const payerPhone = onlyDigits(payer?.phone);

      const match =
        (cpf && payerCpf && payerCpf === cpf) ||
        (email && payerEmail && payerEmail === email) ||
        (phone && payerPhone && payerPhone.slice(-8) === phone.slice(-8));

      if (match) return { committed: true, reason: "woovi_paid_statement" };
    }
  } catch (err) {
    console.warn("[woovi-guard] checagem ao vivo falhou:", (err as Error).message);
  }

  return { committed: false };
}
