/**
 * Helper de dunning via WhatsApp (templates Twilio aprovados).
 *
 * - Usa a SUBACCOUNT de recuperação (mesma do carrinho abandonado),
 *   não o número da Aura.
 * - Escada de ofertas por tentativa (attemptNumber):
 *     1 → dunning_offer_30   (30% off por 3 meses)
 *     2 → dunning_offer_lite (R$ 19,90/mês)
 *     3 → dunning_offer_base (R$ 9,90/mês)
 *   Cada template de oferta: {{1}} = primeiro nome,
 *   {{2}} = query string do botão (`t=<token>&offer=<tier>`),
 *   URL do botão = https://olaaura.com.br/cancelar?{{2}}
 * - Template genérico (fallback): HXaf4af1e1f5d4cf40b6fff6b5b68df29a
 *   {{1}} = primeiro nome, {{2}} = URL completa /pagamento?t=<token>
 * - Idempotência: dedup por (profile_user_id, event_id, channel='whatsapp').
 * - Templates de oferta são categoria MARKETING no Meta → só disparam entre
 *   08h e 21h BRT; fora da janela o envio é adiado via scheduled_tasks.
 */

import { sendRecoveryTemplate } from "./twilio-recovery-client.ts";

/** Template genérico de falha de pagamento (utility, sem restrição de horário). */
export const DUNNING_CONTENT_SID = "HXaf4af1e1f5d4cf40b6fff6b5b68df29a";
export const DUNNING_MAX_ATTEMPTS = 3;

export type DunningOfferTier = "discount_30" | "lite" | "base";

interface OfferTemplate {
  tier: DunningOfferTier;
  /** ContentSid aprovado no Twilio; null enquanto o template não existir. */
  sid: string | null;
}

/** Escada por tentativa: índice 0 = 1ª tentativa. */
export const DUNNING_OFFER_LADDER: OfferTemplate[] = [
  { tier: "discount_30", sid: "HX50cb75b6bb3cd9ae56ef2d9c6adc4781" },
  { tier: "lite", sid: "HX18e81fa401b8487c360f085e9b83630f" },
  { tier: "base", sid: "HX65a53c5b0bb1dd7868146ee118c125fb" },
];

/** SIDs válidos da escada — a cota conta só estes, nunca o template genérico. */
const LADDER_SIDS = DUNNING_OFFER_LADDER
  .map((t) => t.sid)
  .filter((s): s is string => !!s);

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
    skipWindowCheck = false, forceAttemptNumber,
  } = params;

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

  // Limite de 2 envios bem-sucedidos por subscription/payment.
  const scopeFilter = subscriptionId
    ? { col: "subscription_id", val: subscriptionId }
    : paymentId
    ? { col: "payment_id", val: paymentId }
    : null;

  let attemptNumber = forceAttemptNumber ?? 1;
  if (scopeFilter && forceAttemptNumber === undefined) {
    try {
      const { count } = await supabase
        .from("dunning_attempts")
        .select("id", { count: "exact", head: true })
        .eq("channel", "whatsapp")
        .eq("profile_user_id", profile.user_id)
        .eq(scopeFilter.col, scopeFilter.val)
        .not("message_sid", "is", null);

      const prevCount = count || 0;
      if (prevCount >= DUNNING_MAX_ATTEMPTS) {
        await supabase.from("dunning_attempts").insert({
          ...baseRecord,
          template_sid: DUNNING_CONTENT_SID,
          attempt_number: prevCount + 1,
          error_stage: "limit_reached",
          error_message: `Já enviados ${prevCount} WhatsApps neste ciclo (limite ${DUNNING_MAX_ATTEMPTS})`,
        });
        return { sent: false, skipped: "limit_reached", attemptNumber: prevCount };
      }
      attemptNumber = prevCount + 1;
    } catch (err) {
      console.warn("[dunning-whatsapp] erro contando tentativas:", err);
    }
  }

  // Escolhe o tier da escada; sem SID aprovado, cai no template genérico.
  const ladderEntry = DUNNING_OFFER_LADDER[attemptNumber - 1] || null;
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
    "2": useOffer ? `t=${token}&offer=${tier}` : link,
  };

  try {
    const result = await sendRecoveryTemplate(profile.phone, contentSid, variables);
    if (result.success) {
      await supabase.from("dunning_attempts").insert({
        ...baseRecord,
        template_sid: contentSid,
        attempt_number: attemptNumber,
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
      link_generated: true,
      error_stage: "twilio_exception",
      error_message: msg,
    });
    return { sent: false, error: msg, link, tier };
  }
}