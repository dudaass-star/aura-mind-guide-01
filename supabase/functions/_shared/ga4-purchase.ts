// Envio do evento `purchase` do GA4 (Measurement Protocol) a partir dos webhooks.
// Fire-and-forget: dorme silenciosamente se GA4_API_SECRET não estiver configurado
// e nunca lança — falha de tracking não pode bloquear ativação de assinatura.
export async function sendGa4Purchase(params: {
  clientId?: string;
  email?: string;
  transactionId: string;
  value: number;
  plan: string;
  planName: string;
  eventSourceUrl?: string;
  source?: string;
  /** Nome do evento GA4. Default `purchase`; usamos `subscribe` na cobrança cheia. */
  eventName?: string;
}): Promise<void> {
  const tag = params.source ? `[${params.source}]` : "[ga4]";
  const eventName = params.eventName || "purchase";
  try {
    const measurementId = Deno.env.get("GA4_MEASUREMENT_ID");
    const apiSecret = Deno.env.get("GA4_API_SECRET");
    if (!measurementId || !apiSecret) {
      console.log(`${tag} ℹ️ GA4 purchase ignorado (medição não configurada)`);
      return;
    }

    let clientId = params.clientId;
    if (!clientId && params.email) {
      // client_id sintético determinístico a partir do email (atribuição parcial).
      const enc = new TextEncoder().encode(params.email.toLowerCase().trim());
      const hash = await crypto.subtle.digest("SHA-256", enc);
      const hex = Array.from(new Uint8Array(hash))
        .slice(0, 8)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      clientId = `synth.${parseInt(hex.slice(0, 8), 16)}.${parseInt(hex.slice(8, 16), 16)}`;
    }
    if (!clientId) {
      console.warn(`${tag} ⚠️ GA4 purchase sem client_id nem email`);
      return;
    }

    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          events: [{
            name: eventName,
            params: {
              transaction_id: params.transactionId,
              value: params.value,
              currency: "BRL",
              items: [{
                item_id: params.plan,
                item_name: params.planName,
                price: params.value,
                quantity: 1,
              }],
              ...(params.eventSourceUrl && { page_location: params.eventSourceUrl }),
            },
          }],
        }),
      },
    );
    if (!res.ok) {
      console.warn(`${tag} ⚠️ GA4 ${eventName} non-2xx:`, res.status, await res.text().catch(() => ""));
    } else {
      console.log(`${tag} ✅ GA4 ${eventName} enviado (${params.transactionId}, R$ ${params.value})`);
    }
  } catch (e) {
    console.warn(`${tag} ⚠️ GA4 ${eventName} falhou (non-blocking):`, (e as Error)?.message);
  }
}
