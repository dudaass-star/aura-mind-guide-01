// API de Conversão do ChatGPT Ads (OpenAI).
// Espelha os eventos de funil pelo servidor, com o mesmo event_id do navegador
// quando existir, para que a OpenAI não conte a mesma conversão duas vezes.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OAI_PIXEL_ID = Deno.env.get("OPENAI_ADS_PIXEL_ID") || "4DosRHCmjrnJkM9nitjuu5";
const OAI_EVENTS_URL = "https://bzr.openai.com/v1/events";

interface OaiEventRequest {
  event_type: string;                     // ex: "purchase", "checkout_started"
  event_id?: string;                      // dedupe navegador x servidor
  source_url?: string;
  data?: Record<string, unknown>;         // ex: { type: "contents", value, currency }
  source?: string;                        // origem interna, só para log
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = (await req.json()) as OaiEventRequest;
    const eventType = (body?.event_type || "").trim();
    if (!eventType) return json({ error: "event_type obrigatório" }, 400);

    const apiKey = Deno.env.get("OPENAI_ADS_API_KEY");
    if (!apiKey) {
      // Sem chave configurada a função apenas registra e sai — nunca quebra o fluxo.
      console.warn(`⚠️ OPENAI_ADS_API_KEY ausente; evento ${eventType} não enviado`);
      return json({ skipped: true, reason: "missing_api_key" });
    }

    const eventId = body.event_id || crypto.randomUUID();
    const payload = {
      validate_only: false,
      events: [
        {
          id: eventId,
          type: eventType,
          timestamp_ms: Date.now(),
          source_url: body.source_url || "https://olaaura.com.br/obrigado",
          action_source: "web",
          data: { type: "contents", ...(body.data || {}) },
        },
      ],
    };

    const res = await fetch(`${OAI_EVENTS_URL}?pid=${OAI_PIXEL_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`❌ OpenAI CAPI ${eventType} (${body.source || "n/a"}) HTTP ${res.status}: ${text}`);
      return json({ success: false, status: res.status, response: text }, 200);
    }

    console.log(`✅ OpenAI CAPI ${eventType} enviado (id=${eventId}, origem=${body.source || "n/a"})`);
    return json({ success: true, event_id: eventId, response: text });
  } catch (error) {
    console.error("❌ Erro no openai-capi:", error);
    return json({ success: false, error: String(error) }, 200);
  }
});
