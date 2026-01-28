import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuração de voz para meditações (mais lenta que conversação normal)
const MEDITATION_VOICE_CONFIG = {
  voiceName: "Erinome",
  speakingRate: 0.90,
  stylePrompt: "O tom é muito calmo, suave e hipnótico. Voz serena como uma guia de meditação. Pausas naturais entre frases. Respiração tranquila, sem pressa. Como uma guia espiritual gentil conduzindo uma jornada interior."
};

interface ServiceAccountCredentials {
  project_id: string;
  private_key: string;
  client_email: string;
}

// Converte PEM para CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Gera JWT e troca por Access Token
async function getAccessToken(serviceAccount: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    await importPrivateKey(serviceAccount.private_key)
  );

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

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

// Gera áudio para um texto
async function generateAudio(
  text: string,
  accessToken: string,
  projectId: string
): Promise<Uint8Array> {
  console.log(`🎙️ Generating audio for ${text.length} chars...`);
  
  const response = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify({
        input: {
          prompt: MEDITATION_VOICE_CONFIG.stylePrompt,
          text: text,
        },
        voice: {
          languageCode: "pt-BR",
          name: MEDITATION_VOICE_CONFIG.voiceName,
          modelName: "gemini-2.5-pro-tts",
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: MEDITATION_VOICE_CONFIG.speakingRate,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TTS error:", response.status, errorText);
    throw new Error(`TTS API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.audioContent) {
    throw new Error("No audio content in response");
  }

  const binaryString = atob(data.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
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

    // Carregar credenciais GCP
    const gcpServiceAccountJson = Deno.env.get('GCP_SERVICE_ACCOUNT');
    if (!gcpServiceAccountJson) {
      throw new Error('GCP credentials not configured');
    }

    const serviceAccount: ServiceAccountCredentials = JSON.parse(gcpServiceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    // Gerar áudio
    const audioBytes = await generateAudio(chunkText, accessToken, serviceAccount.project_id);
    console.log(`✅ Audio generated: ${audioBytes.byteLength} bytes`);

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

    // Carregar credenciais GCP
    const gcpServiceAccountJson = Deno.env.get('GCP_SERVICE_ACCOUNT');
    if (!gcpServiceAccountJson) {
      throw new Error('GCP credentials not configured');
    }

    const serviceAccount: ServiceAccountCredentials = JSON.parse(gcpServiceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    // Gerar áudio
    const audioBytes = await generateAudio(chunkText, accessToken, serviceAccount.project_id);
    console.log(`✅ Audio generated: ${audioBytes.byteLength} bytes`);

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
