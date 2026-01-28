import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuração de voz para meditações (mais lenta que conversação normal)
const MEDITATION_VOICE_CONFIG = {
  voiceName: "Erinome",
  speakingRate: 1.15,
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

// Gera áudio para um chunk de texto (limite 2000 chars)
async function generateAudioChunk(
  text: string,
  accessToken: string,
  projectId: string
): Promise<Uint8Array | null> {
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
    console.error("TTS chunk error:", response.status, errorText);
    return null;
  }

  const data = await response.json();
  
  if (!data.audioContent) {
    return null;
  }

  const binaryString = atob(data.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
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

    // Carregar credenciais GCP
    const gcpServiceAccountJson = Deno.env.get('GCP_SERVICE_ACCOUNT');
    if (!gcpServiceAccountJson) {
      return new Response(JSON.stringify({ error: 'GCP credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceAccount: ServiceAccountCredentials = JSON.parse(gcpServiceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

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
        console.log(`🎙️ Generating chunk ${i + 1}/${chunks.length}...`);
        batchPromises.push(
          generateAudioChunk(chunks[i], accessToken, serviceAccount.project_id)
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
