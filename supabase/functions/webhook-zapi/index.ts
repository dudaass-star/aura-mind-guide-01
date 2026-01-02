import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateWebhookAuth,
  parseZapiPayload,
  sendTextMessage,
  sendAudioMessage,
  cleanPhoneNumber,
  isValidPhoneNumber,
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
    // USER LOOKUP
    // ========================================================================
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', payload.cleanPhone)
      .single();

    if (profileError || !profile) {
      console.log('⚠️ User not found for phone:', payload.cleanPhone);
      return new Response(JSON.stringify({ status: 'user_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`👤 Found user: ${profile.name} (${profile.user_id})`);

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
    // ========================================================================
    const now = new Date().toISOString();
    const conversationStatus = agentData.conversation_status || 'neutral';
    const shouldEnableFollowup = conversationStatus === 'awaiting';
    
    await supabase
      .from('conversation_followups')
      .upsert({
        user_id: profile.user_id,
        last_user_message_at: shouldEnableFollowup ? now : null,
        followup_count: 0,
        conversation_context: shouldEnableFollowup ? messageText.substring(0, 200) : null,
      }, {
        onConflict: 'user_id',
      });
    console.log(`📍 Conversation tracking updated - status: ${conversationStatus}, followup: ${shouldEnableFollowup}`);

    // ========================================================================
    // SEND RESPONSE MESSAGES
    // ========================================================================
    for (let i = 0; i < (agentData.messages || []).length; i++) {
      const msg = agentData.messages[i];
      
      // Add delay between messages for natural feel (skip delay for first message)
      if (i > 0 && msg.delay) {
        const actualDelay = Math.min(msg.delay, 6000); // Cap at 6 seconds max
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

      // Send as text message
      console.log(`📤 Sending text: ${responseText.substring(0, 50)}...`);
      await sendTextMessage(payload.cleanPhone, responseText);
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
