/**
 * Webhook Meta — Recebe mensagens WhatsApp via Meta Cloud API
 * 
 * Substitui o webhook-twilio. Normaliza o payload Meta para o formato
 * esperado pelo process-webhook-message e encaminha como fire-and-forget.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Valida que o telefone tem formato razoável
 */
function isValidPhone(phone: string): boolean {
  return /^\d{10,15}$/.test(phone);
}

/**
 * Verifica assinatura do webhook Meta (X-Hub-Signature-256)
 */
async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  if (!appSecret) {
    console.warn('⚠️ INSTAGRAM_APP_SECRET not set, skipping signature verification');
    return true;
  }
  if (!signature) return false;

  const expectedPrefix = 'sha256=';
  if (!signature.startsWith(expectedPrefix)) return false;

  const expectedHash = signature.substring(expectedPrefix.length);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hashArray = Array.from(new Uint8Array(sig));
  const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return computedHash === expectedHash;
}

Deno.serve(async (req) => {
  // ==========================================================================
  // CORS
  // ==========================================================================
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ==========================================================================
  // WEBHOOK VERIFICATION (GET) — Meta challenge
  // ==========================================================================
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Meta webhook verification successful');
      return new Response(challenge || '', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.warn('❌ Meta webhook verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // ==========================================================================
  // WEBHOOK EVENT (POST) — Incoming messages
  // ==========================================================================
  try {
    const rawBody = await req.text();

    // Verify signature
    const signature = req.headers.get('x-hub-signature-256');
    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    console.log('📩 Meta Webhook received:', JSON.stringify(payload, null, 2));

    // Meta sends an array of entries, each with changes
    const entries = payload.entry || [];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const internalSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value || !value.messages) continue;

        const metadata = value.metadata || {};
        // const displayPhoneNumber = metadata.display_phone_number;

        for (const message of value.messages) {
          const from = message.from; // e.g. "5511999998888"
          const messageId = message.id;
          const timestamp = message.timestamp;
          const messageType = message.type; // text, audio, image, interactive, button

          if (!from || !isValidPhone(from)) {
            console.warn(`⚠️ Invalid phone: ${from?.substring(0, 4)}***`);
            continue;
          }

          // Extract text content
          let text: string | null = null;
          let hasAudio = false;
          let audioUrl: string | undefined;
          let hasImage = false;
          let imageCaption: string | undefined;

          if (messageType === 'text') {
            text = message.text?.body || null;
          } else if (messageType === 'interactive') {
            // Button reply or list reply
            if (message.interactive?.type === 'button_reply') {
              text = message.interactive.button_reply?.title || null;
            } else if (message.interactive?.type === 'list_reply') {
              text = message.interactive.list_reply?.title || null;
            }
          } else if (messageType === 'button') {
            // Quick Reply button click
            text = message.button?.text || null;
          } else if (messageType === 'audio') {
            hasAudio = true;
            // Meta doesn't give a direct URL — we need to download via media ID
            // For now, store the media ID; process-webhook-message can download it
            audioUrl = message.audio?.id ? `meta-media:${message.audio.id}` : undefined;
          } else if (messageType === 'image') {
            hasImage = true;
            imageCaption = message.image?.caption || undefined;
          }

          // Skip empty messages
          if (!text && !hasAudio && !hasImage) {
            console.log(`⏭️ Ignoring ${messageType} message with no extractable content`);
            continue;
          }

          // ==================================================================
          // DEDUPLICATION
          // ==================================================================
          if (messageId) {
            const { error: dedupError } = await supabase
              .from('zapi_message_dedup')
              .insert({ message_id: messageId, phone: from });

            if (dedupError) {
              console.log(`⏭️ Already processed messageId: ${messageId}`);
              continue;
            }
            console.log(`✅ New message registered: ${messageId}`);
          }

          // ==================================================================
          // TRACK last_user_message_at (for 24h window detection)
          // ==================================================================
          const { getPhoneVariations } = await import("../_shared/zapi-client.ts");
          const phoneVariations = getPhoneVariations(from);

          await supabase
            .from('profiles')
            .update({ last_user_message_at: new Date().toISOString() })
            .in('phone', phoneVariations);

          // ==================================================================
          // FIRE-AND-FORGET: Trigger worker
          // ==================================================================
          const workerPayload = {
            phone: from,
            cleanPhone: from,
            messageId,
            text,
            hasAudio,
            audioUrl,
            hasImage,
            imageCaption,
          };

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
        }
      }
    }

    // Meta expects 200 quickly
    return new Response('EVENT_RECEIVED', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error: unknown) {
    console.error('❌ Meta webhook error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
