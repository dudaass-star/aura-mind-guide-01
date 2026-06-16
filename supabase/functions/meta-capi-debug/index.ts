// Diagnóstico one-shot dos tokens Meta: META_ACCESS_TOKEN (Ads/CAPI) e META_WHATSAPP_ACCESS_TOKEN.
// Não loga o token; só metadata (app_id, scopes, expires_at, is_valid).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

async function inspect(token: string | undefined, label: string) {
  if (!token) return { label, present: false };
  const dbg = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
  );
  const dbgJson = await dbg.json();

  const me = await fetch(
    `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`,
  );
  const meJson = await me.json();

  return {
    label,
    present: true,
    token_length: token.length,
    debug_token: dbgJson,
    me: meJson,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Diagnóstico one-shot: retorna apenas metadata (sem expor token).
  // Será removido logo após o diagnóstico.

  const capi = await inspect(Deno.env.get("META_ACCESS_TOKEN"), "META_ACCESS_TOKEN (CAPI/Ads)");
  const wa = await inspect(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN"), "META_WHATSAPP_ACCESS_TOKEN");

  const sameApp =
    capi.debug_token?.data?.app_id &&
    wa.debug_token?.data?.app_id &&
    capi.debug_token.data.app_id === wa.debug_token.data.app_id;

  return new Response(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        capi_token: capi,
        whatsapp_token: wa,
        analysis: {
          same_app: sameApp,
          capi_valid: capi.debug_token?.data?.is_valid ?? null,
          capi_scopes: capi.debug_token?.data?.scopes ?? null,
          capi_expires_at: capi.debug_token?.data?.expires_at ?? null,
          capi_error: capi.debug_token?.data?.error ?? null,
          wa_valid: wa.debug_token?.data?.is_valid ?? null,
        },
      },
      null,
      2,
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});