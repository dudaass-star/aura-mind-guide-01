import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to transcribe audio using OpenAI Whisper
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    console.log('🎙️ Downloading audio from:', audioUrl);
    
    // Download the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error('❌ Failed to download audio:', audioResponse.status);
      return null;
    }
    
    const audioBlob = await audioResponse.blob();
    console.log('📦 Audio downloaded, size:', audioBlob.size, 'bytes');
    
    // Prepare form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt'); // Portuguese
    
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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log all headers for debugging
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      // Mask token values for security but show structure
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
        allHeaders[key] = value.substring(0, 8) + '***';
      } else {
        allHeaders[key] = value.substring(0, 50);
      }
    });
    console.log('📋 Request headers:', JSON.stringify(allHeaders, null, 2));
    
    // Validate webhook authentication - verify the request comes from Z-API
    const expectedToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const receivedToken = req.headers.get('client-token') || req.headers.get('Client-Token');
    
    console.log('🔑 Expected token (first 8 chars):', expectedToken?.substring(0, 8) + '***');
    console.log('🔑 Received token (first 8 chars):', receivedToken ? receivedToken.substring(0, 8) + '***' : 'NULL');
    console.log('🔑 Token match:', receivedToken === expectedToken);
    
    if (!expectedToken) {
      console.error('❌ ZAPI_CLIENT_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (!receivedToken || receivedToken !== expectedToken) {
      console.warn('🚫 Unauthorized webhook request - invalid or missing token');
      console.warn('🔍 Debug: receivedToken exists:', !!receivedToken);
      console.warn('🔍 Debug: tokens match:', receivedToken === expectedToken);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const payload = await req.json();
    console.log('📩 Z-API Webhook received (authenticated):', JSON.stringify(payload, null, 2));

    // Extract message data from Z-API payload
    const phone = payload.phone || payload.from;
    const isFromMe = payload.fromMe || payload.isFromMe || false;
    const messageId = payload.messageId;
    const isGroup = payload.isGroup || false;
    
    // Check for audio message
    const hasAudio = payload.audio && payload.audio.audioUrl;
    const hasImage = payload.image && payload.image.imageUrl;
    
    // Extract text message or prepare for audio transcription
    let message = payload.text?.message || payload.body || '';
    let isAudioMessage = false;

    // Ignore messages sent by the bot itself
    if (isFromMe) {
      console.log('⏭️ Ignoring own message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'own_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ignore group messages
    if (isGroup) {
      console.log('⏭️ Ignoring group message');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'group_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle audio messages - transcribe them
    if (hasAudio && !message) {
      console.log('🎤 Audio message detected, transcribing...');
      const transcription = await transcribeAudio(payload.audio.audioUrl);
      
      if (transcription) {
        message = transcription;
        isAudioMessage = true;
        console.log('✅ Audio transcribed:', message);
      } else {
        console.log('⚠️ Could not transcribe audio, sending fallback response');
        // We'll handle this after user lookup
      }
    }

    // Handle image messages with caption
    if (hasImage && payload.image.caption) {
      message = payload.image.caption;
      console.log('🖼️ Image with caption:', message);
    }

    // Ignore empty messages (but allow audio that failed transcription - we'll handle it)
    if (!message && !hasAudio) {
      console.log('⏭️ Missing message or phone');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing_data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!phone) {
      console.log('⏭️ Missing phone number');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client early for deduplication check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if we already processed this messageId (deduplication)
    if (messageId) {
      // Try to insert into dedup table - will fail if already exists (PRIMARY KEY)
      const { error: dedupError } = await supabase
        .from('zapi_message_dedup')
        .insert({ message_id: messageId, phone: phone });

      if (dedupError) {
        // If insert fails, it means we already processed this message
        console.log(`⏭️ Already processed messageId: ${messageId}`);
        return new Response(JSON.stringify({ status: 'ignored', reason: 'duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.log(`✅ New message registered: ${messageId}`);
    }

    // Clean and validate phone number (remove @c.us suffix if present)
    const rawPhone = phone.replace('@c.us', '').replace(/\D/g, '');
    
    // Validate phone: 10-15 digits (E.164 standard)
    if (!/^[0-9]{10,15}$/.test(rawPhone)) {
      console.warn('⚠️ Invalid phone format:', rawPhone.substring(0, 4) + '***');
      return new Response(JSON.stringify({ status: 'ignored', reason: 'invalid_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const cleanPhone = rawPhone;
    console.log(`📱 Processing message from: ${cleanPhone.substring(0, 4)}***`);
    console.log(`💬 Message length: ${message.length} chars`);
    console.log(`🎤 Is audio message: ${isAudioMessage}`);

    // Find user by phone
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('phone', cleanPhone)
      .single();

    if (profileError || !profile) {
      console.log('⚠️ User not found for phone:', cleanPhone);
      return new Response(JSON.stringify({ status: 'user_not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`👤 Found user: ${profile.name} (${profile.user_id})`);

    // If audio transcription failed, send a friendly message
    if (hasAudio && !message) {
      const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
      const zapiToken = Deno.env.get('ZAPI_TOKEN')!;
      const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;
      
      await fetch(
        `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Client-Token': zapiClientToken,
          },
          body: JSON.stringify({
            phone: cleanPhone,
            message: "Desculpa, não consegui ouvir seu áudio direito. 😅 Pode me mandar por texto ou tentar gravar de novo?",
          }),
        }
      );
      
      return new Response(JSON.stringify({ status: 'audio_transcription_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call the aura-agent function to process the message
    const agentResponse = await fetch(`${supabaseUrl}/functions/v1/aura-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        message: message,
        user_id: profile.user_id,
        phone: cleanPhone,
        is_audio_message: isAudioMessage, // Let the agent know this was an audio message
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error('❌ aura-agent error:', errorText);
      throw new Error(`Agent error: ${errorText}`);
    }

    const agentData = await agentResponse.json();
    console.log('🤖 Agent response:', JSON.stringify(agentData, null, 2));

    // Update conversation follow-up tracking based on conversation status
    const now = new Date().toISOString();
    const conversationStatus = agentData.conversation_status || 'neutral';
    
    // Only enable follow-ups if AURA is awaiting a response
    const shouldEnableFollowup = conversationStatus === 'awaiting';
    
    await supabase
      .from('conversation_followups')
      .upsert({
        user_id: profile.user_id,
        last_user_message_at: shouldEnableFollowup ? now : null,
        followup_count: 0,
        conversation_context: shouldEnableFollowup ? message.substring(0, 200) : null,
      }, {
        onConflict: 'user_id',
      });
    console.log(`📍 Updated conversation tracking - status: ${conversationStatus}, followup enabled: ${shouldEnableFollowup}`);

    // Send response messages via Z-API
    const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
    const zapiToken = Deno.env.get('ZAPI_TOKEN')!;
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

    for (const msg of agentData.messages || []) {
      // Add delay between messages for natural feel
      if (msg.delay) {
        await new Promise(resolve => setTimeout(resolve, Math.min(msg.delay, 3000)));
      }

      // The agent returns 'text' field, not 'content'
      let messageText = msg.text || msg.content || '';
      
      // Remove any internal tags that might have leaked through
      messageText = messageText
        .replace(/\[AGUARDANDO_RESPOSTA\]/gi, '')
        .replace(/\[CONVERSA_CONCLUIDA\]/gi, '')
        .replace(/\[MODO_AUDIO\]/gi, '')
        .replace(/\[INSIGHTS\].*?\[\/INSIGHTS\]/gis, '')
        .trim();
      
      if (!messageText) {
        console.log('⏭️ Skipping empty message');
        continue;
      }

      // Check if this message should be sent as audio
      if (msg.isAudio) {
        console.log(`🎙️ Generating audio for: ${messageText.substring(0, 50)}...`);
        
        try {
          // Generate audio via TTS
          const ttsResponse = await fetch(`${supabaseUrl}/functions/v1/aura-tts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ text: messageText, voice: 'shimmer' }),
          });

          if (ttsResponse.ok) {
            const ttsData = await ttsResponse.json();
            
            if (ttsData.audioContent) {
              // Send audio via Z-API
              console.log('🔊 Sending audio message...');
              const audioResponse = await fetch(
                `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-audio`,
                {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Client-Token': zapiClientToken,
                  },
                  body: JSON.stringify({
                    phone: cleanPhone,
                    audio: `data:audio/mpeg;base64,${ttsData.audioContent}`,
                    waveform: true,  // Para aparecer como mensagem de voz
                  }),
                }
              );

              if (audioResponse.ok) {
                console.log('✅ Audio message sent successfully');
                continue; // Skip text send
              } else {
                console.error('❌ Z-API audio error:', await audioResponse.text());
                // Fall through to send as text
              }
            }
          } else {
            console.error('❌ TTS error:', await ttsResponse.text());
          }
        } catch (audioError) {
          console.error('❌ Audio generation failed:', audioError);
        }
        
        // Fallback to text if audio fails
        console.log('⚠️ Falling back to text message');
      }

      // Send as text message
      console.log(`📤 Sending text: ${messageText.substring(0, 50)}...`);
      
      const sendResponse = await fetch(
        `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Client-Token': zapiClientToken,
          },
          body: JSON.stringify({
            phone: cleanPhone,
            message: messageText,
          }),
        }
      );

      if (!sendResponse.ok) {
        const sendError = await sendResponse.text();
        console.error('❌ Z-API send error:', sendError);
      } else {
        console.log('✅ Text message sent successfully');
      }
    }

    return new Response(JSON.stringify({ 
      status: 'success', 
      messagesCount: agentData.messages?.length || 0,
      wasAudioMessage: isAudioMessage 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    // Log full error server-side but return generic message to client
    console.error('❌ Webhook error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing the request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
