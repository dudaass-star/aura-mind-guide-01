import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const { text, voice = 'shimmer' } = await req.json();

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    console.log("TTS request:", { textLength: text.length, voice });

    // Limitar texto para evitar custos excessivos (máximo ~500 caracteres por áudio)
    const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;

    // Chamar OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1', // tts-1 é mais rápido, tts-1-hd é melhor qualidade
        input: truncatedText,
        voice: voice, // shimmer é a voz feminina suave
        response_format: 'mp3',
        speed: 1.0, // Velocidade normal
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI TTS error:", response.status, errorText);
      throw new Error(`OpenAI TTS error: ${response.status}`);
    }

    // Converter áudio para base64
    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(arrayBuffer);

    console.log("TTS generated:", { audioSize: arrayBuffer.byteLength });

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: 'mp3',
        voice: voice
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error("Error in aura-tts:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao gerar áudio' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
