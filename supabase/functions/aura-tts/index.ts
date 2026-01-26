import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configurações da voz Erinome para AURA
const AURA_VOICE_CONFIG = {
  languageCode: "pt-BR",
  name: "Erinome",
  modelName: "gemini-2.5-pro-tts",
  speakingRate: 1.20,
  stylePrompt: "O tom é acolhedor, empático e calmo, mas profissional e confiante. Nada robótico. Articulação clara, timbre suave, fala lenta e gentilmente, como uma terapeuta ou uma amiga próxima oferecendo apoio"
};

// Função para gerar áudio via Google Gemini TTS
async function generateGoogleTTS(text: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    console.log('🎙️ Attempting Google Gemini TTS...');
    
    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          text: text,
          prompt: AURA_VOICE_CONFIG.stylePrompt
        },
        voice: {
          languageCode: AURA_VOICE_CONFIG.languageCode,
          name: AURA_VOICE_CONFIG.name,
          modelName: AURA_VOICE_CONFIG.modelName
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: AURA_VOICE_CONFIG.speakingRate
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google TTS error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (!data.audioContent) {
      console.error("Google TTS: No audio content in response");
      return null;
    }

    // Google retorna base64, decodificar para bytes
    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('✅ Google Gemini TTS success:', bytes.byteLength, 'bytes');
    return bytes;
  } catch (error) {
    console.error("Google TTS exception:", error);
    return null;
  }
}

// Fallback para OpenAI TTS
async function generateOpenAITTS(text: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    console.log('🔄 Falling back to OpenAI TTS...');
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'shimmer',
        response_format: 'mp3',
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI TTS error:", response.status, errorText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log('✅ OpenAI TTS fallback success:', arrayBuffer.byteLength, 'bytes');
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error("OpenAI TTS exception:", error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate service role authentication (internal function only)
    const authHeader = req.headers.get('Authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!authHeader || !authHeader.includes(supabaseServiceKey!)) {
      console.warn('🚫 Unauthorized request to aura-tts');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!GOOGLE_API_KEY && !OPENAI_API_KEY) {
      throw new Error('No TTS API keys configured');
    }

    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    console.log("TTS request:", { textLength: text.length });

    // Limite de caracteres: 2000 para Google (suporta até 4000), 500 para OpenAI fallback
    const maxChars = GOOGLE_API_KEY ? 2000 : 500;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;

    let audioBytes: Uint8Array | null = null;
    let provider = 'none';

    // Tentar Google Gemini TTS primeiro
    if (GOOGLE_API_KEY) {
      audioBytes = await generateGoogleTTS(truncatedText, GOOGLE_API_KEY);
      if (audioBytes) {
        provider = 'google-gemini';
      }
    }

    // Fallback para OpenAI se Google falhar
    if (!audioBytes && OPENAI_API_KEY) {
      const fallbackText = text.length > 500 ? text.substring(0, 500) + '...' : text;
      audioBytes = await generateOpenAITTS(fallbackText, OPENAI_API_KEY);
      if (audioBytes) {
        provider = 'openai-fallback';
      }
    }

    if (!audioBytes) {
      throw new Error('Failed to generate audio from all providers');
    }

    // Converter para base64
    const base64Audio = base64Encode(audioBytes.buffer as ArrayBuffer);

    console.log("TTS generated:", { 
      audioSize: audioBytes.byteLength,
      provider: provider,
      voice: provider === 'google-gemini' ? 'Erinome' : 'shimmer'
    });

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: 'mp3',
        voice: provider === 'google-gemini' ? 'Erinome' : 'shimmer',
        provider: provider
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error("Error in aura-tts:", error);
    // Return generic error message, log full details server-side
    return new Response(
      JSON.stringify({ error: 'Failed to generate audio' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
