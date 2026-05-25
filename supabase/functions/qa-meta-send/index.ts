// QA: envia mensagem de teste via Meta WhatsApp Cloud API
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  const to = new URL(req.url).searchParams.get('to') ?? '5551981519708';
  const body = new URL(req.url).searchParams.get('body') ?? 'Teste Aura via Meta Cloud API ✅';

  if (!token || !phoneId) {
    return new Response(JSON.stringify({ error: 'missing META env', hasToken: !!token, hasPhoneId: !!phoneId }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1) Identifica o número da WABA
  const meRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meData = await meRes.json();

  // 2) Tenta enviar texto livre
  const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  const sendData = await sendRes.json();

  return new Response(JSON.stringify({
    phoneNumberInfo: meData,
    sendStatus: sendRes.status,
    sendResponse: sendData,
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});