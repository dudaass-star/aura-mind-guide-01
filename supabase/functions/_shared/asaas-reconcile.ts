// Reconciliação de pagamentos Asaas perdidos por webhook.
// Estratégia: em vez de duplicar a lógica de ativação, reenviamos o pagamento
// para o próprio webhook-asaas (fonte única de verdade de insert + ativação).
// Idempotente: se a linha já existe em asaas_payments, o webhook só atualiza.

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
const ASAAS_BASE_URL =
  ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

export async function asaasGetJson(path: string): Promise<Record<string, unknown> | null> {
  if (!ASAAS_API_KEY) return null;
  try {
    const resp = await fetch(`${ASAAS_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        access_token: ASAAS_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "Aura/1.0",
      },
    });
    if (!resp.ok) {
      console.warn(`[asaas-reconcile] GET ${path} → ${resp.status}`);
      return null;
    }
    return await resp.json().catch(() => null);
  } catch (e) {
    console.warn(`[asaas-reconcile] GET ${path} falhou:`, (e as Error).message);
    return null;
  }
}

/** Reenvia o pagamento pro webhook-asaas como PAYMENT_RECEIVED. */
export async function replayPaymentToWebhook(payment: Record<string, unknown>): Promise<boolean> {
  const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!token || !supabaseUrl) return false;
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/webhook-asaas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": token,
      },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment }),
    });
    if (!resp.ok) console.warn(`[asaas-reconcile] replay ${payment.id} → ${resp.status}`);
    return resp.ok;
  } catch (e) {
    console.warn(`[asaas-reconcile] replay ${payment.id} falhou:`, (e as Error).message);
    return false;
  }
}

/**
 * Busca pagamentos pagos na Asaas e reenvia ao webhook os que não existem em
 * asaas_payments. `filter` aceita customer / paymentDate[ge] etc.
 */
export async function reconcileOrphanPayments(
  supabase: any,
  filter: Record<string, string>,
): Promise<{ checked: number; recovered: string[] }> {
  const recovered: string[] = [];
  let checked = 0;
  for (const status of ["RECEIVED", "CONFIRMED"]) {
    const qs = new URLSearchParams({ ...filter, status, limit: "100" }).toString();
    const list = await asaasGetJson(`/payments?${qs}`);
    const items = (list?.data as Array<Record<string, unknown>>) || [];
    for (const p of items) {
      const id = p.id as string;
      if (!id) continue;
      checked++;
      const { data: existing } = await supabase
        .from("asaas_payments")
        .select("id, status")
        .eq("asaas_payment_id", id)
        .maybeSingle();
      if (existing) continue;
      const ok = await replayPaymentToWebhook(p);
      if (ok) {
        const { data: after } = await supabase
          .from("asaas_payments")
          .select("id")
          .eq("asaas_payment_id", id)
          .maybeSingle();
        if (after) recovered.push(id);
      }
    }
  }
  return { checked, recovered };
}
