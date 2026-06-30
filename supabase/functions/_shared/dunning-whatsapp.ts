/**
 * Helper de dunning via WhatsApp (template Twilio aprovado).
 *
 * - Usa a SUBACCOUNT de recuperação (mesma do carrinho abandonado),
 *   não o número da Aura.
 * - Template: HXaf4af1e1f5d4cf40b6fff6b5b68df29a
 *   {{1}} = primeiro nome
 *   {{2}} = link de retomada (https://olaaura.com.br/pagamento?t=<token>)
 * - Limite: até 2 envios por user/subscription (casado com Smart Retries Stripe
 *   e retries do PIX Automático Bacen / Asaas).
 * - Idempotência: dedup por (profile_user_id, event_id, channel='whatsapp').
 * - NÃO respeita quiet hours (mensagem transacional/utility).
 */

import { sendRecoveryTemplate } from "./twilio-recovery-client.ts";

export const DUNNING_CONTENT_SID = "HXaf4af1e1f5d4cf40b6fff6b5b68df29a";
export const DUNNING_MAX_ATTEMPTS = 2;

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
}

export interface DunningWhatsAppResult {
  sent: boolean;
  skipped?: string;
  attemptNumber?: number;
  messageSid?: string;
  error?: string;
  link?: string;
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
    template_sid: DUNNING_CONTENT_SID,
    phone_raw: profile.phone || null,
    phone_resolved: profile.phone || null,
    profile_found: true,
  };

  // Sem telefone → não dá pra enviar WhatsApp; loga skip e segue.
  if (!profile.phone) {
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
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

  let attemptNumber = 1;
  if (scopeFilter) {
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

  const token = await ensurePortalToken(supabase, profile.user_id);
  if (!token) {
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      attempt_number: attemptNumber,
      error_stage: "token_missing",
      error_message: "Não foi possível garantir user_portal_tokens",
    });
    return { sent: false, skipped: "token_missing" };
  }

  const link = `https://olaaura.com.br/pagamento?t=${token}`;
  const variables = {
    "1": firstName(profile.name),
    "2": link,
  };

  try {
    const result = await sendRecoveryTemplate(profile.phone, DUNNING_CONTENT_SID, variables);
    if (result.success) {
      await supabase.from("dunning_attempts").insert({
        ...baseRecord,
        attempt_number: attemptNumber,
        link_generated: true,
        whatsapp_sent: true,
        message_sid: result.messageSid || null,
      });
      return { sent: true, attemptNumber, messageSid: result.messageSid, link };
    }

    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      attempt_number: attemptNumber,
      link_generated: true,
      error_stage: "twilio_send_failed",
      error_message: result.error || `HTTP ${result.status}`,
    });
    return { sent: false, error: result.error || `HTTP ${result.status}`, link };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("dunning_attempts").insert({
      ...baseRecord,
      attempt_number: attemptNumber,
      link_generated: true,
      error_stage: "twilio_exception",
      error_message: msg,
    });
    return { sent: false, error: msg, link };
  }
}