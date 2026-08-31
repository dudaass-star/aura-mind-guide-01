/**
 * Encontro avulso de R$ 6,90 ("taster") — carta na manga do trilho do PIX.
 *
 * Regra de negócio: quem copiou o código do PIX e travou porque NÃO quer
 * autorizar cobrança automática pode pagar R$ 6,90 num PIX comum (cobrança
 * avulsa, sem mandato Bacen) e fazer UM encontro guiado de 45 minutos, com
 * 48h para agendar. Não é plano, não gera crédito e não renova sozinho.
 *
 * Este módulo concentra as travas para a oferta não virar porta dos fundos:
 *   • elegibilidade calculada no BACKEND (nunca decidida pelo LLM);
 *   • nunca para cliente ativo, em trial, em dunning ou ex-pagante;
 *   • uma oferta por telefone, com cooldown de 180 dias;
 *   • exige rastro real do trilho PIX (copia e cola copiado);
 *   • kill switch em system_config.taster_enabled (nasce desligado).
 */

import { normalizeBrazilianPhone, getPhoneVariations } from "./zapi-client.ts";
import { wooviFetch } from "./woovi.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Valor fixo da experiência, em centavos. Mesmo valor da entrada do semanal. */
export const TASTER_VALUE_CENTS = 690;
/** Prazo para agendar e fazer o encontro depois do pagamento. */
export const TASTER_WINDOW_HOURS = 48;
/** Cooldown por telefone: a experiência é 1× na vida útil comercial do lead. */
const TASTER_COOLDOWN_DAYS = 180;
/** Janela em que o rastro do trilho PIX ainda vale como elegibilidade. */
const PIX_TRACK_WINDOW_DAYS = 30;
/** TTL do QR avulso. Curto o suficiente para não virar código zumbi. */
const TASTER_QR_TTL_SECONDS = 24 * 3600;

const PLACEHOLDER_ADDRESS = {
  zipcode: "01310100",
  street: "Avenida Paulista",
  number: "1000",
  neighborhood: "Bela Vista",
  city: "Sao Paulo",
  state: "SP",
  complement: "",
};

export interface TasterEligibility {
  eligible: boolean;
  reason: string;
  phone: string;
  checkout?: {
    id: string | null;
    plan: string | null;
    billing: string | null;
    name: string | null;
    email: string | null;
    pix_copied_at: string | null;
  } | null;
  /** Oferta já registrada (para reaproveitar em vez de duplicar). */
  offer?: Record<string, unknown> | null;
}

/** Kill switch. Default: DESLIGADO — só liga depois do teste ponta a ponta. */
/** Telefones autorizados a testar o trilho com o kill switch ainda desligado. */
export async function isTasterTestPhone(supabase: Supa, phone: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("system_config").select("value").eq("key", "taster_test_phones").maybeSingle();
    const list = Array.isArray(data?.value) ? data.value : [];
    const target = normalizeBrazilianPhone(phone);
    return list.some((p: unknown) => normalizeBrazilianPhone(String(p)) === target);
  } catch {
    return false;
  }
}

export async function isTasterEnabled(supabase: Supa): Promise<boolean> {

  try {
    const { data } = await supabase
      .from("system_config").select("value").eq("key", "taster_enabled").maybeSingle();
    return data?.value === true;
  } catch {
    return false;
  }
}

/**
 * Elegibilidade determinística. O agente conversacional NUNCA decide isso:
 * ele apenas recebe "pode oferecer" ou "não pode".
 */
export async function checkTasterEligibility(
  supabase: Supa,
  args: { phone: string; email?: string | null; checkoutSessionId?: string | null },
): Promise<TasterEligibility> {
  const phone = normalizeBrazilianPhone(args.phone || "");
  if (!phone) return { eligible: false, reason: "sem_telefone", phone: "" };

  // Bypass de TESTE: só telefones listados em system_config.taster_test_phones.
  // Serve para validar o trilho ponta a ponta antes de ligar o kill switch.
  // Não afeta nenhum outro número.
  if (await isTasterTestPhone(supabase, phone)) {
    return { eligible: true, reason: "teste_bypass", phone };
  }

  if (!(await isTasterEnabled(supabase))) {
    return { eligible: false, reason: "desligado_por_config", phone };
  }


  const phoneVars = getPhoneVariations(phone);
  const email = (args.email || "").toLowerCase() || null;

  // 1. Cliente atual (qualquer estado que signifique relação viva) nunca entra.
  const { data: liveProfiles } = await supabase
    .from("profiles")
    .select("id, status, plan, plan_expires_at, taster_paid_at, taster_offered_at")
    .in("phone", phoneVars)
    .limit(5);
  const profiles = liveProfiles || [];
  const LIVE = ["active", "trial", "canceling", "past_due", "taster"];
  if (profiles.some((p: any) => LIVE.includes(String(p.status || "").toLowerCase()))) {
    return { eligible: false, reason: "cliente_ativo", phone };
  }
  // 2. Ex-pagante nunca entra (evita downgrade disfarçado).
  if (profiles.some((p: any) => p.plan || p.plan_expires_at)) {
    return { eligible: false, reason: "ex_assinante", phone };
  }
  if (profiles.some((p: any) => p.taster_paid_at)) {
    return { eligible: false, reason: "taster_ja_usado", phone };
  }

  if (email) {
    const { data: byEmail } = await supabase
      .from("profiles").select("id, status, plan").eq("email", email).limit(3);
    for (const p of byEmail || []) {
      if (LIVE.includes(String(p.status || "").toLowerCase())) {
        return { eligible: false, reason: "cliente_ativo_email", phone };
      }
      if (p.plan) return { eligible: false, reason: "ex_assinante_email", phone };
    }
  }

  // 3. Histórico de pagamento em qualquer trilho = já foi cliente.
  if (email) {
    const { data: asaasPaid } = await supabase
      .from("asaas_payments").select("id").eq("customer_email", email)
      .in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]).limit(1);
    if ((asaasPaid || []).length > 0) return { eligible: false, reason: "pagou_asaas", phone };

    const { data: wooviPaid } = await supabase
      .from("woovi_subscriptions").select("id")
      .eq("customer_email", email).not("entry_paid_at", "is", null).limit(1);
    if ((wooviPaid || []).length > 0) return { eligible: false, reason: "pagou_woovi", phone };
  }

  // 4. Uma oferta por telefone, com cooldown longo.
  const cooldownSince = new Date(Date.now() - TASTER_COOLDOWN_DAYS * 86400000).toISOString();
  const { data: offers } = await supabase
    .from("taster_offers").select("*")
    .eq("phone_normalized", phone)
    .gte("created_at", cooldownSince)
    .order("created_at", { ascending: false })
    .limit(5);
  const existing = (offers || [])[0] || null;
  if (existing?.paid_at) return { eligible: false, reason: "taster_ja_pago", phone, offer: existing };

  // 5. Rastro real de intenção de PIX: gerou o QR (e, melhor ainda, copiou o
  // código). Exigir só `pix_copied_at` deixaria a oferta inerte — essa marcação
  // depende do build publicado do checkout, e nem sempre chega.
  const trackSince = new Date(Date.now() - PIX_TRACK_WINDOW_DAYS * 86400000).toISOString();
  let checkoutQuery = supabase
    .from("checkout_sessions")
    .select("id, plan, billing, name, email, pix_copied_at, status")
    .in("payment_method", ["pix", "pix_auto", "pix_automatic"])
    .gte("created_at", trackSince)
    .order("created_at", { ascending: false })
    .limit(1);
  checkoutQuery = args.checkoutSessionId
    ? checkoutQuery.eq("id", args.checkoutSessionId)
    : checkoutQuery.in("phone", phoneVars);
  const { data: ck } = await checkoutQuery.maybeSingle();
  if (!ck) return { eligible: false, reason: "sem_rastro_trilho_pix", phone, offer: existing };
  if (String(ck.status || "") === "completed") {
    return { eligible: false, reason: "checkout_concluido", phone, offer: existing };
  }

  return {
    eligible: true,
    reason: existing ? "elegivel_oferta_existente" : "elegivel",
    phone,
    checkout: {
      id: ck.id, plan: ck.plan ?? null, billing: ck.billing ?? null,
      name: ck.name ?? null, email: ck.email ?? null, pix_copied_at: ck.pix_copied_at ?? null,
    },
    offer: existing,
  };
}

/** correlationID determinístico: 1 código por telefone por hora (idempotência). */
export function tasterCorrelationId(phone: string, at: Date = new Date()): string {
  return `taster_${normalizeBrazilianPhone(phone)}_${Math.floor(at.getTime() / 3600000)}`;
}

export function isTasterCorrelationId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith("taster_");
}

export interface TasterChargeResult {
  ok: boolean;
  copyPaste?: string;
  correlationId?: string;
  reason?: string;
  error?: string;
  offerId?: string;
}

/**
 * Cria (ou reaproveita) a cobrança avulsa de R$ 6,90 na Woovi.
 * Nada de /subscriptions aqui: sem mandato, sem linha em woovi_subscriptions.
 */
export async function createTasterCharge(
  supabase: Supa,
  args: {
    phone: string;
    name?: string | null;
    email?: string | null;
    cpf?: string | null;
    plan?: string | null;
    billing?: string | null;
    checkoutSessionId?: string | null;
    source?: string;
  },
): Promise<TasterChargeResult> {
  const phone = normalizeBrazilianPhone(args.phone || "");
  if (!phone) return { ok: false, reason: "sem_telefone" };

  const correlationId = tasterCorrelationId(phone);

  // Idempotência local: mesma hora, mesmo telefone → mesmo código.
  const { data: prior } = await supabase
    .from("taster_offers").select("*")
    .eq("charge_correlation_id", correlationId).maybeSingle();
  if (prior?.metadata && (prior.metadata as any).copy_paste) {
    return {
      ok: true, copyPaste: String((prior.metadata as any).copy_paste),
      correlationId, reason: "codigo_reaproveitado", offerId: prior.id,
    };
  }

  const customer: Record<string, unknown> = {
    name: (args.name || "Cliente").slice(0, 200),
    ...(args.email ? { email: args.email.toLowerCase() } : {}),
    phone: phone.startsWith("55") ? phone : `55${phone}`,
    ...(args.cpf ? { taxID: args.cpf.replace(/\D/g, "") } : {}),
    address: PLACEHOLDER_ADDRESS,
  };

  const res = await wooviFetch<Record<string, any>>("/api/v1/charge", {
    method: "POST",
    body: {
      correlationID: correlationId,
      value: TASTER_VALUE_CENTS,
      paymentType: "DYNAMIC",
      // Woovi rejeita caracteres fora do ASCII simples no comentario (erro
      // "Emoji nao e permitido"): manter texto plano, sem travessao nem acento.
      comment: "Aura - encontro guiado de 45 minutos (avulso)",

      expiresIn: TASTER_QR_TTL_SECONDS,
      customer,
    },
  });
  if (!res.ok) {
    return { ok: false, reason: "woovi_recusou", error: `HTTP ${res.status}: ${res.raw.slice(0, 240)}` };
  }
  const charge = ((res.data as Record<string, any>)?.charge || res.data) as Record<string, any>;
  const brCode = charge?.brCode ? String(charge.brCode) : "";
  if (!brCode) return { ok: false, reason: "sem_brcode" };

  const nowIso = new Date().toISOString();
  const { data: offer, error: offerErr } = await supabase
    .from("taster_offers")
    .upsert({
      phone_normalized: phone,
      phone_raw: args.phone,
      email: args.email ? args.email.toLowerCase() : null,
      name: args.name || null,
      checkout_session_id: args.checkoutSessionId || null,
      plan: args.plan || null,
      billing_period: args.billing || null,
      source: args.source || "porta_a",
      accepted_at: nowIso,
      charge_correlation_id: correlationId,
      charge_created_at: nowIso,
      value_cents: TASTER_VALUE_CENTS,
      metadata: { copy_paste: brCode, woovi_charge_id: charge?.globalID ?? null },
    }, { onConflict: "charge_correlation_id" })
    .select("id")
    .maybeSingle();
  if (offerErr) console.error("[taster] falha registrando oferta:", offerErr.message);

  // Marca no perfil (quando já existir) que a oferta saiu.
  try {
    await supabase.from("profiles")
      .update({ taster_offered_at: nowIso, taster_source: args.source || "porta_a" })
      .in("phone", getPhoneVariations(phone))
      .is("taster_paid_at", null);
  } catch { /* perfil pode não existir ainda — normal */ }

  return { ok: true, copyPaste: brCode, correlationId, offerId: offer?.id };
}

/** Texto único do código, usado igual na Porta A e na Porta B. */
export function tasterCodeMessage(code: string): string {
  return (
    "Fechado. Esse é o código de R$ 6,90 do encontro guiado de 45 minutos — " +
    "PIX comum, copia e cola normal, sem autorizar nada automático:\n\n" +
    `${code}\n\n` +
    "Assim que cair, a Aura te chama no WhatsApp oficial dela e vocês marcam o horário. " +
    "Você tem 48h pra fazer o encontro. Se depois disso você quiser continuar, escolhe o plano com calma."
  );
}
