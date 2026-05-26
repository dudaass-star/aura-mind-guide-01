// Diagnóstico Meta: inspeciona token, WABA, app e subscriptions de webhook.
// Opcionalmente tenta inscrever a WABA no app com o campo "messages".
//
// Uso:
//   GET  /qa-meta-diagnose                -> diagnóstico read-only
//   GET  /qa-meta-diagnose?subscribe=1    -> tenta inscrever a WABA no app

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const V = 'v21.0';

async function gget(path: string, token: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`https://graph.facebook.com/${V}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function gpost(path: string, token: string, payload?: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const r = await fetch(`https://graph.facebook.com/${V}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function gpostForm(path: string, token: string, payload: Record<string, string>): Promise<{ status: number; body: any }> {
  const r = await fetch(`https://graph.facebook.com/${V}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) {
    return new Response(JSON.stringify({ error: 'missing META env', hasToken: !!token, hasPhoneId: !!phoneId }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const shouldSubscribe = url.searchParams.get('subscribe') === '1';
  const shouldConfigureWebhook = url.searchParams.get('configureWebhook') === '1';
  const fields = url.searchParams.get('fields') || 'messages,message_template_status_update,account_update';
  const wabaOverride = url.searchParams.get('waba') || null;

  // 1) Inspeciona o token
  const debugToken = await gget(`debug_token?input_token=${token}`, token);

  // 2) Inspeciona o número e descobre a WABA dona dele
  const phoneInfo = await gget(
    `${phoneId}?fields=display_phone_number,verified_name,id,quality_rating,code_verification_status,platform_type,name_status,new_name_status,status,throughput`,
    token,
  );

  const wabaId =
    wabaOverride ||
    phoneInfo.body?.whatsapp_business_account?.id ||
    debugToken.body?.data?.granular_scopes?.find((s: any) => s.scope === 'whatsapp_business_messaging')?.target_ids?.[0] ||
    null;

  // 3) Lista as subscrições da WABA (apps inscritos e campos)
  let wabaSubs: any = null;
  let wabaPhoneNumbers: any = null;
  if (wabaId) {
    wabaSubs = await gget(`${wabaId}/subscribed_apps`, token);
    wabaPhoneNumbers = await gget(
      `${wabaId}/phone_numbers?fields=display_phone_number,verified_name,id,quality_rating,code_verification_status,platform_type,name_status,new_name_status,status,throughput`,
      token,
    );
  }

  // 4) Tenta descobrir o app id do token
  const appId = debugToken.body?.data?.app_id || null;

  // 4.1) Inspeciona/configura a assinatura de Webhooks do APP para o objeto WhatsApp.
  // Importante: assinar a WABA no app não basta se o app não tiver callback
  // configurado para `whatsapp_business_account` com o campo `messages`.
  const appSecret = Deno.env.get('META_WHATSAPP_APP_SECRET') || Deno.env.get('INSTAGRAM_APP_SECRET');
  const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const callbackUrl = url.searchParams.get('callbackUrl') || (supabaseUrl ? `${supabaseUrl}/functions/v1/webhook-meta` : null);
  const appAccessToken = appId && appSecret ? `${appId}|${appSecret}` : null;

  let appSubscriptions: any = null;
  let configureWebhookResult: any = null;
  if (appId && appAccessToken) {
    appSubscriptions = await gget(`${appId}/subscriptions`, appAccessToken);
    if (shouldConfigureWebhook && callbackUrl && verifyToken) {
      configureWebhookResult = await gpostForm(`${appId}/subscriptions`, appAccessToken, {
        object: 'whatsapp_business_account',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields,
        include_values: 'true',
      });
      appSubscriptions = await gget(`${appId}/subscriptions`, appAccessToken);
    }
  }

  // 5) Se pediram, tenta inscrever a WABA no app dono do token
  let subscribeResult: any = null;
  if (shouldSubscribe && wabaId) {
    // Endpoint correto para WhatsApp Cloud API:
    //   POST /{WABA_ID}/subscribed_apps  -> usa o app do token automaticamente
    // Tentamos primeiro sem subscribed_fields (default = todos os campos do app),
    // e depois com subscribed_fields explícito se o primeiro falhar.
    const first = await gpost(`${wabaId}/subscribed_apps`, token);
    let second: any = null;
    if (first.status >= 400) {
      second = await gpost(`${wabaId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`, token);
    }
    subscribeResult = { first, second };
    // Recarrega a lista após tentativa
    wabaSubs = await gget(`${wabaId}/subscribed_apps`, token);
  }

  return new Response(JSON.stringify({
    summary: {
      phoneNumberId: phoneId,
      wabaId,
      appId,
      displayPhoneNumber: phoneInfo.body?.display_phone_number,
      verifiedName: phoneInfo.body?.verified_name,
      tokenIsValid: debugToken.body?.data?.is_valid,
      tokenType: debugToken.body?.data?.type,
      tokenExpiresAt: debugToken.body?.data?.expires_at,
      tokenDataExpiresAt: debugToken.body?.data?.data_access_expires_at,
      tokenScopes: debugToken.body?.data?.scopes,
      tokenGranular: debugToken.body?.data?.granular_scopes,
      callbackUrl,
      hasAppSecret: !!appSecret,
      hasVerifyToken: !!verifyToken,
    },
    raw: {
      debugToken: debugToken.body,
      phoneInfo: phoneInfo.body,
      wabaPhoneNumbers: wabaPhoneNumbers?.body,
      wabaSubs: wabaSubs?.body,
      appSubscriptions: appSubscriptions?.body,
    },
    subscribeAttempted: shouldSubscribe,
    subscribeResult,
    configureWebhookAttempted: shouldConfigureWebhook,
    configureWebhookResult,
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});