import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configurações da voz Erinome para AURA
const AURA_VOICE_CONFIG = {
  voiceName: "Erinome",
  speakingRate: 1.20,
  // Instrução de estilo que será incluída no prompt
  stylePrompt: "O tom é acolhedor, empático e calmo, mas profissional e confiante. Nada robótico. Articulação clara, timbre suave, fala lenta e gentilmente, como uma terapeuta ou uma amiga próxima oferecendo apoio."
};

// Função para gerar áudio via Gemini API (generativelanguage.googleapis.com)
async function generateGeminiTTS(text: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    console.log('🎙️ Attempting Gemini TTS with voice:', AURA_VOICE_CONFIG.voiceName);
    
    // Combinar instrução de estilo com o texto
    const fullPrompt = `${AURA_VOICE_CONFIG.stylePrompt}\n\nDiga o seguinte texto:\n\n${text}`;
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: AURA_VOICE_CONFIG.voiceName
                }
              }
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini TTS error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    // Extrair o áudio da resposta do Gemini
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    
    if (!audioData || !audioData.data) {
      console.error("Gemini TTS: No audio data in response", JSON.stringify(data).substring(0, 500));
      return null;
    }

    // Decodificar base64 para bytes
    const binaryString = atob(audioData.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('✅ Gemini TTS success:', bytes.byteLength, 'bytes, mimeType:', audioData.mimeType);
    return bytes;
  } catch (error) {
    console.error("Gemini TTS exception:", error);
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

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      throw new Error('No TTS API keys configured');
    }

    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    console.log("TTS request:", { textLength: text.length });

    // Limite de caracteres: 2000 para Gemini, 500 para OpenAI fallback
    const maxChars = GEMINI_API_KEY ? 2000 : 500;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;

    let audioBytes: Uint8Array | null = null;
    let provider = 'none';
    let audioFormat = 'mp3';

    // Tentar Gemini TTS primeiro
    if (GEMINI_API_KEY) {
      audioBytes = await generateGeminiTTS(truncatedText, GEMINI_API_KEY);
      if (audioBytes) {
        provider = 'gemini';
        // Gemini pode retornar diferentes formatos, verificar logs para o mimeType
      }
    }

    // Fallback para OpenAI se Gemini falhar
    if (!audioBytes && OPENAI_API_KEY) {
      const fallbackText = text.length > 500 ? text.substring(0, 500) + '...' : text;
      audioBytes = await generateOpenAITTS(fallbackText, OPENAI_API_KEY);
      if (audioBytes) {
        provider = 'openai-fallback';
        audioFormat = 'mp3';
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
      voice: provider === 'gemini' ? AURA_VOICE_CONFIG.voiceName : 'shimmer'
    });

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: audioFormat,
        voice: provider === 'gemini' ? AURA_VOICE_CONFIG.voiceName : 'shimmer',
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
