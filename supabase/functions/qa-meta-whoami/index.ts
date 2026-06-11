const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN')!;
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')!;
  const wabaEnv = Deno.env.get('META_WHATSAPP_BUSINESS_ACCOUNT_ID')!;

  // 1. quem é o phone_number_id (display + WABA real dono)
  const phoneRes = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,verified_name,id,whatsapp_business_account`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const phoneJson = await phoneRes.json();

  // 2. quem é o WABA do env (nome)
  const wabaRes = await fetch(
    `https://graph.facebook.com/v21.0/${wabaEnv}?fields=name,id,owner_business_info`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const wabaJson = await wabaRes.json();

  return new Response(JSON.stringify({
    env_phone_number_id: phoneId,
    env_waba_id: wabaEnv,
    phone_info: phoneJson,
    waba_info: wabaJson,
  }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});