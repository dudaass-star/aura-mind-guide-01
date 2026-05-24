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

const TEMPLATE_15MIN = "HX988544a4c9dd6f79db19dc1427331f02";
const TEMPLATE_24H = "HX8d40a27b45761678a88c53ec9aa58b32";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const phone: string = body.phone ?? "51981519708";
    const name: string = body.name ?? "Gustavo";
    const stage: string = body.stage ?? "15min";
    // variant: "1var" (default), "empty", "2vars", "0vars" (manda {} mesmo)
    const variant: string = body.variant ?? "1var";

    const contentSid = stage === "24h" ? TEMPLATE_24H : TEMPLATE_15MIN;

    let vars: Record<string, string>;
    switch (variant) {
      case "empty":
      case "0vars":
        vars = {};
        break;
      case "2vars":
        vars = { "1": name, "2": "https://olaaura.com.br/v2/checkout" };
        break;
      case "3vars":
        vars = { "1": name, "2": "https://olaaura.com.br/v2/checkout", "3": "extra" };
        break;
      default:
        vars = { "1": name };
    }

    console.log(`🧪 [TEST-WA-RECOVERY] phone=${phone} stage=${stage} variant=${variant} vars=${JSON.stringify(vars)}`);

    const result = await sendRecoveryTemplate(phone, contentSid, vars);

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