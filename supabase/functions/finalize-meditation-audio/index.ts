import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const body = await req.json();
    const { meditation_id } = body;

    if (!meditation_id) {
      return new Response(JSON.stringify({ error: 'meditation_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔗 Finalizing meditation audio: ${meditation_id}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar todos os chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('meditation_audio_chunks')
      .select('*')
      .eq('meditation_id', meditation_id)
      .order('chunk_index');

    if (chunksError || !chunks || chunks.length === 0) {
      throw new Error('No chunks found for meditation');
    }

    // Verificar se todos estão completos
    const allCompleted = chunks.every(c => c.status === 'completed');
    const completedCount = chunks.filter(c => c.status === 'completed').length;
    
    if (!allCompleted) {
      return new Response(JSON.stringify({ 
        error: 'Not all chunks are completed',
        completed: completedCount,
        total: chunks.length,
        pending: chunks.filter(c => c.status !== 'completed').map(c => c.chunk_index)
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📦 Downloading ${chunks.length} chunks...`);

    // Baixar todos os chunks do Storage
    const audioBuffers: Uint8Array[] = [];
    
    for (const chunk of chunks) {
      if (!chunk.storage_path) {
        throw new Error(`Chunk ${chunk.chunk_index} has no storage_path`);
      }
      
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('meditations')
        .download(chunk.storage_path);

      if (downloadError || !audioData) {
        throw new Error(`Failed to download chunk ${chunk.chunk_index}: ${downloadError?.message}`);
      }

      const arrayBuffer = await audioData.arrayBuffer();
      audioBuffers.push(new Uint8Array(arrayBuffer));
      console.log(`✅ Downloaded chunk ${chunk.chunk_index}: ${arrayBuffer.byteLength} bytes`);
    }

    // Concatenar todos os chunks
    console.log('🔗 Concatenating audio chunks...');
    const finalAudio = concatenateAudioBuffers(audioBuffers);
    console.log(`✅ Final audio: ${finalAudio.byteLength} bytes`);

    // Upload do áudio final
    const storagePath = `${meditation_id}/audio.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('meditations')
      .upload(storagePath, finalAudio, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload final audio: ${uploadError.message}`);
    }

    // Obter URL pública
    const { data: publicUrlData } = supabase.storage
      .from('meditations')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;
    console.log(`📦 Final audio uploaded: ${publicUrl}`);

    // Buscar meditação para estimar duração
    const { data: meditation } = await supabase
      .from('meditations')
      .select('script')
      .eq('id', meditation_id)
      .single();

    // Estimar duração (150 palavras por minuto)
    const wordCount = meditation?.script?.split(/\s+/).length || 0;
    const estimatedDurationSeconds = Math.round((wordCount / 150) * 60);

    // Deletar áudio anterior se existir
    await supabase
      .from('meditation_audios')
      .delete()
      .eq('meditation_id', meditation_id);

    // Salvar novo registro
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

    // Limpar chunks do Storage (opcional - economiza espaço)
    console.log('🧹 Cleaning up chunks...');
    for (const chunk of chunks) {
      if (chunk.storage_path) {
        await supabase.storage
          .from('meditations')
          .remove([chunk.storage_path]);
      }
    }

    // Limpar registros de chunks
    await supabase
      .from('meditation_audio_chunks')
      .delete()
      .eq('meditation_id', meditation_id);

    console.log(`✅ Meditation ${meditation_id} finalized successfully`);

    return new Response(JSON.stringify({
      success: true,
      meditation_id,
      public_url: publicUrl,
      duration_seconds: estimatedDurationSeconds,
      audio_size_bytes: finalAudio.byteLength,
      chunks_processed: chunks.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in finalize-meditation-audio:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
