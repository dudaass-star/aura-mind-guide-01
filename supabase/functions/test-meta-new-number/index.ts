// Edge function isolada para testar o novo número Meta aprovado
// WABA 4389879528007597 / Phone Number ID 1102172772986795 (+1 555-958-6099)
// Whitelist: SÓ envia para o Eduardo (5551981519708). Qualquer outro destinatário => 403.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const NEW_PHONE_NUMBER_ID = '1102172772986795';
const ALLOWED_TO = '5551981519708';
const META_GRAPH_VERSION = 'v21.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
    if (!token) {
      return json({ error: 'META_WHATSAPP_ACCESS_TOKEN ausente' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? 'template';
    const to = String(body.to ?? ALLOWED_TO).replace(/\D/g, '');

    if (to !== ALLOWED_TO) {
      return json({ error: `Destinatário bloqueado. Apenas ${ALLOWED_TO} é permitido neste teste.`, attempted: to }, 403);
    }

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${NEW_PHONE_NUMBER_ID}/messages`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    let payload: Record<string, unknown>;

    if (mode === 'template') {
      const templateName = body.template ?? 'cheking_7dias';
      const lang = body.language ?? 'pt_BR';
      const components = body.components ?? [
        {
          type: 'body',
          parameters: [{ type: 'text', text: body.name ?? 'Eduardo' }],
        },
      ];
      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: lang },
          components,
        },
      };
    } else if (mode === 'freetext') {
      const text = body.text ?? 'teste do novo número Meta';
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      };
    } else {
      return json({ error: `mode inválido: ${mode}. Use "template" ou "freetext".` }, 400);
    }

    console.log('🧪 [test-meta-new-number] enviando', { mode, to: to.substring(0, 4) + '***', phoneNumberId: NEW_PHONE_NUMBER_ID, payload });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    console.log('🧪 [test-meta-new-number] resposta Meta', { status: res.status, data });

    return json({
      ok: res.ok,
      status: res.status,
      meta_response: data,
      sent_payload: payload,
      phone_number_id: NEW_PHONE_NUMBER_ID,
    }, res.ok ? 200 : 502);
  } catch (e) {
    console.error('🧪 [test-meta-new-number] erro', e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}