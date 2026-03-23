import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendTextMessage,
  sendAudioMessage,
  cleanPhoneNumber,
  getPhoneVariations,
  ZapiConfig,
} from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function createShortLink(url: string, phone: string): Promise<string | null> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-short-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ url, phone }),
    });
    const data = await response.json();
    if (response.ok && data.shortUrl) return data.shortUrl;
    return null;
  } catch { return null; }
}

async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log('🎙️ Downloading audio from:', audioUrl);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error('❌ Failed to download audio:', audioResponse.status);
      return null;
    }
    const audioBlob = await audioResponse.blob();
    console.log('📦 Audio downloaded, size:', audioBlob.size, 'bytes');

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not configured');
      return null;
    }

    console.log('🔄 Sending to Whisper API...');
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('❌ Whisper API error:', errorText);
      return null;
    }

    const result = await whisperResponse.json();
    console.log('✅ Transcription result:', result.text);
    return result.text;
  } catch (error) {
    console.error('❌ Error transcribing audio:', error);
    return null;
  }
}

async function generateTTS(text: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${supabaseUrl}/functions/v1/aura-tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ text, voice: 'shimmer' }),
    });
    if (!response.ok) {
      console.error('❌ TTS error:', await response.text());
      return null;
    }
    const data = await response.json();
    return data.audioContent;
  } catch (error) {
    console.error('❌ TTS exception:', error);
    return null;
  }
}

async function handleSessionConfirmation(
  supabase: any, userId: string, message: string
): Promise<{ handled: boolean; response?: string }> {
  const { data: pendingSession } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .eq('confirmation_requested', true)
    .is('user_confirmed', null)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pendingSession) return { handled: false };

  const lowerMessage = message.toLowerCase().trim();

  if (/^(sim|confirmo|confirmado|ok|pode ser|tá bom|ta bom|certo|fechado|confirma|confirmei)$/i.test(lowerMessage)) {
    await supabase.from('sessions').update({ user_confirmed: true }).eq('id', pendingSession.id);
    const sessionDate = new Date(pendingSession.scheduled_at);
    const sessionTime = sessionDate.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    });
    return { handled: true, response: `Perfeito! Sessão confirmada para ${sessionTime}. Mal posso esperar! 💜` };
  }

  if (/reagendar|remarcar|outro|mudar|não (posso|consigo|dá)|nao (posso|consigo|da)|cancelar/i.test(lowerMessage)) {
    return { handled: false };
  }

  return { handled: false };
}

async function handleSessionRating(
  supabase: any, userId: string, message: string
): Promise<{ handled: boolean; response?: string }> {
  const lowerMessage = message.toLowerCase().trim();
  const ratingMatch = lowerMessage.match(/^([1-5])$/);
  if (!ratingMatch) return { handled: false };

  const rating = parseInt(ratingMatch[1]);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: ratedSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('rating_requested', true)
    .gte('ended_at', oneDayAgo)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ratedSession) return { handled: false };

  const { data: existingRating } = await supabase
    .from('session_ratings').select('id').eq('session_id', ratedSession.id).maybeSingle();
  if (existingRating) return { handled: false };

  const { error: insertError } = await supabase
    .from('session_ratings').insert({ session_id: ratedSession.id, user_id: userId, rating });
  if (insertError) { console.error('❌ Error saving session rating:', insertError); return { handled: false }; }

  let response: string;
  if (rating >= 4) response = `Que bom que você gostou! 💜 Fico muito feliz em saber. Obrigada pelo feedback!`;
  else if (rating === 3) response = `Obrigada pelo feedback! 💜 Vou me esforçar pra melhorar cada vez mais.`;
  else response = `Obrigada por me contar. 💜 Me desculpa se não foi tão bom quanto você esperava. Vou trabalhar pra melhorar!`;

  console.log(`✅ Session rating saved: ${rating} stars for session ${ratedSession.id}`);
  return { handled: true, response };
}

// ============================================================================
// MAIN WORKER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================================================
  // AUTHENTICATION — Only accept internal calls
  // ========================================================================
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

  if (!internalSecret || !expectedSecret || internalSecret !== expectedSecret) {
    console.warn('🚫 Unauthorized request to process-webhook-message');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Track phone for contingency — no longer sends fallback messages
  let contingencyPhone: string | null = null;
  let contingencyInstanceConfig: ZapiConfig | undefined = undefined;
  let sentAnyResponse = false;
  let supabase: ReturnType<typeof createClient> | null = null;
  let profile: any = null;
  let wasInterrupted = false;
  let interruptedAtIndex = -1;
  let agentData: any = null;

  try {
    const workerPayload = await req.json();
    const {
      phone, cleanPhone, messageId, text,
      hasAudio, audioUrl, hasImage, imageCaption,
    } = workerPayload;

    contingencyPhone = cleanPhone;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // PROCESS MESSAGE CONTENT
    // ========================================================================
    let messageText = text;
    let isAudioMessage = false;

    if (hasAudio && !messageText) {
      console.log('🎤 Audio message detected, transcribing...');
      const transcription = await transcribeAudio(audioUrl);
      if (transcription) {
        messageText = transcription;
        isAudioMessage = true;
        console.log('✅ Audio transcribed:', messageText);
      }
    }

    if (hasImage && imageCaption) {
      messageText = imageCaption;
      console.log('🖼️ Image with caption:', messageText);
    }

    // ========================================================================
    // USER LOOKUP
    // ========================================================================
    const phoneVariations = getPhoneVariations(cleanPhone);
    console.log(`🔍 Searching for phone variations: ${phoneVariations.join(', ')}`);

    const { data: profileResults, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('phone', phoneVariations)
      .order('status', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(1);

    if (profileError) {
      console.error('❌ Error looking up profile:', profileError);
      return new Response(JSON.stringify({ status: 'profile_lookup_error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    profile = profileResults?.[0];
    if (!profile) {
      console.log('⚠️ User not found for phone variations:', phoneVariations.join(', '));
      return new Response(JSON.stringify({ status: 'user_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get instance config for contingency
    try {
      contingencyInstanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
    } catch {}

    // Auto-correção de telefone
    if (profile.phone !== cleanPhone) {
      console.log(`📱 Auto-correcting phone: ${profile.phone} -> ${cleanPhone}`);
      await supabase.from('profiles').update({ phone: cleanPhone }).eq('id', profile.id);
      profile.phone = cleanPhone;
    }

    console.log(`👤 Found user: ${profile.name} (${profile.user_id}), status: ${profile.status}, instance: ${profile.whatsapp_instance_id || 'env-default'}`);

    // ========================================================================
    // SUBSCRIPTION STATUS CHECK
    // ========================================================================
    const blockedStatuses = ['canceled', 'inactive', 'paused'];
    if (blockedStatuses.includes(profile.status || '')) {
      console.log(`🚫 User ${profile.user_id} blocked: status is '${profile.status}'`);

      let instanceConfig = undefined;
      if (profile.whatsapp_instance_id) {
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('zapi_instance_id, zapi_token, zapi_client_token')
          .eq('id', profile.whatsapp_instance_id).single();
        if (inst) instanceConfig = { instanceId: inst.zapi_instance_id, token: inst.zapi_token, clientToken: inst.zapi_client_token };
      }

      const checkoutLink = await createShortLink('https://olaaura.com.br/checkout', cleanPhone || '') || 'https://olaaura.com.br/checkout';
      const statusMessages: Record<string, string> = {
        canceled: `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua assinatura foi encerrada. Sinto sua falta!\n\nSe quiser voltar a conversar comigo, é só assinar novamente:\n👉 ${checkoutLink}\n\nVou adorar te receber de volta! ✨`,
        inactive: `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua conta está inativa no momento.\n\nPara continuarmos nossas conversas, assine um plano:\n👉 ${checkoutLink}\n\nEstou aqui te esperando! ✨`,
        paused: `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua assinatura está pausada no momento.\n\nQuando estiver pronto(a) para voltar, é só reativar:\n👉 ${checkoutLink}\n\nEstarei aqui quando você precisar! ✨`,
      };

      await sendTextMessage(cleanPhone!, statusMessages[profile.status!], undefined, instanceConfig);
      return new Response(JSON.stringify({ success: true, action: 'subscription_blocked', status: profile.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // INTERRUPTION SYSTEM
    // ========================================================================
    const currentMessageId = messageId || `msg_${Date.now()}`;

    // Ensure row exists for atomic lock
    const { error: upsertError } = await supabase
      .from('aura_response_state')
      .upsert({ user_id: profile.user_id, updated_at: new Date().toISOString() }, { onConflict: 'user_id', ignoreDuplicates: true });

    if (upsertError) {
      console.error(`❌ Lock upsert FAILED for user ${profile.user_id}:`, upsertError.message);
    } else {
      console.log(`🔒 Lock upsert OK for user ${profile.user_id}`);
    }

    // ATOMIC LOCK: single UPDATE that only succeeds if is_responding = false
    const { data: lockResult } = await supabase
      .from('aura_response_state')
      .update({
        is_responding: true,
        response_started_at: new Date().toISOString(),
        last_user_message_id: currentMessageId
      })
      .eq('user_id', profile.user_id)
      .eq('is_responding', false)
      .select();

    if (!lockResult || lockResult.length === 0) {
      // Lock not acquired — check if stale (>60s)
      const { data: currentState } = await supabase
        .from('aura_response_state')
        .select('response_started_at')
        .eq('user_id', profile.user_id)
        .maybeSingle();

      const respondingAge = Date.now() - new Date(currentState?.response_started_at || 0).getTime();

      if (respondingAge < 60000) {
        // PERSIST message BEFORE aborting so the winning worker can accumulate it
        if (messageText) {
          const { data: recentDup } = await supabase
            .from('messages').select('id').eq('user_id', profile.user_id).eq('role', 'user')
            .eq('content', messageText).gte('created_at', new Date(Date.now() - 30000).toISOString())
            .limit(1).maybeSingle();
          if (!recentDup) {
            await supabase.from('messages').insert({ user_id: profile.user_id, role: 'user', content: messageText });
            console.log(`💾 Pre-lock: persisted message for accumulation by winning worker`);
          }
        }
        console.log(`🛑 ABORT: Lock atômico — outro worker respondendo (age: ${Math.round(respondingAge / 1000)}s). Mensagem será acumulada.`);
        return new Response(JSON.stringify({ status: 'debounced_concurrent', reason: 'another_worker_responding' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Stale lock — force acquisition
      console.log(`⚠️ Lock stale (${Math.round(respondingAge / 1000)}s), forçando aquisição`);
      await supabase.from('aura_response_state')
        .update({ is_responding: true, response_started_at: new Date().toISOString(), last_user_message_id: currentMessageId })
        .eq('user_id', profile.user_id);
    }

    // Helper to release lock on early returns
    const releaseLock = async () => {
      try {
        await supabase
          .from('aura_response_state')
          .update({ is_responding: false })
          .eq('user_id', profile.user_id);
      } catch (e) {
        console.error(`⚠️ Erro ao liberar lock para user ${profile.user_id}:`, e);
      }
    };

    try { // try/finally covers ALL code after lock acquisition to guarantee lock release

    // Read pending content from lock result or fresh query
    const responseState = lockResult?.[0] || (await supabase.from('aura_response_state').select('*').eq('user_id', profile.user_id).maybeSingle()).data;
    const pendingContent = responseState?.pending_content || null;
    const pendingContext = responseState?.pending_context || null;
    const lastUserContext = responseState?.last_user_context || null;

    if (pendingContent) {
      console.log(`📦 Found pending content from interrupted response: ${pendingContent.substring(0, 100)}...`);
    }

    // ========================================================================
    // PERSIST INBOUND MESSAGE (after lock — prevents duplicates from competing workers)
    // ========================================================================
    let inboundSaved = false;
    if (messageText) {
      // Content-based dedup: check for identical message in last 30s
      const { data: recentDup } = await supabase
        .from('messages')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('role', 'user')
        .eq('content', messageText)
        .gte('created_at', new Date(Date.now() - 30000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recentDup) {
        console.log(`⏭️ DEDUP: Mensagem idêntica encontrada nos últimos 30s (id: ${recentDup.id}), abortando`);
        await releaseLock();
        return new Response(JSON.stringify({ status: 'ignored', reason: 'content_duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const { data: insertedMsg } = await supabase
          .from('messages')
          .insert({ user_id: profile.user_id, role: 'user', content: messageText })
          .select('id')
          .single();
        inboundSaved = true;
        if (insertedMsg?.id) {
          (globalThis as any).__inboundMessageDbId = insertedMsg.id;
        }
        console.log(`💾 Inbound message persisted for user ${profile.user_id} (id: ${insertedMsg?.id})`);
      } catch (persistErr) {
        console.warn('⚠️ Failed to persist inbound message:', persistErr);
      }
    }

    // ========================================================================
    // RESET FOLLOW-UP COUNT
    // ========================================================================
    await supabase
      .from('conversation_followups')
      .update({ followup_count: 0, last_user_message_at: new Date().toISOString() })
      .eq('user_id', profile.user_id);
    console.log(`🔄 Follow-up count reset for user ${profile.user_id}`);

    // ========================================================================
    // HANDLE FAILED AUDIO TRANSCRIPTION
    // ========================================================================
    if (hasAudio && !messageText) {
      console.log(`🎤 Audio transcription failed for user ${profile.user_id} — sending fallback and releasing lock`);
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(
        cleanPhone,
        "Desculpa, não consegui ouvir seu áudio direito. 😅 Pode me mandar por texto ou tentar gravar de novo?",
        undefined, instanceConfig
      );
      await releaseLock();
      return new Response(JSON.stringify({ status: 'audio_transcription_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // TIME CAPSULE HANDLING
    // ========================================================================
    const capsuleState = profile.awaiting_time_capsule;

    if (capsuleState === 'awaiting_audio' || capsuleState === 'awaiting_confirmation') {
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);

      if (capsuleState === 'awaiting_audio') {
        if (hasAudio && audioUrl) {
          await supabase.from('profiles').update({
            awaiting_time_capsule: 'awaiting_confirmation',
            pending_capsule_audio_url: audioUrl,
          }).eq('user_id', profile.user_id);

          const confirmMsg = `Recebi seu áudio! 🎙️ Ficou do jeito que você queria?\n\nSe quiser regravar, manda outro áudio. Se tiver bom, me diz "pode guardar" 💜`;
          await sendTextMessage(cleanPhone, confirmMsg, undefined, instanceConfig);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText || '[áudio para cápsula do tempo]' }] : []),
            { user_id: profile.user_id, role: 'assistant', content: confirmMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_audio_received' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const reminderMsg = `Manda um áudio pra eu guardar sua voz! 🎙️ Quando quiser desistir, é só dizer "deixa pra lá" 💜`;
        await sendTextMessage(cleanPhone, reminderMsg, undefined, instanceConfig);
        await supabase.from('messages').insert([
          ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
          { user_id: profile.user_id, role: 'assistant', content: reminderMsg },
        ]);
        inboundSaved = true;
        await releaseLock();
        return new Response(JSON.stringify({ status: 'capsule_awaiting_audio_reminder' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (capsuleState === 'awaiting_confirmation') {
        if (hasAudio && audioUrl) {
          await supabase.from('profiles').update({ pending_capsule_audio_url: audioUrl }).eq('user_id', profile.user_id);
          const replaceMsg = `Troquei o áudio! 🎙️ Esse ficou bom? Me diz "pode guardar" quando tiver certeza 💜`;
          await sendTextMessage(cleanPhone, replaceMsg, undefined, instanceConfig);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText || '[novo áudio para cápsula]' }] : []),
            { user_id: profile.user_id, role: 'assistant', content: replaceMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_audio_replaced' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const lowerMsg = (messageText || '').toLowerCase().trim();

        if (/deixa|cancela|desist|não quero|nao quero|esquece|para|parar/i.test(lowerMsg)) {
          await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null }).eq('user_id', profile.user_id);
          const cancelMsg = `Tudo bem! Quando quiser gravar uma cápsula do tempo, é só falar 💜`;
          await sendTextMessage(cleanPhone, cancelMsg, undefined, instanceConfig);
          await supabase.from('messages').insert([
            ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
            { user_id: profile.user_id, role: 'assistant', content: cancelMsg },
          ]);
          inboundSaved = true;
          await releaseLock();
          return new Response(JSON.stringify({ status: 'capsule_cancelled' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (/sim|pode|guard|confirm|ficou|bom|bora|manda|salv|tá (bom|ótimo|perfeito)|ta (bom|otimo|perfeito)|perfeito|certeza|isso/i.test(lowerMsg)) {
          const pendingUrl = profile.pending_capsule_audio_url;
          if (!pendingUrl) {
            await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null }).eq('user_id', profile.user_id);
          } else {
            const deliverAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            let transcription: string | null = null;
            try { transcription = await transcribeAudio(pendingUrl); } catch (e) { console.warn('⚠️ Could not transcribe capsule audio:', e); }

            await supabase.from('time_capsules').insert({
              user_id: profile.user_id, audio_url: pendingUrl, transcription,
              deliver_at: deliverAt.toISOString(),
              context_message: `Cápsula gravada em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            });
            await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null }).eq('user_id', profile.user_id);

            const deliverDateStr = deliverAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
            const savedMsg = `Guardei sua mensagem com carinho! 💜✨\n\nVou te enviar de volta no dia ${deliverDateStr}. Vai ser uma surpresa especial do seu eu de hoje pro seu eu do futuro 🫶`;
            await sendTextMessage(cleanPhone, savedMsg, undefined, instanceConfig);
            await supabase.from('messages').insert([
              ...(!inboundSaved ? [{ user_id: profile.user_id, role: 'user', content: messageText }] : []),
              { user_id: profile.user_id, role: 'assistant', content: savedMsg },
            ]);
            inboundSaved = true;
            console.log(`✅ Time capsule saved for user ${profile.user_id}, deliver_at: ${deliverDateStr}`);
            await releaseLock();
            return new Response(JSON.stringify({ status: 'capsule_saved' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Unrecognized response — clear capsule state, continue normal flow
        await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null }).eq('user_id', profile.user_id);
        console.log('⚠️ Capsule confirmation state cleared - unrecognized response, continuing normal flow');
      }
    }

    // Timeout: clear stale capsule flags (>24h)
    if (capsuleState && profile.updated_at) {
      const updatedAt = new Date(profile.updated_at).getTime();
      const hoursAgo = (Date.now() - updatedAt) / (1000 * 60 * 60);
      if (hoursAgo > 24) {
        console.log(`🕐 Capsule timeout (${Math.round(hoursAgo)}h), clearing flags`);
        await supabase.from('profiles').update({ awaiting_time_capsule: null, pending_capsule_audio_url: null }).eq('user_id', profile.user_id);
      }
    }

    // ========================================================================
    // SESSION RATING
    // ========================================================================
    const ratingResult = await handleSessionRating(supabase, profile.user_id, messageText);
    if (ratingResult.handled && ratingResult.response) {
      console.log(`✅ Session rating handled for user ${profile.user_id}`);
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(cleanPhone, ratingResult.response, undefined, instanceConfig);
      if (!inboundSaved) {
        await supabase.from('messages').insert({ user_id: profile.user_id, role: 'user', content: messageText });
        inboundSaved = true;
      }
      await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: ratingResult.response });
      await releaseLock();
      return new Response(JSON.stringify({ status: 'rating_handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // SESSION CONFIRMATION
    // ========================================================================
    const confirmationResult = await handleSessionConfirmation(supabase, profile.user_id, messageText);
    if (confirmationResult.handled && confirmationResult.response) {
      console.log(`✅ Session confirmation handled for user ${profile.user_id}`);
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(cleanPhone, confirmationResult.response, undefined, instanceConfig);
      if (!inboundSaved) {
        await supabase.from('messages').insert({ user_id: profile.user_id, role: 'user', content: messageText });
        inboundSaved = true;
      }
      await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: confirmationResult.response });
      await releaseLock();
      return new Response(JSON.stringify({ status: 'confirmation_handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // INITIAL DELAY — Simulates "reading" the message
    // ========================================================================
    const initialDelay = 1500 + Math.random() * 2000;
    console.log(`⏳ Initial thinking delay: ${Math.round(initialDelay)}ms`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // ========================================================================
    // DEBOUNCE CHECK
    // ========================================================================
    // --- DEBOUNCE: use messages table as source of truth ---
    const inboundMessageDbId = (globalThis as any).__inboundMessageDbId;

    if (inboundMessageDbId) {
      const { data: latestUserMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestUserMsg && latestUserMsg.id !== inboundMessageDbId) {
        console.log(`⏭️ DEBOUNCE: Msg mais recente no banco (${latestUserMsg.id} != ${inboundMessageDbId}). Abortando.`);
        await releaseLock();
        return new Response(JSON.stringify({ status: 'debounced', reason: 'newer_message_exists' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // --- ACCUMULATE sequential user messages since last assistant response ---
    const { data: lastAssistantMsg } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', profile.user_id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let accumulatedQuery = supabase
      .from('messages')
      .select('content')
      .eq('user_id', profile.user_id)
      .eq('role', 'user')
      .order('created_at', { ascending: true });

    if (lastAssistantMsg?.created_at) {
      accumulatedQuery = accumulatedQuery.gt('created_at', lastAssistantMsg.created_at);
    }

    const { data: recentUserMsgs } = await accumulatedQuery;

    if (recentUserMsgs && recentUserMsgs.length > 1) {
      messageText = recentUserMsgs.map(m => m.content).join('\n');
      console.log(`📦 Accumulated ${recentUserMsgs.length} sequential messages into one`);
    }

    // ========================================================================
    // CALL AURA AGENT
    // ========================================================================
    console.log(`📱 Processing message from: ${cleanPhone.substring(0, 4)}***`);
    console.log(`💬 Message length: ${messageText.length} chars`);
    console.log(`🎤 Is audio message: ${isAudioMessage}`);

    // Lock already acquired atomically at line ~338

    let wasInterrupted = false;
    let interruptedAtIndex = -1;
    let agentData: any = null;

    // Helper: call aura-agent with timeout and optional minimal context
    async function callAuraAgent(useMinimalContext = false): Promise<any> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000); // 50s timeout
      try {
        const body: any = {
          message: messageText,
          user_id: profile.user_id,
          phone: cleanPhone,
          is_audio_message: isAudioMessage,
          pending_content: pendingContent,
          pending_context: pendingContext,
          last_user_context: lastUserContext,
        };
        if (useMinimalContext) {
          body.minimal_context = true;
        }
        const resp = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Agent HTTP ${resp.status}: ${errorText}`);
        }
        return await resp.json();
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    }

    // RETRY STRATEGY: attempt 1 (normal) → attempt 2 (normal) → attempt 3 (minimal context)
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const useMinimal = attempt === 3;
        console.log(`🔄 aura-agent attempt ${attempt}/3${useMinimal ? ' (minimal_context)' : ''}...`);
        agentData = await callAuraAgent(useMinimal);
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const isTimeout = err.name === 'AbortError';
        console.error(`❌ aura-agent attempt ${attempt} failed (${isTimeout ? 'TIMEOUT 50s' : err.message})`);
        if (attempt < 3) {
          console.log(`⏳ Waiting 2s before retry...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (lastError || !agentData) {
      throw lastError || new Error('All 3 aura-agent attempts failed');
    }

    // Clear pending content after passing to agent
    if (pendingContent) {
      await supabase.from('aura_response_state').update({ pending_content: null, pending_context: null }).eq('user_id', profile.user_id);
    }

    console.log('🤖 Agent response:', JSON.stringify(agentData, null, 2));

    // ========================================================================
    // UPDATE CONVERSATION TRACKING
    // ========================================================================
    const now = new Date().toISOString();
    const conversationStatus = agentData.conversation_status || 'neutral';
    const isSessionActive = agentData.session_active === true;
    const shouldEnableFollowup = conversationStatus === 'awaiting' || isSessionActive;

    const { data: existingFollowup } = await supabase
      .from('conversation_followups')
      .select('conversation_context')
      .eq('user_id', profile.user_id)
      .maybeSingle();

    const existingContext = existingFollowup?.conversation_context;
    const hasGoodContext = existingContext && existingContext.length > 15 &&
      !['ok', 'legal', 'beleza', 'sim', 'não'].includes(existingContext.toLowerCase());

    await supabase
      .from('conversation_followups')
      .upsert({
        user_id: profile.user_id,
        last_user_message_at: shouldEnableFollowup ? now : null,
        followup_count: shouldEnableFollowup ? 0 : 99,
        conversation_context: shouldEnableFollowup
          ? (hasGoodContext ? existingContext : messageText.substring(0, 200))
          : null,
      }, { onConflict: 'user_id' });
    console.log(`📍 Conversation tracking updated - status: ${conversationStatus}, sessionActive: ${isSessionActive}, followup: ${shouldEnableFollowup}, preservedContext: ${hasGoodContext}`);

    // ========================================================================
    // SEND RESPONSE MESSAGES (with interruption check)
    // ========================================================================

    for (let i = 0; i < (agentData.messages || []).length; i++) {
      const msg = agentData.messages[i];

      // Check for interruption before each bubble (except first)
      if (i > 0) {
        const { data: currentState } = await supabase
          .from('aura_response_state')
          .select('last_user_message_id')
          .eq('user_id', profile.user_id)
          .maybeSingle();

        const hasNewMessage = currentState?.last_user_message_id &&
                              currentState.last_user_message_id !== currentMessageId;

        console.log(`🔍 Interruption check [${i}/${agentData.messages.length}]: local=${currentMessageId}, db=${currentState?.last_user_message_id}, match=${!hasNewMessage}`);

        if (hasNewMessage) {
          console.log(`🛑 INTERRUPÇÃO DETECTADA! Parando envio de ${agentData.messages.length - i} bubbles restantes.`);
          wasInterrupted = true;
          interruptedAtIndex = i;
          break;
        }
      }

      // Delay between bubbles
      if (i > 0 && msg.delay) {
        const actualDelay = Math.min(msg.delay, 5000);
        console.log(`⏱️ Waiting ${actualDelay}ms before next message...`);
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }

      let responseText = (msg.text || msg.content || '').replace(/\|\|\|/g, '').trim();




      // Clean all known internal tags
      responseText = responseText
        .replace(/\[AGUARDANDO_RESPOSTA\]/gi, '')
        .replace(/\[CONVERSA_CONCLUIDA\]/gi, '')
        .replace(/\[MODO_AUDIO\]/gi, '')
        .replace(/\[VALOR_ENTREGUE\]/gi, '')
        .replace(/\[ENCERRAR_SESSAO\]/gi, '')
        .replace(/\[INICIAR_SESSAO\]/gi, '')
        .replace(/\[INSIGHTS\].*?\[\/INSIGHTS\]/gis, '')
        .replace(/\[AGENDAR_TAREFA:.*?\]/gi, '')
        .replace(/\[CANCELAR_TAREFA:\w+\]/gi, '')
        .trim();

      // Safety net: remove remaining [UPPERCASE_TAG] patterns
      responseText = responseText
        .replace(/\[\s*[A-Z_]{3,}(?::[^\]]*)?\s*\]/g, '')
        .replace(/\[\s*\/[A-Z_]{3,}\s*\]/g, '')
        .trim();


      if (!responseText) {
        console.log('⏭️ Skipping empty message');
        continue;
      }

      // Audio messages
      if (msg.isAudio) {
        console.log(`🎙️ Generating audio for: ${responseText.substring(0, 50)}...`);
        const audioContent = await generateTTS(responseText);
        if (audioContent) {
          const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
          const audioResult = await sendAudioMessage(cleanPhone, audioContent, instanceConfig);
          if (audioResult.success) {
            sentAnyResponse = true;
            try {
              const { data: existingAssistant } = await supabase
                .from('messages').select('id')
                .eq('user_id', profile.user_id).eq('role', 'assistant').eq('content', responseText)
                .gte('created_at', new Date(Date.now() - 30000).toISOString())
                .limit(1).maybeSingle();
              if (!existingAssistant) {
                await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: responseText });
              } else {
                console.log('⏭️ DEDUP: Assistant audio message already exists, skipping persist');
              }
            } catch {}
            continue;
          }
          console.log('⚠️ Audio send failed, falling back to text');
        }
      }

      // Typing delay
      let typingSeconds: number;
      if (responseText.length < 50) typingSeconds = Math.max(1, Math.ceil(responseText.length / 30));
      else if (responseText.length < 100) typingSeconds = Math.ceil(responseText.length / 40);
      else typingSeconds = Math.min(Math.ceil(responseText.length / 35), 6);

      console.log(`📤 Sending text (${responseText.length} chars, ${typingSeconds}s typing): ${responseText.substring(0, 50)}...`);
      const instanceConfig2 = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(cleanPhone, responseText, typingSeconds, instanceConfig2);
      sentAnyResponse = true;

      // Persist assistant message to DB (with dedup check)
      try {
        const { data: existingAssistant2 } = await supabase
          .from('messages').select('id')
          .eq('user_id', profile.user_id).eq('role', 'assistant').eq('content', responseText)
          .gte('created_at', new Date(Date.now() - 30000).toISOString())
          .limit(1).maybeSingle();
        if (!existingAssistant2) {
          await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: responseText });
        } else {
          console.log('⏭️ DEDUP: Assistant text message already exists, skipping persist');
        }
      } catch (persistErr) {
        console.warn('⚠️ Failed to persist assistant message:', persistErr);
      }
    }

    // ========================================================================
    // GUARD: If no response was sent and no interruption, RETRY the agent once
    // ========================================================================
    if (!sentAnyResponse && !wasInterrupted && agentData) {
      console.warn(`⚠️ EMPTY RESPONSE GUARD: Agent returned but 0 messages sent. Retrying once...`);
      try {
        const retryData = await callAuraAgent(true); // minimal context for speed
        if (retryData?.messages?.length) {
          for (const msg of retryData.messages) {
            let retryText = (msg.text || msg.content || '').replace(/\|\|\|/g, '').trim();
            retryText = retryText.replace(/\[\s*[A-Z_]{3,}(?::[^\]]*)?\s*\]/g, '').replace(/\[\s*\/[A-Z_]{3,}\s*\]/g, '').trim();
            if (!retryText) continue;
            const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
            await sendTextMessage(cleanPhone, retryText, undefined, instanceConfig);
            sentAnyResponse = true;
            try {
              const { data: retryDedupCheck } = await supabase
                .from('messages').select('id').eq('user_id', profile.user_id).eq('role', 'assistant')
                .eq('content', retryText).gte('created_at', new Date(Date.now() - 30000).toISOString())
                .limit(1).maybeSingle();
              if (!retryDedupCheck) {
                await supabase.from('messages').insert({ user_id: profile.user_id, role: 'assistant', content: retryText });
              } else {
                console.log('⚠️ Retry dedup: skipped duplicate assistant message');
              }
            } catch {}
            break; // send at least one message
          }
        }
        if (!sentAnyResponse) {
          console.error(`🚨 CRITICAL: Agent returned empty on retry too. User ${profile.user_id} got no response. conversation-followup will handle.`);
        }
      } catch (retryErr) {
        console.error(`🚨 CRITICAL: Empty response retry failed:`, retryErr);
      }
    }

    // ========================================================================
    // FINALIZATION
    // ========================================================================
    if (wasInterrupted && interruptedAtIndex > 0) {
      const pendingMessages = agentData.messages
        .slice(interruptedAtIndex)
        .map((m: any) => m.text || m.content || '')
        .filter((t: string) => t.trim())
        .join('\n\n');

      if (pendingMessages) {
        console.log(`📦 Salvando ${agentData.messages.length - interruptedAtIndex} bubbles pendentes para avaliação posterior`);
        await supabase
          .from('aura_response_state')
          .update({ is_responding: false, pending_content: pendingMessages, pending_context: messageText.substring(0, 200) })
          .eq('user_id', profile.user_id);
      }
    } else {
      await supabase
        .from('aura_response_state')
        .update({ is_responding: false, pending_content: null, pending_context: null })
        .eq('user_id', profile.user_id);
    }

    } finally {
      // Safety net: garante liberação do lock mesmo em caso de erro
      try {
        await supabase
          .from('aura_response_state')
          .update({ is_responding: false })
          .eq('user_id', profile.user_id)
          .eq('is_responding', true);
      } catch (cleanupError) {
        console.error(`⚠️ Erro silencioso ao liberar lock para user ${profile.user_id}:`, cleanupError);
      }
    }

    return new Response(JSON.stringify({
      status: wasInterrupted ? 'interrupted' : 'success',
      messagesCount: wasInterrupted ? interruptedAtIndex : (agentData.messages?.length || 0),
      wasAudioMessage: isAudioMessage,
      wasInterrupted
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Worker processing error:', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'unknown',
      stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      phone: contingencyPhone,
      hasProfile: !!profile,
      hasSupabase: !!supabase,
    });

    // Release lock in outer catch (covers errors between lock acquisition and inner try)
    if (supabase && profile?.user_id) {
      try {
        await supabase.from('aura_response_state')
          .update({ is_responding: false })
          .eq('user_id', profile.user_id)
          .eq('is_responding', true);
      } catch (lockErr) {
        console.error('⚠️ Failed to release lock in outer catch:', lockErr);
      }
    }

    // NO FALLBACK MESSAGE — conversation-followup CRON will handle naturally
    if (!sentAnyResponse) {
      console.error(`🚨 CRITICAL: User got NO response at all. conversation-followup will detect and re-engage naturally.`);
    } else {
      console.log('ℹ️ Error after response already sent — no action needed');
    }

    return new Response(JSON.stringify({ error: 'processing_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
