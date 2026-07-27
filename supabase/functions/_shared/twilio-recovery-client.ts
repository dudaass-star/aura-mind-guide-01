/**
 * Cliente Twilio dedicado para a SUBACCOUNT de recuperação de carrinho abandonado.
 *
 * - Não usa o gateway do connector Twilio nem o número da Aura.
 * - Autentica direto via Basic Auth (AccountSid + AuthToken da subaccount).
 * - Envia apenas templates aprovados (Content API: ContentSid + ContentVariables).
 * - Retry automático em erros transitórios (429 / 5xx / timeout).
 */

import { normalizeBrazilianPhone } from "./zapi-client.ts";

export interface TwilioRecoverySendResult {
  success: boolean;
  messageSid?: string;
  status?: number;
  to?: string;
  error?: string;
  response?: unknown;
}

const TRANSIENT_PATTERNS = [
  /429/i, /rate.?limit/i, /too many/i,
  /500/i, /502/i, /503/i, /504/i,
  /timeout/i, /timed.?out/i, /econnreset/i, /econnrefused/i,
  /network/i, /fetch.?failed/i,
];

function isTransient(err?: string, status?: number): boolean {
  if (status && (status === 429 || status >= 500)) return true;
  if (!err) return false;
  return TRANSIENT_PATTERNS.some(p => p.test(err));
}

function getCreds() {
  const sid = Deno.env.get("TWILIO_RECOVERY_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_RECOVERY_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_RECOVERY_FROM");
  if (!sid || !token || !from) {
    throw new Error(
      "Faltam secrets da subaccount: TWILIO_RECOVERY_ACCOUNT_SID / TWILIO_RECOVERY_AUTH_TOKEN / TWILIO_RECOVERY_FROM",
    );
  }
  // Garante prefixo whatsapp: no número From
  const fromFormatted = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  return { sid, token, from: fromFormatted };
}

function formatTo(phone: string): string {
  // Normaliza BR cru (ex: 51981519708) para E.164 antes de enviar ao WhatsApp Twilio.
  const digits = normalizeBrazilianPhone(phone);
  return `whatsapp:+${digits}`;
}

async function twilioRequest(path: string): Promise<{ ok: boolean; status: number; json: any }> {
  const { sid, token } = getCreds();
  const auth = btoa(`${sid}:${token}`);
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    headers: { "Authorization": `Basic ${auth}` },
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, json };
}

async function postOnce(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>,
  statusCallback?: string,
): Promise<TwilioRecoverySendResult> {
  const { sid, token, from } = getCreds();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = btoa(`${sid}:${token}`);

  const formattedTo = formatTo(to);
  const body = new URLSearchParams({
    To: formattedTo,
    From: from,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(contentVariables),
  });
  // StatusCallback: sem ele o status final (failed/undelivered) nunca chega e
  // o log fica cego — a Twilio só devolve `queued` na resposta do POST.
  if (statusCallback) body.set("StatusCallback", statusCallback);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const errMsg = json?.message || `HTTP ${resp.status}`;
      return { success: false, status: resp.status, to: formattedTo, error: errMsg, response: json };
    }

    return { success: true, status: resp.status, to: formattedTo, messageSid: json?.sid, response: json };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getRecoveryMessage(messageSid: string): Promise<TwilioRecoverySendResult> {
  const result = await twilioRequest(`/Messages/${encodeURIComponent(messageSid)}.json`);
  const json = result.json;
  return {
    success: result.ok,
    status: result.status,
    messageSid: json?.sid,
    to: json?.to,
    error: result.ok ? (json?.error_message || undefined) : (json?.message || `HTTP ${result.status}`),
    response: json,
  };
}

export async function listRecoveryMessages(phone: string, limit = 10): Promise<TwilioRecoverySendResult> {
  const params = new URLSearchParams({ Limit: String(limit), To: formatTo(phone) });
  const result = await twilioRequest(`/Messages.json?${params.toString()}`);
  return {
    success: result.ok,
    status: result.status,
    to: formatTo(phone),
    error: result.ok ? undefined : (result.json?.message || `HTTP ${result.status}`),
    response: result.json,
  };
}

export async function getRecoveryAlerts(messageSid: string): Promise<TwilioRecoverySendResult> {
  // Monitor API vive em monitor.twilio.com, não em api.twilio.com
  const { sid, token } = getCreds();
  const auth = btoa(`${sid}:${token}`);
  const url = `https://monitor.twilio.com/v1/Alerts?ResourceSid=${encodeURIComponent(messageSid)}&PageSize=10`;
  const resp = await fetch(url, { headers: { "Authorization": `Basic ${auth}` } });
  const json = await resp.json().catch(() => ({}));
  return {
    success: resp.ok,
    status: resp.status,
    messageSid,
    error: resp.ok ? undefined : (json?.message || `HTTP ${resp.status}`),
    response: json,
  };
}

/**
 * Envia um template aprovado via subaccount Twilio.
 * Faz 1 retry em erros transitórios (2s de espera).
 */
export async function sendRecoveryTemplate(
  phone: string,
  contentSid: string,
  contentVariables: Record<string, string>,
  statusCallback?: string,
): Promise<TwilioRecoverySendResult> {
  const first = await postOnce(phone, contentSid, contentVariables, statusCallback);
  if (first.success) return first;

  if (isTransient(first.error, first.status)) {
    console.warn(
      `⚠️ [TwilioRecovery] Erro transitório (${first.status}): ${first.error}. Retry em 2s...`,
    );
    await new Promise(r => setTimeout(r, 2000));
    const retry = await postOnce(phone, contentSid, contentVariables, statusCallback);
    if (retry.success) {
      console.log(`✅ [TwilioRecovery] Retry OK → ${retry.messageSid}`);
    } else {
      console.error(`❌ [TwilioRecovery] Retry falhou: ${retry.error}`);
    }
    return retry;
  }

  return first;
}
