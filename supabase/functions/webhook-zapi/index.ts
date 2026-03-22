import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateWebhookAuth,
  parseZapiPayload,
  cleanPhoneNumber,
  isValidPhoneNumber,
} from "../_shared/zapi-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========================================================================
    // AUTHENTICATION
    // ========================================================================
    const authResult = validateWebhookAuth(req);
    if (!authResult.isValid) {
      console.warn('🚫 Unauthorized webhook request:', authResult.error);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // PARSE PAYLOAD
    // ========================================================================
    const rawPayload = await req.json();
    console.log('📩 Z-API Webhook received:', JSON.stringify(rawPayload, null, 2));

    const payload = parseZapiPayload(rawPayload);

    // ========================================================================
    // EARLY EXITS
    // ========================================================================
    if (payload.isFromMe) {
      console.log('⏭️ Ignoring own message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'own_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (payload.isGroup) {
      console.log('⏭️ Ignoring group message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'group_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!payload.phone || !payload.cleanPhone) {
      console.log('⏭️ Missing phone number');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isValidPhoneNumber(payload.cleanPhone)) {
      console.warn('⚠️ Invalid phone format:', payload.cleanPhone.substring(0, 4) + '***');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'invalid_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // FILTER STATUS-ONLY EVENTS (no content)
    // ========================================================================
    if (!payload.text && !payload.hasAudio && !payload.hasImage) {
      console.log('⏭️ Ignoring status-only event (no text, audio, or image content)');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'status_only_event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // DEDUPLICATION
    // ========================================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (payload.messageId) {
      const { error: dedupError } = await supabase
        .from('zapi_message_dedup')
        .insert({ message_id: payload.messageId, phone: payload.phone });

      if (dedupError) {
        console.log(`⏭️ Already processed messageId: ${payload.messageId}`);
        return new Response(JSON.stringify({ status: 'ignored', reason: 'duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`✅ New message registered: ${payload.messageId}`);
    }

    // ========================================================================
    // FIRE-AND-FORGET: Trigger worker for heavy processing
    // ========================================================================
    const workerPayload = {
      phone: payload.phone,
      cleanPhone: payload.cleanPhone,
      messageId: payload.messageId,
      text: payload.text,
      hasAudio: payload.hasAudio,
      audioUrl: payload.audioUrl,
      hasImage: payload.hasImage,
      imageCaption: payload.imageCaption,
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

    // Keep the runtime alive until the fetch completes
    try {
      (globalThis as any).EdgeRuntime.waitUntil(workerPromise);
      console.log('✅ Worker triggered with EdgeRuntime.waitUntil');
    } catch {
      console.log('ℹ️ waitUntil not available, using simple fire-and-forget');
    }

    // ========================================================================
    // IMMEDIATE RESPONSE — Z-API gets 200 in <500ms
    // ========================================================================
    console.log('⚡ Returning 200 immediately, worker processing in background');
    return new Response(JSON.stringify({ status: 'accepted' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Webhook receiver error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
