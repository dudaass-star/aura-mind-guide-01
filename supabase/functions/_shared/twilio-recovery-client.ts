/**
 * Cliente Twilio dedicado para a SUBACCOUNT de recuperação de carrinho abandonado.
 *
 * - Não usa o gateway do connector Twilio nem o número da Aura.
 * - Autentica direto via Basic Auth (AccountSid + AuthToken da subaccount).
 * - Envia apenas templates aprovados (Content API: ContentSid + ContentVariables).
 * - Retry automático em erros transitórios (429 / 5xx / timeout).
 */

export interface TwilioRecoverySendResult {
  success: boolean;
  messageSid?: string;
  status?: number;
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
  // Espera E.164 sem prefixo (ex: 5511999998888) ou já com +; normaliza para whatsapp:+...
  const digits = phone.replace(/\D/g, "");
  return `whatsapp:+${digits}`;
}

async function postOnce(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>,
): Promise<TwilioRecoverySendResult> {
  const { sid, token, from } = getCreds();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = btoa(`${sid}:${token}`);

  const body = new URLSearchParams({
    To: formatTo(to),
    From: from,
    ContentSid: contentSid,
    ContentVariables: JSON.stringify(contentVariables),
  });

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
      return { success: false, status: resp.status, error: errMsg, response: json };
    }

    return { success: true, status: resp.status, messageSid: json?.sid, response: json };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Envia um template aprovado via subaccount Twilio.
 * Faz 1 retry em erros transitórios (2s de espera).
 */
export async function sendRecoveryTemplate(
  phone: string,
  contentSid: string,
  contentVariables: Record<string, string>,
): Promise<TwilioRecoverySendResult> {
  const first = await postOnce(phone, contentSid, contentVariables);
  if (first.success) return first;

  if (isTransient(first.error, first.status)) {
    console.warn(
      `⚠️ [TwilioRecovery] Erro transitório (${first.status}): ${first.error}. Retry em 2s...`,
    );
    await new Promise(r => setTimeout(r, 2000));
    const retry = await postOnce(phone, contentSid, contentVariables);
    if (retry.success) {
      console.log(`✅ [TwilioRecovery] Retry OK → ${retry.messageSid}`);
    } else {
      console.error(`❌ [TwilioRecovery] Retry falhou: ${retry.error}`);
    }
    return retry;
  }

  return first;
}
