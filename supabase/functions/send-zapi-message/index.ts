import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendMessage, sendAudio } from "../_shared/whatsapp-provider.ts";
import { getInstanceConfigForUser } from "../_shared/instance-helper.ts";

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

    // Get instance-specific config for this user
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey!);
    
    let zapiConfig = undefined;
    if (user_id) {
      try {
        zapiConfig = await getInstanceConfigForUser(supabase, user_id);
      } catch (e) {
        console.warn('⚠️ Could not get instance config, using env vars');
      }
    }

    const cleanPhone = cleanPhoneNumber(phone);
    let result;
    let sentType: 'audio' | 'text' = 'text';

    if (isAudio) {
      // Gerar áudio via TTS
      const audioBase64 = await generateAudio(message);
      
      if (audioBase64) {
        // Enviar como áudio
        const audioResult = await sendAudioMessage(cleanPhone, audioBase64, zapiConfig);
        if (audioResult.success) {
          result = audioResult.response;
          sentType = 'audio';
          console.log('✅ Audio message sent');
        } else {
          // Fallback para texto se falhar
          console.log('⚠️ Audio send failed, falling back to text');
          const textResult = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);
          result = textResult.response;
        }
      } else {
        // Fallback para texto se falhar a geração de áudio
        console.log('⚠️ Audio generation failed, falling back to text');
        const textResult = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);
        result = textResult.response;
      }
    } else {
      // Enviar como texto
      const textResult = await sendTextMessage(cleanPhone, message, undefined, zapiConfig);
      if (!textResult.success) {
        throw new Error(textResult.error || 'Failed to send text message');
      }
      result = textResult.response;
      console.log('✅ Text message sent');
    }

    // Save message to history
    if (user_id) {
      await supabase.from('messages').insert({
        user_id: user_id,
        role: 'assistant',
        content: message,
      });
    }

    return new Response(JSON.stringify({ status: 'sent', zapiResponse: result, type: sentType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Send error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
