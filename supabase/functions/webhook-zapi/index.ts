import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateWebhookAuth,
  parseZapiPayload,
  sendTextMessage,
  sendAudioMessage,
  cleanPhoneNumber,
  isValidPhoneNumber,
  getPhoneVariations,
  ZapiConfig,
} from "../_shared/zapi-client.ts";
import { getInstanceConfigForUser, getInstanceConfigForPhone } from "../_shared/instance-helper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to transcribe audio using OpenAI Whisper
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
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
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

// Function to generate TTS audio
async function generateTTS(text: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(`${supabaseUrl}/functions/v1/aura-tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
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

// Function to handle session confirmation replies
async function handleSessionConfirmation(
  supabase: any,
  userId: string,
  message: string
): Promise<{ handled: boolean; response?: string }> {
  // Buscar sessão aguardando confirmação
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
  
  // Confirmação positiva
  if (/^(sim|confirmo|confirmado|ok|pode ser|tá bom|ta bom|certo|fechado|confirma|confirmei)$/i.test(lowerMessage)) {
    await supabase
      .from('sessions')
      .update({ user_confirmed: true })
      .eq('id', pendingSession.id);
    
    const sessionDate = new Date(pendingSession.scheduled_at);
    const sessionTime = sessionDate.toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    });
    
    return { 
      handled: true, 
      response: `Perfeito! Sessão confirmada para ${sessionTime}. Mal posso esperar! 💜`
    };
  }
  
  // Pedido de reagendamento - não marca como handled, deixa a AURA processar
  if (/reagendar|remarcar|outro|mudar|não (posso|consigo|dá)|nao (posso|consigo|da)|cancelar/i.test(lowerMessage)) {
    return { handled: false };
  }

  return { handled: false };
}

// Function to handle session rating replies
async function handleSessionRating(
  supabase: any,
  userId: string,
  message: string
): Promise<{ handled: boolean; response?: string }> {
  const lowerMessage = message.toLowerCase().trim();
  
  // Verificar se é um número de 1 a 5
  const ratingMatch = lowerMessage.match(/^([1-5])$/);
  if (!ratingMatch) return { handled: false };
  
  const rating = parseInt(ratingMatch[1]);

  // Buscar sessão que pediu rating recentemente (últimas 24h)
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

  // Verificar se já não existe rating para essa sessão
  const { data: existingRating } = await supabase
    .from('session_ratings')
    .select('id')
    .eq('session_id', ratedSession.id)
    .maybeSingle();

  if (existingRating) return { handled: false };

  // Salvar rating
  const { error: insertError } = await supabase
    .from('session_ratings')
    .insert({
      session_id: ratedSession.id,
      user_id: userId,
      rating: rating
    });

  if (insertError) {
    console.error('❌ Error saving session rating:', insertError);
    return { handled: false };
  }

  // Gerar resposta baseada no rating
  let response: string;
  if (rating >= 4) {
    response = `Que bom que você gostou! 💜 Fico muito feliz em saber. Obrigada pelo feedback!`;
  } else if (rating === 3) {
    response = `Obrigada pelo feedback! 💜 Vou me esforçar pra melhorar cada vez mais.`;
  } else {
    response = `Obrigada por me contar. 💜 Me desculpa se não foi tão bom quanto você esperava. Vou trabalhar pra melhorar!`;
  }

  console.log(`✅ Session rating saved: ${rating} stars for session ${ratedSession.id}`);

  return { handled: true, response };
}

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
    
    // Ignore own messages
    if (payload.isFromMe) {
      console.log('⏭️ Ignoring own message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'own_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ignore group messages
    if (payload.isGroup) {
      console.log('⏭️ Ignoring group message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'group_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate phone
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
    // SUPABASE INIT & DEDUPLICATION
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
    // PROCESS MESSAGE CONTENT
    // ========================================================================
    let messageText = payload.text;
    let isAudioMessage = false;

    // Handle audio messages - transcribe them
    if (payload.hasAudio && !messageText) {
      console.log('🎤 Audio message detected, transcribing...');
      const transcription = await transcribeAudio(payload.audioUrl!);
      
      if (transcription) {
        messageText = transcription;
        isAudioMessage = true;
        console.log('✅ Audio transcribed:', messageText);
      }
    }

    // Handle image messages with caption
    if (payload.hasImage && payload.imageCaption) {
      messageText = payload.imageCaption;
      console.log('🖼️ Image with caption:', messageText);
    }

    // Ignore empty messages (but allow audio that failed transcription)
    if (!messageText && !payload.hasAudio) {
      console.log('⏭️ Missing message content');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing_data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // USER LOOKUP (Busca flexível com variações de telefone)
    // ========================================================================
    const phoneVariations = getPhoneVariations(payload.cleanPhone);
    console.log(`🔍 Searching for phone variations: ${phoneVariations.join(', ')}`);
    
    const { data: profileResults, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('phone', phoneVariations)
      .order('status', { ascending: true }) // 'active' comes before 'trial'
      .order('updated_at', { ascending: false })
      .limit(1);

    if (profileError) {
      console.error('❌ Error looking up profile:', profileError);
      return new Response(JSON.stringify({ status: 'profile_lookup_error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profile = profileResults?.[0];

    if (!profile) {
      console.log('⚠️ User not found for phone variations:', phoneVariations.join(', '));
      return new Response(JSON.stringify({ status: 'user_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-correção: atualizar telefone para o formato real do WhatsApp se diferente
    if (profile.phone !== payload.cleanPhone) {
      console.log(`📱 Auto-correcting phone: ${profile.phone} -> ${payload.cleanPhone}`);
      await supabase
        .from('profiles')
        .update({ phone: payload.cleanPhone })
        .eq('id', profile.id);
      profile.phone = payload.cleanPhone; // Atualizar na memória também
    }

    console.log(`👤 Found user: ${profile.name} (${profile.user_id}), status: ${profile.status}, instance: ${profile.whatsapp_instance_id || 'env-default'}`);

    // ========================================================================
    // SUBSCRIPTION STATUS CHECK - Bloquear usuários sem assinatura ativa
    // ========================================================================
    const blockedStatuses = ['canceled', 'inactive', 'paused'];
    if (blockedStatuses.includes(profile.status || '')) {
      console.log(`🚫 User ${profile.user_id} blocked: status is '${profile.status}'`);

      // Buscar config da instância para enviar mensagem
      let instanceConfig = undefined;
      if (profile.whatsapp_instance_id) {
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('zapi_instance_id, zapi_token, zapi_client_token')
          .eq('id', profile.whatsapp_instance_id)
          .single();
        if (inst) {
          instanceConfig = { instanceId: inst.zapi_instance_id, token: inst.zapi_token, clientToken: inst.zapi_client_token };
        }
      }

      const statusMessages: Record<string, string> = {
        canceled: `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua assinatura foi encerrada. Sinto sua falta!\n\nSe quiser voltar a conversar comigo, é só assinar novamente:\n👉 https://olaaura.com.br/checkout\n\nVou adorar te receber de volta! ✨`,
        inactive: `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua conta está inativa no momento.\n\nPara continuarmos nossas conversas, assine um plano:\n👉 https://olaaura.com.br/checkout\n\nEstou aqui te esperando! ✨`,
        paused: `Oi, ${profile.name || 'querido(a)'}! 💜\n\nSua assinatura está pausada no momento.\n\nQuando estiver pronto(a) para voltar, é só reativar:\n👉 https://olaaura.com.br/checkout\n\nEstarei aqui quando você precisar! ✨`,
      };

      const msg = statusMessages[profile.status!];
      await sendTextMessage(payload.cleanPhone!, msg, undefined, instanceConfig);

      return new Response(JSON.stringify({ success: true, action: 'subscription_blocked', status: profile.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // INTERRUPTION SYSTEM - Atualizar estado com ID da mensagem atual
    // ========================================================================
    const currentMessageId = payload.messageId || `msg_${Date.now()}`;
    
    await supabase
      .from('aura_response_state')
      .upsert({
        user_id: profile.user_id,
        last_user_message_id: currentMessageId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    
    // Verificar se AURA está no meio de uma resposta
    const { data: responseState } = await supabase
      .from('aura_response_state')
      .select('*')
      .eq('user_id', profile.user_id)
      .maybeSingle();

    if (responseState?.is_responding) {
      console.log('⏸️ AURA está respondendo - aguardando interrupção ser processada...');
      // Aguardar um pouco para o outro processo perceber a interrupção
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Buscar pending_content que pode ter sido salvo de uma interrupção anterior
    const pendingContent = responseState?.pending_content || null;
    const pendingContext = responseState?.pending_context || null;
    
    if (pendingContent) {
      console.log(`📦 Found pending content from interrupted response: ${pendingContent.substring(0, 100)}...`);
    }

    // ========================================================================
    // TRIAL LIMIT CHECK
    // ========================================================================
    if (profile.status === 'trial') {
      const trialCount = profile.trial_conversations_count || 0;
      
      // Check if this is a response to a nudge (free message)
      const isNudgeResponse = profile.trial_nudge_active === true;
      
      if (isNudgeResponse) {
        // Apply 3-message bonus: reduce counter so user has breathing room
        const bonusCount = trialCount >= 3 ? trialCount - 3 : 0;
        console.log(`🎁 Nudge response detected — applying 3-msg bonus (count ${trialCount} → ${bonusCount})`);
        await supabase
          .from('profiles')
          .update({ trial_nudge_active: false, trial_conversations_count: bonusCount })
          .eq('user_id', profile.user_id);
        // Update local profile so limit check below uses the new value
        profile.trial_conversations_count = bonusCount;
      }
      
      // Re-read count after potential bonus
      const effectiveTrialCount = profile.trial_conversations_count || 0;
      
      // Se já passou do limite (5+ mensagens), bloquear
      if (trialCount >= 5) {
        console.log(`🚫 Trial limit reached for user ${profile.user_id}, count: ${trialCount}`);
        
        const limitMessage = `Oi, ${profile.name}! 💜

Suas 5 conversas grátis acabaram.

Foi muito bom te conhecer! Se você quiser continuar essa jornada comigo, escolha um plano:

👉 https://olaaura.com.br/checkout

Vou ficar esperando você voltar. 🤗`;
        
        const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
        await sendTextMessage(payload.cleanPhone, limitMessage, undefined, instanceConfig);
        
        return new Response(JSON.stringify({ status: 'trial_limit_reached' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Incrementar contador ONLY if not a nudge response
      if (!isNudgeResponse) {
        const newCount = trialCount + 1;
        await supabase
          .from('profiles')
          .update({ trial_conversations_count: newCount })
          .eq('user_id', profile.user_id);
        
        console.log(`📊 Trial conversation ${newCount}/5 for user ${profile.user_id}`);
        profile.trial_conversations_count = newCount;
        
        // Schedule trial closing message after 5th conversation
        if (newCount === 5) {
          try {
            const closeAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
            await supabase.from('scheduled_tasks').insert({
              user_id: profile.user_id,
              task_type: 'trial_closing',
              execute_at: closeAt,
              payload: {},
              status: 'pending',
            });
            console.log(`⏰ Scheduled trial_closing for 2 min after 5th conversation`);
          } catch (e) {
            console.warn('⚠️ Failed to schedule trial_closing:', e);
          }
        }
      } else {
        // Keep current count for agent context
        profile.trial_conversations_count = trialCount;
      }
    }
    // ========================================================================
    // RESET FOLLOW-UP COUNT - Usuário mandou mensagem, reativar follow-ups
    // ========================================================================
    await supabase
      .from('conversation_followups')
      .update({ 
        followup_count: 0, 
        last_user_message_at: new Date().toISOString() 
      })
      .eq('user_id', profile.user_id);
    console.log(`🔄 Follow-up count reset for user ${profile.user_id}`);

    // ========================================================================
    // HANDLE FAILED AUDIO TRANSCRIPTION
    // ========================================================================
    if (payload.hasAudio && !messageText) {
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(
        payload.cleanPhone,
        "Desculpa, não consegui ouvir seu áudio direito. 😅 Pode me mandar por texto ou tentar gravar de novo?",
        undefined,
        instanceConfig
      );
      
      return new Response(JSON.stringify({ status: 'audio_transcription_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // CHECK TIME CAPSULE STATE (Cápsula do Tempo)
    // ========================================================================
    const capsuleState = profile.awaiting_time_capsule;
    
    if (capsuleState === 'awaiting_audio' || capsuleState === 'awaiting_confirmation') {
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      
      if (capsuleState === 'awaiting_audio') {
        if (payload.hasAudio && payload.audioUrl) {
          // Salvar áudio temporariamente e pedir confirmação
          await supabase.from('profiles').update({
            awaiting_time_capsule: 'awaiting_confirmation',
            pending_capsule_audio_url: payload.audioUrl,
          }).eq('user_id', profile.user_id);

          const confirmMsg = `Recebi seu áudio! 🎙️ Ficou do jeito que você queria?\n\nSe quiser regravar, manda outro áudio. Se tiver bom, me diz "pode guardar" 💜`;
          await sendTextMessage(payload.cleanPhone, confirmMsg, undefined, instanceConfig);

          await supabase.from('messages').insert([
            { user_id: profile.user_id, role: 'user', content: messageText || '[áudio para cápsula do tempo]' },
            { user_id: profile.user_id, role: 'assistant', content: confirmMsg },
          ]);

          return new Response(JSON.stringify({ status: 'capsule_audio_received' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Se mandou texto em vez de áudio, lembrar gentilmente
        const reminderMsg = `Manda um áudio pra eu guardar sua voz! 🎙️ Quando quiser desistir, é só dizer "deixa pra lá" 💜`;
        await sendTextMessage(payload.cleanPhone, reminderMsg, undefined, instanceConfig);
        await supabase.from('messages').insert([
          { user_id: profile.user_id, role: 'user', content: messageText },
          { user_id: profile.user_id, role: 'assistant', content: reminderMsg },
        ]);
        return new Response(JSON.stringify({ status: 'capsule_awaiting_audio_reminder' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (capsuleState === 'awaiting_confirmation') {
        // Se mandou outro áudio, substituir o pendente
        if (payload.hasAudio && payload.audioUrl) {
          await supabase.from('profiles').update({
            pending_capsule_audio_url: payload.audioUrl,
          }).eq('user_id', profile.user_id);

          const replaceMsg = `Troquei o áudio! 🎙️ Esse ficou bom? Me diz "pode guardar" quando tiver certeza 💜`;
          await sendTextMessage(payload.cleanPhone, replaceMsg, undefined, instanceConfig);
          await supabase.from('messages').insert([
            { user_id: profile.user_id, role: 'user', content: messageText || '[novo áudio para cápsula]' },
            { user_id: profile.user_id, role: 'assistant', content: replaceMsg },
          ]);
          return new Response(JSON.stringify({ status: 'capsule_audio_replaced' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const lowerMsg = (messageText || '').toLowerCase().trim();

        // Cancelamento
        if (/deixa|cancela|desist|não quero|nao quero|esquece|para|parar/i.test(lowerMsg)) {
          await supabase.from('profiles').update({
            awaiting_time_capsule: null,
            pending_capsule_audio_url: null,
          }).eq('user_id', profile.user_id);

          const cancelMsg = `Tudo bem! Quando quiser gravar uma cápsula do tempo, é só falar 💜`;
          await sendTextMessage(payload.cleanPhone, cancelMsg, undefined, instanceConfig);
          await supabase.from('messages').insert([
            { user_id: profile.user_id, role: 'user', content: messageText },
            { user_id: profile.user_id, role: 'assistant', content: cancelMsg },
          ]);
          return new Response(JSON.stringify({ status: 'capsule_cancelled' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Confirmação
        if (/sim|pode|guard|confirm|ficou|bom|bora|manda|salv|tá (bom|ótimo|perfeito)|ta (bom|otimo|perfeito)|perfeito|certeza|isso/i.test(lowerMsg)) {
          const pendingUrl = profile.pending_capsule_audio_url;
          if (!pendingUrl) {
            // Edge case: URL perdida
            await supabase.from('profiles').update({
              awaiting_time_capsule: null,
              pending_capsule_audio_url: null,
            }).eq('user_id', profile.user_id);
            // Let flow continue normally
          } else {
            const deliverAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 dias
            
            // Transcrever o áudio para registro
            let transcription: string | null = null;
            try {
              transcription = await transcribeAudio(pendingUrl);
            } catch (e) {
              console.warn('⚠️ Could not transcribe capsule audio:', e);
            }

            await supabase.from('time_capsules').insert({
              user_id: profile.user_id,
              audio_url: pendingUrl,
              transcription,
              deliver_at: deliverAt.toISOString(),
              context_message: `Cápsula gravada em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            });

            await supabase.from('profiles').update({
              awaiting_time_capsule: null,
              pending_capsule_audio_url: null,
            }).eq('user_id', profile.user_id);

            const deliverDateStr = deliverAt.toLocaleDateString('pt-BR', { 
              day: '2-digit', month: '2-digit', year: 'numeric', 
              timeZone: 'America/Sao_Paulo' 
            });
            const savedMsg = `Guardei sua mensagem com carinho! 💜✨\n\nVou te enviar de volta no dia ${deliverDateStr}. Vai ser uma surpresa especial do seu eu de hoje pro seu eu do futuro 🫶`;
            await sendTextMessage(payload.cleanPhone, savedMsg, undefined, instanceConfig);
            await supabase.from('messages').insert([
              { user_id: profile.user_id, role: 'user', content: messageText },
              { user_id: profile.user_id, role: 'assistant', content: savedMsg },
            ]);

            console.log(`✅ Time capsule saved for user ${profile.user_id}, deliver_at: ${deliverDateStr}`);
            return new Response(JSON.stringify({ status: 'capsule_saved' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Mensagem não reconhecida durante confirmação — continuar fluxo normal
        // (pode ser que o usuário mudou de assunto)
        await supabase.from('profiles').update({
          awaiting_time_capsule: null,
          pending_capsule_audio_url: null,
        }).eq('user_id', profile.user_id);
        console.log('⚠️ Capsule confirmation state cleared - unrecognized response, continuing normal flow');
      }
    }

    // Timeout: limpar flags pendentes há mais de 24h
    if (capsuleState && profile.updated_at) {
      const updatedAt = new Date(profile.updated_at).getTime();
      const hoursAgo = (Date.now() - updatedAt) / (1000 * 60 * 60);
      if (hoursAgo > 24) {
        console.log(`🕐 Capsule timeout (${Math.round(hoursAgo)}h), clearing flags`);
        await supabase.from('profiles').update({
          awaiting_time_capsule: null,
          pending_capsule_audio_url: null,
        }).eq('user_id', profile.user_id);
      }
    }

    // ========================================================================
    // CHECK FOR SESSION RATING (Quick reply handling)
    // ========================================================================
    const ratingResult = await handleSessionRating(supabase, profile.user_id, messageText);
    if (ratingResult.handled && ratingResult.response) {
      console.log(`✅ Session rating handled for user ${profile.user_id}`);
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(payload.cleanPhone, ratingResult.response, undefined, instanceConfig);
      
      // Salvar mensagens no histórico
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'user',
        content: messageText
      });
      
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'assistant',
        content: ratingResult.response
      });
      
      return new Response(JSON.stringify({ status: 'rating_handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // CHECK FOR SESSION CONFIRMATION (Quick reply handling)
    // ========================================================================
    const confirmationResult = await handleSessionConfirmation(supabase, profile.user_id, messageText);
    if (confirmationResult.handled && confirmationResult.response) {
      console.log(`✅ Session confirmation handled for user ${profile.user_id}`);
      const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(payload.cleanPhone, confirmationResult.response, undefined, instanceConfig);
      
      // Salvar mensagens no histórico
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'user',
        content: messageText
      });
      
      await supabase.from('messages').insert({
        user_id: profile.user_id,
        role: 'assistant',
        content: confirmationResult.response
      });
      
      return new Response(JSON.stringify({ status: 'confirmation_handled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // DELAY INICIAL - Simula que AURA está "lendo" a mensagem
    // ========================================================================
    const initialDelay = 1500 + Math.random() * 2000; // 1.5-3.5 segundos
    console.log(`⏳ Initial thinking delay: ${Math.round(initialDelay)}ms`);
    await new Promise(resolve => setTimeout(resolve, initialDelay));

    // ========================================================================
    // DEBOUNCE CHECK - Verificar se outra mensagem chegou durante o delay
    // ========================================================================
    const { data: debounceCheck } = await supabase
      .from('aura_response_state')
      .select('last_user_message_id')
      .eq('user_id', profile.user_id)
      .maybeSingle();

    if (debounceCheck?.last_user_message_id && 
        debounceCheck.last_user_message_id !== currentMessageId) {
      console.log(`⏭️ DEBOUNCE: Msg mais recente detectada (${debounceCheck.last_user_message_id} != ${currentMessageId}). Abortando.`);
      return new Response(JSON.stringify({ status: 'debounced', reason: 'newer_message_exists' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // CALL AURA AGENT
    // ========================================================================
    console.log(`📱 Processing message from: ${payload.cleanPhone.substring(0, 4)}***`);
    console.log(`💬 Message length: ${messageText.length} chars`);
    console.log(`🎤 Is audio message: ${isAudioMessage}`);

    const agentResponse = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        message: messageText,
        user_id: profile.user_id,
        phone: payload.cleanPhone,
        is_audio_message: isAudioMessage,
        trial_count: profile.status === 'trial' ? profile.trial_conversations_count : null,
        pending_content: pendingContent,
        pending_context: pendingContext,
      }),
    });
    
    // Limpar pending_content após passar para o agent
    if (pendingContent) {
      await supabase
        .from('aura_response_state')
        .update({ pending_content: null, pending_context: null })
        .eq('user_id', profile.user_id);
    }

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error('❌ aura-agent error:', errorText);
      throw new Error(`Agent error: ${errorText}`);
    }

    const agentData = await agentResponse.json();
    console.log('🤖 Agent response:', JSON.stringify(agentData, null, 2));

    // ========================================================================
    // UPDATE CONVERSATION TRACKING
    // Agora salva informações mais ricas para follow-ups contextuais
    // ========================================================================
    const now = new Date().toISOString();
    const conversationStatus = agentData.conversation_status || 'neutral';
    const isSessionActive = agentData.session_active === true;
    
    // CRÍTICO: Ativar follow-up SEMPRE durante sessões ativas, independente da tag
    const shouldEnableFollowup = conversationStatus === 'awaiting' || isSessionActive;
    
    // Não sobrescrever o contexto se já existir um tema bom
    // O conversation-followup vai extrair o tema via IA se necessário
    const { data: existingFollowup } = await supabase
      .from('conversation_followups')
      .select('conversation_context')
      .eq('user_id', profile.user_id)
      .maybeSingle();
    
    // Só atualizar contexto se não tiver um tema bom já salvo
    const existingContext = existingFollowup?.conversation_context;
    const hasGoodContext = existingContext && existingContext.length > 15 && 
      !['ok', 'legal', 'beleza', 'sim', 'não'].includes(existingContext.toLowerCase());
    
    await supabase
      .from('conversation_followups')
      .upsert({
        user_id: profile.user_id,
        last_user_message_at: shouldEnableFollowup ? now : null,
        // Quando conversa encerrada: setar followup_count alto para bloquear follow-ups
        // Quando ativando: resetar para 0
        followup_count: shouldEnableFollowup ? 0 : 99,
        // Preservar contexto bom existente, senão usar a mensagem atual
        conversation_context: shouldEnableFollowup 
          ? (hasGoodContext ? existingContext : messageText.substring(0, 200))
          : null,
      }, {
        onConflict: 'user_id',
      });
    console.log(`📍 Conversation tracking updated - status: ${conversationStatus}, sessionActive: ${isSessionActive}, followup: ${shouldEnableFollowup}, preservedContext: ${hasGoodContext}`);

    // ========================================================================
    // SEND RESPONSE MESSAGES (com verificação de interrupção)
    // ========================================================================
    
    // Marcar que AURA está respondendo
    await supabase
      .from('aura_response_state')
      .upsert({
        user_id: profile.user_id,
        is_responding: true,
        response_started_at: new Date().toISOString(),
        last_user_message_id: currentMessageId
      }, { onConflict: 'user_id' });
    
    let wasInterrupted = false;
    let interruptedAtIndex = -1;
    
    for (let i = 0; i < (agentData.messages || []).length; i++) {
      const msg = agentData.messages[i];
      
      // ⚠️ VERIFICAR INTERRUPÇÃO antes de cada bubble (exceto o primeiro)
      if (i > 0) {
        const { data: currentState } = await supabase
          .from('aura_response_state')
          .select('last_user_message_id')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        // CORREÇÃO: Só detectar interrupção se:
        // 1. O estado existe no banco
        // 2. O last_user_message_id existe e é diferente do atual
        // Isso evita falsos positivos quando o registro é null/undefined
        const hasNewMessage = currentState?.last_user_message_id && 
                              currentState.last_user_message_id !== currentMessageId;
        
        console.log(`🔍 Interruption check [${i}/${agentData.messages.length}]: local=${currentMessageId}, db=${currentState?.last_user_message_id}, match=${!hasNewMessage}`);
        
        if (hasNewMessage) {
          console.log(`🛑 INTERRUPÇÃO DETECTADA! Parando envio de ${agentData.messages.length - i} bubbles restantes.`);
          console.log(`   Mensagem original: ${currentMessageId}`);
          console.log(`   Nova mensagem: ${currentState.last_user_message_id}`);
          wasInterrupted = true;
          interruptedAtIndex = i;
          break; // Sai do loop imediatamente
        }
      }
      
      // Add delay between messages for natural feel (skip delay for first message)
      if (i > 0 && msg.delay) {
        // Delay entre bubbles já inclui randomização do aura-agent
        const actualDelay = Math.min(msg.delay, 5000); // Cap at 5 seconds max
        console.log(`⏱️ Waiting ${actualDelay}ms before next message...`);
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }

      let responseText = msg.text || msg.content || '';
      
      // Remove any internal tags that might have leaked through
      responseText = responseText
        .replace(/\[AGUARDANDO_RESPOSTA\]/gi, '')
        .replace(/\[CONVERSA_CONCLUIDA\]/gi, '')
        .replace(/\[MODO_AUDIO\]/gi, '')
        .replace(/\[INSIGHTS\].*?\[\/INSIGHTS\]/gis, '')
        .replace(/\[AGENDAR_TAREFA:.*?\]/gi, '')
        .replace(/\[CANCELAR_TAREFA:\w+\]/gi, '')
        .trim();
      
      if (!responseText) {
        console.log('⏭️ Skipping empty message');
        continue;
      }

      // Check if this message should be sent as audio
      if (msg.isAudio) {
        console.log(`🎙️ Generating audio for: ${responseText.substring(0, 50)}...`);
        
        const audioContent = await generateTTS(responseText);
        
        if (audioContent) {
          const instanceConfig = await getInstanceConfigForUser(supabase, profile.user_id);
          const audioResult = await sendAudioMessage(payload.cleanPhone, audioContent, instanceConfig);
          if (audioResult.success) {
            continue; // Skip text send
          }
          console.log('⚠️ Audio send failed, falling back to text');
        }
      }

      // Calcular typing delay proporcional ao tamanho do bubble
      // Bubbles curtos (< 50 chars) = 1-2s, médios = 2-4s, longos = 4-6s
      // Mais natural: simula digitação real
      let typingSeconds: number;
      if (responseText.length < 50) {
        // Mensagens curtas: 1-2 segundos (digitação rápida)
        typingSeconds = Math.max(1, Math.ceil(responseText.length / 30));
      } else if (responseText.length < 100) {
        // Mensagens médias: 2-3 segundos
        typingSeconds = Math.ceil(responseText.length / 40);
      } else {
        // Mensagens longas: 3-6 segundos
        typingSeconds = Math.min(Math.ceil(responseText.length / 35), 6);
      }
      
      // Send as text message with typing indicator
      console.log(`📤 Sending text (${responseText.length} chars, ${typingSeconds}s typing): ${responseText.substring(0, 50)}...`);
      const instanceConfig2 = await getInstanceConfigForUser(supabase, profile.user_id);
      await sendTextMessage(payload.cleanPhone, responseText, typingSeconds, instanceConfig2);
    }
    
    // ========================================================================
    // FINALIZAÇÃO - Salvar pending content se foi interrompido
    // ========================================================================
    if (wasInterrupted && interruptedAtIndex > 0) {
      // Coletar bubbles que não foram enviados
      const pendingMessages = agentData.messages
        .slice(interruptedAtIndex)
        .map((m: any) => m.text || m.content || '')
        .filter((t: string) => t.trim())
        .join('\n\n');
      
      if (pendingMessages) {
        console.log(`📦 Salvando ${agentData.messages.length - interruptedAtIndex} bubbles pendentes para avaliação posterior`);
        
        await supabase
          .from('aura_response_state')
          .update({
            is_responding: false,
            pending_content: pendingMessages,
            pending_context: messageText.substring(0, 200), // Contexto da pergunta original
          })
          .eq('user_id', profile.user_id);
      }
    } else {
      // Marcar que AURA terminou de responder (sem interrupção)
      await supabase
        .from('aura_response_state')
        .update({ is_responding: false })
        .eq('user_id', profile.user_id);
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
    console.error('❌ Webhook error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing the request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
