/**
 * Endpoint de teste — dispara o template de recuperação (15min ou 24h)
 * para um número arbitrário via subaccount Twilio.
 *
 * Uso:
 *   POST /test-whatsapp-recovery
 *   { "phone": "51981519708", "name": "Gustavo", "stage": "15min" | "24h" }
 */

import { sendRecoveryTemplate } from "../_shared/twilio-recovery-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEMPLATE_15MIN = "HX7ae71f9002839ec0ecdc58f6aa067a8a";
const TEMPLATE_24H = "HXb34b27fda2f45a0c10fc19960bac61c1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const phone: string = body.phone ?? "51981519708";
    const name: string = body.name ?? "Gustavo";
    const stage: string = body.stage ?? "15min";

    const contentSid = stage === "24h" ? TEMPLATE_24H : TEMPLATE_15MIN;

    console.log(`🧪 [TEST-WA-RECOVERY] phone=${phone} stage=${stage} sid=${contentSid}`);

    const result = await sendRecoveryTemplate(phone, contentSid, { "1": name });

    console.log(`📤 [TEST-WA-RECOVERY] result:`, result);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ [TEST-WA-RECOVERY] erro:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});