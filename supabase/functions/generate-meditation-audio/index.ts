import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Inworld TTS — mesma voz usada pela Aura no chat, cadência mais lenta para meditação
const INWORLD_CONFIG = {
  voiceId: "default-m-ple0rtxdeidhocwm57qw__aura",
  modelId: "inworld-tts-1.5-max",
  speakingRate: 1.0,
  temperature: 1.0,
};

// Gera áudio MP3 de um chunk via Inworld TTS
async function generateInworldChunk(text: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId: INWORLD_CONFIG.voiceId,
        modelId: INWORLD_CONFIG.modelId,
        speakingRate: INWORLD_CONFIG.speakingRate,
        temperature: INWORLD_CONFIG.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Inworld TTS chunk error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    if (!data.audioContent) {
      console.error("Inworld TTS: resposta sem audioContent");
      return null;
    }

    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  } catch (err) {
    console.error("Inworld TTS exception:", err);
    return null;
  }
}

// Divide script em chunks de ~1200 chars para geração mais rápida
function splitScriptIntoChunks(script: string, maxChars = 1200): string[] {
  const chunks: string[] = [];
  // Split by periods followed by space or newline, or by "..."
  const sentences = script.split(/(?<=[.!?])\s+|(?<=\.\.\.)\s*/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    
    if (currentChunk.length + sentence.length + 1 > maxChars) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Concatena buffers de áudio MP3
function concatenateAudioBuffers(buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }
  
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json();
    const { meditation_id } = body;

    // For internal use - this function is called internally by batch-generate or admin tools
    // Since verify_jwt is disabled in config.toml, we allow calls with either:
    // - Service role key in Authorization header
    // - Anon key in apikey header (for internal invocations)
    // - No auth for direct testing (function is not publicly exposed)

    if (!meditation_id) {
      return new Response(JSON.stringify({ error: 'meditation_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🧘 Generating meditation audio for: ${meditation_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar meditação
    const { data: meditation, error: meditationError } = await supabase
      .from('meditations')
      .select('*')
      .eq('id', meditation_id)
      .single();

    if (meditationError || !meditation) {
      console.error('Meditation not found:', meditationError);
      return new Response(JSON.stringify({ error: 'Meditation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carregar credencial Inworld (mesma voz usada pela Aura)
    const inworldApiKey = Deno.env.get('INWORLD_API_KEY');
    if (!inworldApiKey) {
      console.error('❌ INWORLD_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Inworld credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dividir script em chunks
    const chunks = splitScriptIntoChunks(meditation.script);
    console.log(`📝 Script divided into ${chunks.length} chunks`);

    // Gerar áudio para chunks em paralelo (2 por vez para não sobrecarregar)
    const audioBuffers: Uint8Array[] = new Array(chunks.length);
    const PARALLEL_BATCH_SIZE = 2;
    
    for (let batchStart = 0; batchStart < chunks.length; batchStart += PARALLEL_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, chunks.length);
      const batchPromises: Promise<void>[] = [];
      
      for (let i = batchStart; i < batchEnd; i++) {
        console.log(`🎙️ Generating chunk ${i + 1}/${chunks.length} via Inworld (voz Aura)...`);
        batchPromises.push(
          generateInworldChunk(chunks[i], inworldApiKey)
            .then(audioBytes => {
              if (!audioBytes) {
                throw new Error(`Failed to generate audio chunk ${i + 1}`);
              }
              audioBuffers[i] = audioBytes;
            })
        );
      }
      
      try {
        await Promise.all(batchPromises);
      } catch (error) {
        console.error(`Batch ${batchStart + 1}-${batchEnd} failed:`, error);
        return new Response(JSON.stringify({ error: `Failed to generate audio batch` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Concatenar todos os chunks
    const finalAudio = concatenateAudioBuffers(audioBuffers);
    console.log(`✅ Final audio: ${finalAudio.byteLength} bytes`);

    // Log consolidado de uso TTS (Inworld)
    try {
      const totalChars = meditation.script.length;
      await supabase.from('token_usage_logs').insert({
        function_name: 'generate-meditation-audio',
        call_type: 'tts-meditation',
        model: 'inworld/aura',
        prompt_tokens: totalChars,
        completion_tokens: finalAudio.byteLength,
        total_tokens: totalChars,
        cached_tokens: 0,
      });
    } catch (logErr) {
      console.error('Failed to log TTS usage:', logErr);
    }

    // Upload para Storage
    const storagePath = `${meditation_id}/audio.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('meditations')
      .upload(storagePath, finalAudio, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(JSON.stringify({ error: 'Failed to upload audio' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Obter URL pública
    const { data: publicUrlData } = supabase.storage
      .from('meditations')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;
    console.log(`📦 Audio uploaded: ${publicUrl}`);

    // Estimar duração (aproximadamente 150 palavras por minuto para meditação lenta)
    const wordCount = meditation.script.split(/\s+/).length;
    const estimatedDurationSeconds = Math.round((wordCount / 150) * 60);

    // Salvar referência no banco
    // Primeiro, deletar áudio anterior se existir
    await supabase
      .from('meditation_audios')
      .delete()
      .eq('meditation_id', meditation_id);

    const { error: insertError } = await supabase
      .from('meditation_audios')
      .insert({
        meditation_id: meditation_id,
        storage_path: storagePath,
        public_url: publicUrl,
        duration_seconds: estimatedDurationSeconds,
      });

    if (insertError) {
      console.error('Insert error:', insertError);
    }

    return new Response(JSON.stringify({
      success: true,
      meditation_id: meditation_id,
      public_url: publicUrl,
      duration_seconds: estimatedDurationSeconds,
      audio_size_bytes: finalAudio.byteLength,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-meditation-audio:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
