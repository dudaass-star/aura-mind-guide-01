import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateWebhookAuth,
  parseZapiPayload,
  sendTextMessage,
  sendAudioMessage,
  cleanPhoneNumber,
  isValidPhoneNumber,
  getPhoneVariations,
} from "../_shared/zapi-client.ts";

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
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .in('phone', phoneVariations)
      .maybeSingle();

    if (profileError || !profile) {
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

    console.log(`👤 Found user: ${profile.name} (${profile.user_id}), status: ${profile.status}`);

    // ========================================================================
    // TRIAL LIMIT CHECK
    // ========================================================================
    if (profile.status === 'trial') {
      const trialCount = profile.trial_conversations_count || 0;
      
      // Se já passou do limite (6+ mensagens), bloquear
      if (trialCount >= 5) {
        console.log(`🚫 Trial limit reached for user ${profile.user_id}, count: ${trialCount}`);
        
        const limitMessage = `Oi, ${profile.name}! 💜

Suas 5 conversas grátis acabaram.

Foi muito bom te conhecer! Se você quiser continuar essa jornada comigo, escolha um plano:

👉 https://olaaura.com.br/checkout

Vou ficar esperando você voltar. 🤗`;
        
        await sendTextMessage(payload.cleanPhone, limitMessage);
        
        return new Response(JSON.stringify({ status: 'trial_limit_reached' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Incrementar contador de conversas do trial
      const newCount = trialCount + 1;
      await supabase
        .from('profiles')
        .update({ trial_conversations_count: newCount })
        .eq('user_id', profile.user_id);
      
      console.log(`📊 Trial conversation ${newCount}/5 for user ${profile.user_id}`);
      
      // Passar info do trial para o agent
      profile.trial_conversations_count = newCount;
    }
    // ========================================================================
    // HANDLE FAILED AUDIO TRANSCRIPTION
    // ========================================================================
    if (payload.hasAudio && !messageText) {
      await sendTextMessage(
        payload.cleanPhone,
        "Desculpa, não consegui ouvir seu áudio direito. 😅 Pode me mandar por texto ou tentar gravar de novo?"
      );
      
      return new Response(JSON.stringify({ status: 'audio_transcription_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========================================================================
    // CHECK FOR SESSION RATING (Quick reply handling)
    // ========================================================================
    const ratingResult = await handleSessionRating(supabase, profile.user_id, messageText);
    if (ratingResult.handled && ratingResult.response) {
      console.log(`✅ Session rating handled for user ${profile.user_id}`);
      await sendTextMessage(payload.cleanPhone, ratingResult.response);
      
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
      await sendTextMessage(payload.cleanPhone, confirmationResult.response);
      
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
      }),
    });

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
        followup_count: shouldEnableFollowup ? 0 : (existingFollowup ? undefined : null), // Reset só se ativando
        // Preservar contexto bom existente, senão usar a mensagem atual
        conversation_context: shouldEnableFollowup 
          ? (hasGoodContext ? existingContext : messageText.substring(0, 200))
          : null,
      }, {
        onConflict: 'user_id',
      });
    console.log(`📍 Conversation tracking updated - status: ${conversationStatus}, sessionActive: ${isSessionActive}, followup: ${shouldEnableFollowup}, preservedContext: ${hasGoodContext}`);

    // ========================================================================
    // SEND RESPONSE MESSAGES
    // ========================================================================
    for (let i = 0; i < (agentData.messages || []).length; i++) {
      const msg = agentData.messages[i];
      
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
          const audioResult = await sendAudioMessage(payload.cleanPhone, audioContent);
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
      await sendTextMessage(payload.cleanPhone, responseText, typingSeconds);
    }

    return new Response(JSON.stringify({ 
      status: 'success', 
      messagesCount: agentData.messages?.length || 0,
      wasAudioMessage: isAudioMessage 
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
