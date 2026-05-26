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

// Divide script em chunks de ~1200 chars
function splitScriptIntoChunks(script: string, maxChars = 1200): string[] {
  const chunks: string[] = [];
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

// Gera áudio MP3 via Inworld TTS (voz Aura)
async function generateAudio(text: string, apiKey: string): Promise<Uint8Array> {
  console.log(`🎙️ Generating audio for ${text.length} chars via Inworld (voz Aura)...`);

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
    console.error("Inworld TTS error:", response.status, errorText);
    throw new Error(`Inworld TTS error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.audioContent) {
    throw new Error("No audio content in Inworld response");
  }

  const binaryString = atob(data.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Processa um chunk de forma assíncrona (roda em background)
async function processChunkAsync(
  meditation_id: string,
  chunk_index: number,
  total_chunks?: number,
  initialize?: boolean
): Promise<void> {
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log(`🧩 [ASYNC] Processing chunk ${chunk_index} for meditation: ${meditation_id}`);

    // Se for a primeira chamada (initialize=true), criar todos os registros de chunks
    if (initialize && chunk_index === 0 && total_chunks) {
      console.log(`📝 Initializing ${total_chunks} chunk records...`);
      
      // Limpar chunks anteriores
      await supabase
        .from('meditation_audio_chunks')
        .delete()
        .eq('meditation_id', meditation_id);

      // Criar registros para todos os chunks
      const chunkRecords = Array.from({ length: total_chunks }, (_, i) => ({
        meditation_id,
        chunk_index: i,
        total_chunks,
        status: 'pending',
      }));

      const { error: insertError } = await supabase
        .from('meditation_audio_chunks')
        .insert(chunkRecords);

      if (insertError) {
        console.error('Failed to insert chunk records:', insertError);
        throw new Error(`Failed to initialize chunks: ${insertError.message}`);
      }
      
      console.log(`✅ Created ${total_chunks} chunk records`);
    }

    // Verificar se chunk já foi gerado
    const { data: existingChunk } = await supabase
      .from('meditation_audio_chunks')
      .select('*')
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index)
      .maybeSingle();

    if (existingChunk?.status === 'completed') {
      console.log(`✅ Chunk ${chunk_index} already completed, skipping`);
      return;
    }

    // Atualizar status para generating
    await supabase
      .from('meditation_audio_chunks')
      .update({ status: 'generating' })
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index);

    // Buscar meditação
    const { data: meditation, error: meditationError } = await supabase
      .from('meditations')
      .select('*')
      .eq('id', meditation_id)
      .single();

    if (meditationError || !meditation) {
      throw new Error('Meditation not found');
    }

    // Dividir script e pegar o chunk correto
    const chunks = splitScriptIntoChunks(meditation.script);
    
    if (chunk_index >= chunks.length) {
      throw new Error(`Invalid chunk_index: ${chunk_index} (total: ${chunks.length})`);
    }

    const chunkText = chunks[chunk_index];
    console.log(`📝 Chunk ${chunk_index}: ${chunkText.length} chars`);

    // Carregar credencial Inworld (mesma voz da Aura)
    const inworldApiKey = Deno.env.get('INWORLD_API_KEY');
    if (!inworldApiKey) {
      throw new Error('Inworld credentials not configured');
    }

    // Gerar áudio
    const audioBytes = await generateAudio(chunkText, inworldApiKey);
    console.log(`✅ Audio generated: ${audioBytes.byteLength} bytes`);

    // Log TTS usage for meditation chunk
    try {
      await supabase.from('token_usage_logs').insert({
        function_name: 'generate-chunk',
        call_type: 'tts-meditation',
        model: 'inworld/aura',
        prompt_tokens: chunkText.length,
        completion_tokens: audioBytes.byteLength,
        total_tokens: chunkText.length,
        cached_tokens: 0,
      });
    } catch (logErr) {
      console.error('Failed to log TTS usage:', logErr);
    }

    // Upload para Storage
    const storagePath = `${meditation_id}/chunks/chunk_${chunk_index}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('meditations')
      .upload(storagePath, audioBytes, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload error: ${uploadError.message}`);
    }

    // Atualizar registro com sucesso
    await supabase
      .from('meditation_audio_chunks')
      .update({ 
        status: 'completed',
        storage_path: storagePath,
        completed_at: new Date().toISOString(),
        error_message: null
      })
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index);

    console.log(`✅ Chunk ${chunk_index} completed successfully`);
  } catch (error) {
    console.error('Error processing chunk:', error);
    
    // Atualizar status para failed
    await supabase
      .from('meditation_audio_chunks')
      .update({ 
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { meditation_id, chunk_index, total_chunks, initialize, async: asyncMode } = body;

    if (!meditation_id || chunk_index === undefined) {
      return new Response(JSON.stringify({ error: 'meditation_id and chunk_index are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🧩 Request for chunk ${chunk_index}, meditation: ${meditation_id}, async: ${asyncMode}`);

    // MODO ASSÍNCRONO: Retorna imediatamente e processa em background
    if (asyncMode) {
      // Usar EdgeRuntime.waitUntil para manter a função rodando após retornar
      // @ts-ignore - EdgeRuntime é específico do Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(processChunkAsync(meditation_id, chunk_index, total_chunks, initialize));
      } else {
        // Fallback: processar inline (não ideal, mas funciona)
        processChunkAsync(meditation_id, chunk_index, total_chunks, initialize);
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        async: true,
        message: 'Generation started in background',
        meditation_id,
        chunk_index,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // MODO SÍNCRONO (legado): Aguarda conclusão
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Se for a primeira chamada (initialize=true), criar todos os registros de chunks
    if (initialize && chunk_index === 0 && total_chunks) {
      console.log(`📝 Initializing ${total_chunks} chunk records...`);
      
      await supabase
        .from('meditation_audio_chunks')
        .delete()
        .eq('meditation_id', meditation_id);

      const chunkRecords = Array.from({ length: total_chunks }, (_, i) => ({
        meditation_id,
        chunk_index: i,
        total_chunks,
        status: 'pending',
      }));

      const { error: insertError } = await supabase
        .from('meditation_audio_chunks')
        .insert(chunkRecords);

      if (insertError) {
        throw new Error(`Failed to initialize chunks: ${insertError.message}`);
      }
      
      console.log(`✅ Created ${total_chunks} chunk records`);
    }

    // Verificar se chunk já foi gerado
    const { data: existingChunk } = await supabase
      .from('meditation_audio_chunks')
      .select('*')
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index)
      .maybeSingle();

    if (existingChunk?.status === 'completed') {
      console.log(`✅ Chunk ${chunk_index} already completed, skipping`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: true,
        message: 'Chunk already completed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atualizar status para generating
    await supabase
      .from('meditation_audio_chunks')
      .update({ status: 'generating' })
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index);

    // Buscar meditação
    const { data: meditation, error: meditationError } = await supabase
      .from('meditations')
      .select('*')
      .eq('id', meditation_id)
      .single();

    if (meditationError || !meditation) {
      throw new Error('Meditation not found');
    }

    // Dividir script e pegar o chunk correto
    const chunks = splitScriptIntoChunks(meditation.script);
    
    if (chunk_index >= chunks.length) {
      throw new Error(`Invalid chunk_index: ${chunk_index} (total: ${chunks.length})`);
    }

    const chunkText = chunks[chunk_index];
    console.log(`📝 Chunk ${chunk_index}: ${chunkText.length} chars`);

    // Carregar credencial Inworld (mesma voz da Aura)
    const inworldApiKey = Deno.env.get('INWORLD_API_KEY');
    if (!inworldApiKey) {
      throw new Error('Inworld credentials not configured');
    }

    // Gerar áudio
    const audioBytes = await generateAudio(chunkText, inworldApiKey);
    console.log(`✅ Audio generated: ${audioBytes.byteLength} bytes`);

    // Log TTS usage for meditation chunk (sync mode)
    try {
      await supabase.from('token_usage_logs').insert({
        function_name: 'generate-chunk',
        call_type: 'tts-meditation',
        model: 'inworld/aura',
        prompt_tokens: chunkText.length,
        completion_tokens: audioBytes.byteLength,
        total_tokens: chunkText.length,
        cached_tokens: 0,
      });
    } catch (logErr) {
      console.error('Failed to log TTS usage:', logErr);
    }

    // Upload para Storage
    const storagePath = `${meditation_id}/chunks/chunk_${chunk_index}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('meditations')
      .upload(storagePath, audioBytes, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload error: ${uploadError.message}`);
    }

    // Atualizar registro com sucesso
    await supabase
      .from('meditation_audio_chunks')
      .update({ 
        status: 'completed',
        storage_path: storagePath,
        completed_at: new Date().toISOString(),
        error_message: null
      })
      .eq('meditation_id', meditation_id)
      .eq('chunk_index', chunk_index);

    console.log(`✅ Chunk ${chunk_index} completed successfully`);

    return new Response(JSON.stringify({
      success: true,
      meditation_id,
      chunk_index,
      storage_path: storagePath,
      audio_size_bytes: audioBytes.byteLength,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-chunk:', error);
    
    // Tentar atualizar status para failed
    try {
      const body = await req.clone().json();
      const { meditation_id, chunk_index } = body;
      
      if (meditation_id && chunk_index !== undefined) {
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('meditation_audio_chunks')
          .update({ 
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('meditation_id', meditation_id)
          .eq('chunk_index', chunk_index);
      }
    } catch (e) {
      console.error('Failed to update chunk status:', e);
    }
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
