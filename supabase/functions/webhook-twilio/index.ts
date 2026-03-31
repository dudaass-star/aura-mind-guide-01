/**
 * Webhook Twilio — Recebe mensagens WhatsApp via Twilio/API Oficial
 * 
 * Normaliza o payload Twilio para o formato esperado pelo process-webhook-message
 * e encaminha como fire-and-forget (mesmo padrão do webhook-zapi).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Extrai número limpo do formato Twilio "whatsapp:+5511999998888"
 */
function extractPhone(twilioFrom: string): string {
  return twilioFrom.replace('whatsapp:', '').replace('+', '').trim();
}

/**
 * Valida que o telefone tem formato razoável
 */
function isValidPhone(phone: string): boolean {
  return /^\d{10,15}$/.test(phone);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========================================================================
    // PARSE TWILIO PAYLOAD (application/x-www-form-urlencoded)
    // ========================================================================
    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      for (const [key, value] of params.entries()) {
        body[key] = value;
      }
    } else if (contentType.includes('application/json')) {
      body = await req.json();
    } else {
      // Try form-urlencoded as default (Twilio standard)
      const formData = await req.text();
      const params = new URLSearchParams(formData);
      for (const [key, value] of params.entries()) {
        body[key] = value;
      }
    }

    console.log('📩 Twilio Webhook received:', JSON.stringify(body, null, 2));

    // ========================================================================
    // EXTRACT FIELDS
    // ========================================================================
    const from = body.From || '';          // "whatsapp:+5511999998888"
    const messageBody = body.Body || '';   // Text content
    const messageSid = body.MessageSid || body.SmsSid || '';
    const numMedia = parseInt(body.NumMedia || '0', 10);
    const mediaUrl0 = body.MediaUrl0 || '';
    const mediaType0 = body.MediaContentType0 || '';

    // ========================================================================
    // EARLY EXITS
    // ========================================================================
    if (!from) {
      console.log('⏭️ Missing From field');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing_from' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanPhone = extractPhone(from);

    if (!isValidPhone(cleanPhone)) {
      console.warn('⚠️ Invalid phone format:', cleanPhone.substring(0, 4) + '***');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'invalid_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect audio and image
    const hasAudio = numMedia > 0 && mediaType0.startsWith('audio/');
    const hasImage = numMedia > 0 && mediaType0.startsWith('image/');
    const audioUrl = hasAudio ? mediaUrl0 : undefined;

    // Filter empty events (no text, no media)
    if (!messageBody && !hasAudio && !hasImage) {
      console.log('⏭️ Ignoring event with no content (status callback?)');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'no_content' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // DEDUPLICATION
    // ========================================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (messageSid) {
      const { error: dedupError } = await supabase
        .from('zapi_message_dedup')
        .insert({ message_id: messageSid, phone: cleanPhone });

      if (dedupError) {
        console.log(`⏭️ Already processed messageSid: ${messageSid}`);
        return new Response(JSON.stringify({ status: 'ignored', reason: 'duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`✅ New message registered: ${messageSid}`);
    }

    // ========================================================================
    // TRACK last_user_message_at (for 24h window detection)
    // ========================================================================
    const { getPhoneVariations } = await import("../_shared/zapi-client.ts");
    const phoneVariations = getPhoneVariations(cleanPhone);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ last_user_message_at: new Date().toISOString() })
      .in('phone', phoneVariations);

    if (updateError) {
      console.warn('⚠️ Could not update last_user_message_at:', updateError.message);
    } else {
      console.log('✅ Updated last_user_message_at for phone variations');
    }

    // ========================================================================
    // FIRE-AND-FORGET: Trigger worker for heavy processing
    // ========================================================================
    const workerPayload = {
      phone: cleanPhone,
      cleanPhone: cleanPhone,
      messageId: messageSid,
      text: messageBody || null,
      hasAudio,
      audioUrl,
      hasImage,
      imageCaption: hasImage ? messageBody : undefined,
    };

    const internalSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

    const workerPromise = fetch(`${supabaseUrl}/functions/v1/process-webhook-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret!,
      },
      body: JSON.stringify(workerPayload),
    }).catch(err => console.error('❌ Worker trigger failed:', err));

    try {
      (globalThis as any).EdgeRuntime.waitUntil(workerPromise);
      console.log('✅ Worker triggered with EdgeRuntime.waitUntil');
    } catch {
      console.log('ℹ️ waitUntil not available, using simple fire-and-forget');
    }

    // ========================================================================
    // IMMEDIATE RESPONSE — Twilio expects 200 quickly
    // ========================================================================
    console.log('⚡ Returning 200 immediately, worker processing in background');

    // Twilio expects TwiML or empty 200
    return new Response('', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });

  } catch (error: unknown) {
    console.error('❌ Twilio webhook error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
