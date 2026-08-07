/**
 * Helper de dunning via WhatsApp (templates Twilio aprovados).
 *
 * - Usa a SUBACCOUNT de recuperação (mesma do carrinho abandonado),
 *   não o número da Aura.
 * - Cadência por CICLO de cobrança (attemptNumber):
 *     1 → aviso genérico de falha de pagamento (utility)
 *     2 → aviso genérico de falha de pagamento (utility)
 *     3 → dunning_offer_30   (30% off por 3 meses)
 *     4 → dunning_offer_lite (R$ 19,90/mês)
 *   O degrau "base" (R$ 9,90) saiu do WhatsApp e vive só em /cancelar.
 *   Cada template de oferta: {{1}} = primeiro nome,
 *   {{2}} = query string do botão (`t=<token>&offer=<tier>`),
 *   URL do botão = https://olaaura.com.br/cancelar?{{2}}
 * - Template genérico (avisos 1 e 2 / fallback): HXaf4af1e1f5d4cf40b6fff6b5b68df29a
 *   {{1}} = primeiro nome, {{2}} = SOMENTE o token (a URL do botão já é
 *   `https://olaaura.com.br/pagamento?t={{2}}`). Passar a URL completa aqui
 *   gerava `/pagamento?t=https://...` — URL inválida e a Twilio devolvia
 *   ErrorCode 63027 (nenhum aviso 1/2 era entregue).
 * - Escopo da contagem é o CICLO (invoice_id → payment_id → subscription_id),
 *   nunca a assinatura inteira: cada nova fatura/cobrança recomeça no aviso.
 * - Idempotência: dedup por (profile_user_id, event_id, channel='whatsapp').
 * - Templates de oferta são categoria MARKETING no Meta → só disparam entre
 *   08h e 21h BRT; fora da janela o envio é adiado via scheduled_tasks.
 */

import { sendRecoveryTemplate } from "./twilio-recovery-client.ts";

/** Template genérico de falha de pagamento (utility, sem restrição de horário). */
export const DUNNING_CONTENT_SID = "HXaf4af1e1f5d4cf40b6fff6b5b68df29a";

/** Quantos avisos (template utility) vêm antes da escada de ofertas. */
export const DUNNING_NOTICE_STEPS = 2;

/** Teto por ciclo no cartão: 2 avisos + 2 degraus de oferta. */
export const DUNNING_MAX_ATTEMPTS = 4;

export type DunningOfferTier = "discount_30" | "lite" | "base";

interface OfferTemplate {
  tier: DunningOfferTier;
  /** ContentSid aprovado no Twilio; null enquanto o template não existir. */
  sid: string | null;
}

/**
 * Escada de ofertas: índice 0 = primeira tentativa DEPOIS dos avisos
 * (ou seja, attemptNumber === DUNNING_NOTICE_STEPS + 1).
 */
export const DUNNING_OFFER_LADDER: OfferTemplate[] = [
  { tier: "discount_30", sid: "HX50cb75b6bb3cd9ae56ef2d9c6adc4781" },
  { tier: "lite", sid: "HX18e81fa401b8487c360f085e9b83630f" },
];

/**
 * Escada do PIX: o desconto de 30% depende de token de cartão salvo
 * (`apply_discount_3m` recusa no PIX Asaas), então oferecê-lo por WhatsApp
 * era beco sem saída. PIX vai direto pro Lite; o Base segue só em /cancelar.
 */
export const DUNNING_OFFER_LADDER_PIX: OfferTemplate[] = [
  { tier: "lite", sid: "HX18e81fa401b8487c360f085e9b83630f" },
];

const MARKETING_WINDOW_START_BRT = 8;
const MARKETING_WINDOW_END_BRT = 21;

function brtHour(now = new Date()): number {
  return new Date(now.getTime() - 3 * 3600 * 1000).getUTCHours();
}

function insideMarketingWindow(now = new Date()): boolean {
  const h = brtHour(now);
  return h >= MARKETING_WINDOW_START_BRT && h < MARKETING_WINDOW_END_BRT;
}

/** Próximo horário permitido (08:00 BRT do dia atual ou seguinte). */
function nextMarketingSlot(now = new Date()): Date {
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  const h = brt.getUTCHours();
  const target = new Date(brt);
  target.setUTCMinutes(0, 0, 0);
  if (h < MARKETING_WINDOW_START_BRT) {
    target.setUTCHours(MARKETING_WINDOW_START_BRT);
  } else {
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(MARKETING_WINDOW_START_BRT);
  }
  return new Date(target.getTime() + 3 * 3600 * 1000);
}

export interface DunningWhatsAppParams {
  supabase: any;
  profile: {
    user_id: string;
    phone?: string | null;
    name?: string | null;
  };
  eventId: string;
  provider: "stripe" | "asaas";
  invoiceId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  customerId?: string | null;
  /** Ignora a janela de marketing (usado pelo executor da tarefa adiada). */
  skipWindowCheck?: boolean;
  /** Força um tier específico (usado pelo executor da tarefa adiada). */
  forceAttemptNumber?: number;
  /** Método de pagamento do ciclo (ex.: "PIX", "CREDIT_CARD") — define a escada. */
  paymentMethod?: string | null;
}

export interface DunningWhatsAppResult {
  sent: boolean;
  skipped?: string;
  attemptNumber?: number;
  messageSid?: string;
  error?: string;
  link?: string;
  tier?: DunningOfferTier | "generic";
  deferredTo?: string;
}

function firstName(name?: string | null): string {
  if (!name) return "tudo bem";
  const first = name.trim().split(/\s+/)[0];
  return first || "tudo bem";
}

async function ensurePortalToken(supabase: any, userId: string): Promise<string | null> {
  try {
    await supabase
      .from("user_portal_tokens")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    const { data } = await supabase
      .from("user_portal_tokens")
      .select("token")
      .eq("user_id", userId)
      .single();
    return data?.token || null;
  } catch (err) {
    console.error("[dunning-whatsapp] erro garantindo portal token:", err);
    return null;
  }
}

/**
 * Dispara o template de dunning via WhatsApp para o profile.
 * Sempre grava em `dunning_attempts` (channel='whatsapp') com o resultado,
 * mesmo em skip/erro, pra auditoria e contagem.
 */
export async function sendDunningWhatsApp(
  params: DunningWhatsAppParams,
): Promise<DunningWhatsAppResult> {
  const {
    supabase, profile, eventId, provider,
    invoiceId = null, subscriptionId = null, paymentId = null, customerId = null,
    skipWindowCheck = false, forceAttemptNumber, paymentMethod = null,
  } = params;

  // Escada por método: PIX não tem degrau de 30% (não é aplicável sem cartão).
  const isPix = String(paymentMethod || "").toUpperCase().includes("PIX");
  const ladder = isPix ? DUNNING_OFFER_LADDER_PIX : DUNNING_OFFER_LADDER;
  const maxAttempts = DUNNING_NOTICE_STEPS + ladder.length;

  const baseRecord: Record<string, any> = {
    event_id: eventId,
    profile_user_id: profile.user_id,
    customer_id: customerId,
    invoice_id: invoiceId,
    subscription_id: subscriptionId,
    payment_id: paymentId,
    provider,
    channel: "whatsapp",
    phone_raw: profile.phone || null,
    phone_resolved: profile.phone || null,
    profile_found: true,
  };

  // Sem telefone → não dá pra enviar WhatsApp; loga skip e segue.
  if (!profile.phone) {
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      template_sid: DUNNING_CONTENT_SID,
      error_stage: "no_phone",
      error_message: "Profile sem telefone — WhatsApp não enviado",
    });
    return { sent: false, skipped: "no_phone" };
  }

  // Idempotência: mesmo evento já processado?
  try {
    const { data: dup } = await supabase
      .from("dunning_attempts")
      .select("id, message_sid")
      .eq("event_id", eventId)
      .eq("channel", "whatsapp")
      .eq("profile_user_id", profile.user_id)
      .maybeSingle();
    if (dup) {
      console.log(`[dunning-whatsapp] evento ${eventId} já processado, pulando`);
      return { sent: false, skipped: "duplicate_event", messageSid: dup.message_sid };
    }
  } catch (_) { /* segue mesmo sem checar */ }

  // Escopo do ciclo: fatura (Stripe) → cobrança (Asaas) → assinatura (fallback).
  // Contar por subscription_id é errado como regra principal: o id é o mesmo
  // ciclo após ciclo e a escada nunca reiniciaria numa nova cobrança.
  const scopeFilter = invoiceId
    ? { col: "invoice_id", val: invoiceId }
    : paymentId
    ? { col: "payment_id", val: paymentId }
    : subscriptionId
    ? { col: "subscription_id", val: subscriptionId }
    : null;

  let attemptNumber = forceAttemptNumber ?? 1;
  if (scopeFilter && forceAttemptNumber === undefined) {
    try {
      // Conta TODOS os envios entregues do ciclo (avisos + ofertas), porque os
      // dois primeiros degraus são justamente os avisos genéricos.
      const { count } = await supabase
        .from("dunning_attempts")
        .select("id", { count: "exact", head: true })
        .eq("channel", "whatsapp")
        .eq("profile_user_id", profile.user_id)
        .eq(scopeFilter.col, scopeFilter.val)
        .not("message_sid", "is", null)
        // Degrau que a Twilio marcou como failed/undelivered (ex.: template ainda
        // pendente de aprovação no Meta) não queima a cota — pode ser reofertado.
        .eq("whatsapp_sent", true);

      const prevCount = count || 0;
      if (prevCount >= maxAttempts) {
        await supabase.from("dunning_attempts").insert({
          ...baseRecord,
          template_sid: DUNNING_CONTENT_SID,
          attempt_number: prevCount + 1,
          error_stage: "limit_reached",
          error_message: `Já enviados ${prevCount} WhatsApps neste ciclo (limite ${maxAttempts})`,
        });
        return { sent: false, skipped: "limit_reached", attemptNumber: prevCount };
      }
      attemptNumber = prevCount + 1;
    } catch (err) {
      console.warn("[dunning-whatsapp] erro contando tentativas:", err);
    }
  }

  // Tentativas 1..DUNNING_NOTICE_STEPS = aviso genérico; depois, escada de ofertas.
  const ladderIndex = attemptNumber - DUNNING_NOTICE_STEPS - 1;
  const ladderEntry = ladderIndex >= 0 ? (ladder[ladderIndex] || null) : null;
  const useOffer = !!ladderEntry?.sid;
  const contentSid = ladderEntry?.sid || DUNNING_CONTENT_SID;
  const tier: DunningOfferTier | "generic" = useOffer ? ladderEntry!.tier : "generic";

  const token = await ensurePortalToken(supabase, profile.user_id);
  if (!token) {
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      template_sid: contentSid,
      attempt_number: attemptNumber,
      error_stage: "token_missing",
      error_message: "Não foi possível garantir user_portal_tokens",
    });
    return { sent: false, skipped: "token_missing" };
  }

  // Templates de oferta são MARKETING: respeitam 08h–21h BRT.
  if (useOffer && !skipWindowCheck && !insideMarketingWindow()) {
    const executeAt = nextMarketingSlot();
    try {
      await supabase.from("scheduled_tasks").insert({
        user_id: profile.user_id,
        task_type: "dunning_offer_whatsapp",
        execute_at: executeAt.toISOString(),
        status: "pending",
        payload: {
          event_id: eventId,
          provider,
          invoice_id: invoiceId,
          subscription_id: subscriptionId,
          payment_id: paymentId,
          customer_id: customerId,
          attempt_number: attemptNumber,
          payment_method: paymentMethod,
        },
      });
    } catch (err) {
      console.error("[dunning-whatsapp] falha ao adiar envio:", err);
    }
    console.log(`[dunning-whatsapp] fora da janela marketing, adiado para ${executeAt.toISOString()}`);
    return { sent: false, skipped: "outside_marketing_window", tier, deferredTo: executeAt.toISOString() };
  }

  // Oferta: {{2}} é só a query string (a URL do botão já é /cancelar?{{2}}).
  // Genérico: {{2}} é a URL completa de retomada de pagamento.
  const link = useOffer
    ? `https://olaaura.com.br/cancelar?t=${token}&offer=${tier}`
    : `https://olaaura.com.br/pagamento?t=${token}`;
  const variables = {
    "1": firstName(profile.name),
    // Oferta: {{2}} é a query string (botão = /cancelar?{{2}}).
    // Genérico: {{2}} é só o token (botão = /pagamento?t={{2}}).
    "2": useOffer ? `t=${token}&offer=${tier}` : token,
  };

  try {
    const statusCallback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-twilio-recovery`;
    const result = await sendRecoveryTemplate(profile.phone, contentSid, variables, statusCallback);
    if (result.success) {
      await supabase.from("dunning_attempts").insert({
        ...baseRecord,
        template_sid: contentSid,
        attempt_number: attemptNumber,
        offer_tier: tier,
        link_generated: true,
        whatsapp_sent: true,
        message_sid: result.messageSid || null,
      });
      return { sent: true, attemptNumber, messageSid: result.messageSid, link, tier };
    }

    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      template_sid: contentSid,
      attempt_number: attemptNumber,
      offer_tier: tier,
      link_generated: true,
      error_stage: "twilio_send_failed",
      error_message: result.error || `HTTP ${result.status}`,
    });
    return { sent: false, error: result.error || `HTTP ${result.status}`, link, tier };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      template_sid: contentSid,
      attempt_number: attemptNumber,
      offer_tier: tier,
      link_generated: true,
      error_stage: "twilio_exception",
      error_message: msg,
    });
    return { sent: false, error: msg, link, tier };
  }
}

// ============================================================================
// MODO DEGRADADO (sem profile no banco)
// ============================================================================

export interface DegradedDunningParams {
  supabase: any;
  /** Telefone vindo do gateway (metadata Stripe / customer Asaas). */
  phone: string;
  name?: string | null;
  /** Link de retomada de pagamento já pronto (portal/fatura), de preferência curto. */
  link: string;
  eventId: string;
  provider: "stripe" | "asaas";
  invoiceId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  customerId?: string | null;
}

/**
 * Dispara o aviso genérico de falha de pagamento quando NÃO existe profile
 * (usuário pagou mas nunca foi provisionado, ou telefone divergente).
 * Sem profile não há portal token, então usamos o link do gateway direto e
 * só o template utility (avisos), nunca a escada de ofertas.
 * Teto: DUNNING_NOTICE_STEPS envios por ciclo, contados por telefone.
 */
export async function sendDunningWhatsAppDegraded(
  params: DegradedDunningParams,
): Promise<DunningWhatsAppResult> {
  const {
    supabase, phone, name = null, link, eventId, provider,
    invoiceId = null, subscriptionId = null, paymentId = null, customerId = null,
  } = params;

  const baseRecord: Record<string, any> = {
    event_id: eventId,
    profile_user_id: null,
    customer_id: customerId,
    invoice_id: invoiceId,
    subscription_id: subscriptionId,
    payment_id: paymentId,
    provider,
    channel: "whatsapp",
    phone_raw: phone,
    phone_resolved: phone,
    profile_found: false,
    template_sid: DUNNING_CONTENT_SID,
    offer_tier: "generic",
  };

  if (!phone) return { sent: false, skipped: "no_phone" };

  // Idempotência por evento + telefone.
  try {
    const { data: dup } = await supabase
      .from("dunning_attempts")
      .select("id, message_sid")
      .eq("event_id", eventId)
      .eq("channel", "whatsapp")
      .eq("phone_resolved", phone)
      .maybeSingle();
    if (dup) return { sent: false, skipped: "duplicate_event", messageSid: dup.message_sid };
  } catch (_) { /* segue */ }

  // Teto por ciclo (fatura → cobrança → assinatura → telefone).
  const scope = invoiceId
    ? { col: "invoice_id", val: invoiceId }
    : paymentId
    ? { col: "payment_id", val: paymentId }
    : subscriptionId
    ? { col: "subscription_id", val: subscriptionId }
    : { col: "phone_resolved", val: phone };

  let attemptNumber = 1;
  try {
    const { count } = await supabase
      .from("dunning_attempts")
      .select("id", { count: "exact", head: true })
      .eq("channel", "whatsapp")
      .eq("phone_resolved", phone)
      .eq(scope.col, scope.val)
      .eq("whatsapp_sent", true);
    const prev = count || 0;
    if (prev >= DUNNING_NOTICE_STEPS) {
      await supabase.from("dunning_attempts").insert({
        ...baseRecord,
        attempt_number: prev + 1,
        error_stage: "limit_reached",
        error_message: `Modo degradado: já enviados ${prev} avisos (limite ${DUNNING_NOTICE_STEPS})`,
      });
      return { sent: false, skipped: "limit_reached", attemptNumber: prev };
    }
    attemptNumber = prev + 1;
  } catch (err) {
    console.warn("[dunning-whatsapp/degraded] erro contando tentativas:", err);
  }

  // O botão do template já é `/pagamento?t={{2}}`, então {{2}} tem que ser um
  // token curto — não a URL do gateway (isso gerava 63027 na Twilio).
  // Sem profile não existe portal token: criamos um short_link e usamos o CÓDIGO
  // como token; `customer-portal` resolve códigos de short_link.
  const linkToken = await createDunningLinkToken(link, phone);
  if (!linkToken) {
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      attempt_number: attemptNumber,
      error_stage: "token_missing",
      error_message: "Modo degradado: falha ao criar short_link para o token do botão",
    });
    return { sent: false, skipped: "token_missing", link, tier: "generic" };
  }

  const variables = { "1": firstName(name), "2": linkToken };
  try {
    const statusCallback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-twilio-recovery`;
    const result = await sendRecoveryTemplate(phone, DUNNING_CONTENT_SID, variables, statusCallback);
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      attempt_number: attemptNumber,
      link_generated: true,
      whatsapp_sent: !!result.success,
      message_sid: result.messageSid || null,
      error_stage: result.success ? null : "twilio_send_failed",
      error_message: result.success ? null : (result.error || `HTTP ${result.status}`),
    });
    return result.success
      ? { sent: true, attemptNumber, messageSid: result.messageSid, link, tier: "generic" }
      : { sent: false, error: result.error || `HTTP ${result.status}`, link, tier: "generic" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      attempt_number: attemptNumber,
      link_generated: true,
      error_stage: "twilio_exception",
      error_message: msg,
    });
    return { sent: false, error: msg, link, tier: "generic" };
  }
}