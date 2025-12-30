import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para gerar áudio via TTS
async function generateAudio(text: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log('🎙️ Generating audio for text:', text.substring(0, 50) + '...');

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
    return data.audioContent; // base64 encoded audio
  } catch (error) {
    console.error('❌ Error generating audio:', error);
    return null;
  }
}

// Função para enviar áudio via Z-API
async function sendAudioMessage(phone: string, audioBase64: string): Promise<any> {
  const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
  const zapiToken = Deno.env.get('ZAPI_TOKEN')!;
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

  console.log('🔊 Sending audio message to', phone);

  const response = await fetch(
    `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-audio`,
    {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Client-Token': zapiClientToken,
      },
      body: JSON.stringify({
        phone: phone,
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        waveform: true,  // Para aparecer como mensagem de voz
        viewOnce: false,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Z-API audio error:', errorText);
    throw new Error(`Z-API audio error: ${errorText}`);
  }

  return await response.json();
}

// Função para enviar texto via Z-API
async function sendTextMessage(phone: string, message: string): Promise<any> {
  const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
  const zapiToken = Deno.env.get('ZAPI_TOKEN')!;
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;

  const response = await fetch(
    `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/send-text`,
    {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Client-Token': zapiClientToken,
      },
      body: JSON.stringify({
        phone: phone,
        message: message,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Z-API text error:', errorText);
    throw new Error(`Z-API text error: ${errorText}`);
  }

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate service role authentication (internal function only)
    const authHeader = req.headers.get('Authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(supabaseServiceKey!)) {
      console.warn('🚫 Unauthorized request to send-zapi-message');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { phone, message, user_id, isAudio = false } = await req.json();
    console.log(`📤 Sending ${isAudio ? 'audio' : 'text'} message to ${phone}`);

    if (!phone || !message) {
      throw new Error('Phone and message are required');
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    let result;

    if (isAudio) {
      // Gerar áudio via TTS
      const audioBase64 = await generateAudio(message);
      
      if (audioBase64) {
        // Enviar como áudio
        result = await sendAudioMessage(cleanPhone, audioBase64);
        console.log('✅ Audio message sent:', result);
      } else {
        // Fallback para texto se falhar a geração de áudio
        console.log('⚠️ Audio generation failed, falling back to text');
        result = await sendTextMessage(cleanPhone, message);
        console.log('✅ Text message sent (fallback):', result);
      }
    } else {
      // Enviar como texto
      result = await sendTextMessage(cleanPhone, message);
      console.log('✅ Text message sent:', result);
    }

    // Save message to history
    if (user_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey!);

      await supabase.from('messages').insert({
        user_id: user_id,
        role: 'assistant',
        content: message,
      });
    }

    return new Response(JSON.stringify({ status: 'sent', zapiResponse: result, type: isAudio ? 'audio' : 'text' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Send error:', error);
    // Return generic error message, log full details server-side
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
