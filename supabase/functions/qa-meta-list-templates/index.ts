const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  let waba = Deno.env.get('META_WHATSAPP_BUSINESS_ACCOUNT_ID');
  try {
    const body = await req.json();
    if (body?.waba) waba = String(body.waba);
  } catch (_) { /* sem body */ }
  const r = await fetch(
    `https://graph.facebook.com/v21.0/${waba}/message_templates?fields=name,language,status,category,components&limit=200`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json();
  const simplified = (j.data || []).map((t: any) => {
    const body = (t.components || []).find((c: any) => c.type === 'BODY');
    const text = body?.text || '';
    return {
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      body: text,
      numbered_vars: (text.match(/\{\{\d+\}\}/g) || []).length,
      empty_vars: (text.match(/\{\{\}\}/g) || []).length,
    };
  });
  return new Response(JSON.stringify(simplified, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});