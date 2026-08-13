// Disparo do evento de conversão do ChatGPT Ads (OpenAI) a partir dos webhooks.
// Fire-and-forget: qualquer falha aqui nunca pode bloquear a ativação da assinatura.
export async function sendOpenAiConversion(params: {
  eventType: string;                 // ex: "purchase"
  eventId: string;                   // mesmo id do evento equivalente no Meta
  value?: number;
  currency?: string;
  contentName?: string;
  sourceUrl?: string;
  source?: string;                   // nome do webhook, só para log
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;

    await fetch(`${supabaseUrl}/functions/v1/openai-capi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        event_type: params.eventType,
        event_id: params.eventId,
        source_url: params.sourceUrl || "https://olaaura.com.br/obrigado",
        source: params.source,
        data: {
          type: "contents",
          ...(params.value !== undefined && { value: params.value }),
          ...(params.currency && { currency: params.currency }),
          ...(params.contentName && { content_name: params.contentName }),
        },
      }),
    });
  } catch (e) {
    console.error("⚠️ Falha ao enviar conversão OpenAI (ignorado):", e);
  }
}
