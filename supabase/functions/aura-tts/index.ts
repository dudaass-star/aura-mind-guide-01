import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Google Cloud TTS Config ───────────────────────────────────────
const AURA_VOICE_CONFIG = {
  voiceName: "Erinome",
  speakingRate: 1.20,
  stylePrompt: "O tom é acolhedor, empático e calmo, mas profissional e confiante. Nada robótico. Articulação clara, timbre suave, fala lenta e gentilmente, como uma terapeuta ou uma amiga próxima oferecendo apoio."
};

// ─── Inworld TTS Config ────────────────────────────────────────────
const INWORLD_CONFIG = {
  voiceId: "default-m-ple0rtxdeidhocwm57qw__aura",
  modelId: "inworld-tts-1.5-max",
  speakingRate: 1.20,
  temperature: 1.0,
};

// ─── Interfaces ────────────────────────────────────────────────────
interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

// ─── Text Helpers ──────────────────────────────────────────────────
function sanitizeTextForTTS(text: string): string {
  return text
    .replace(/\.{4,}/g, '...')
    .replace(/["']/g, '')
    .replace(/[<>&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function reformulateForRetry(text: string): string {
  const prefix = "Com carinho e empatia: ";
  const cleaned = text
    .replace(/!/g, '.')
    .replace(/\?{2,}/g, '?');
  return prefix + cleaned;
}

// ─── Google Cloud TTS ──────────────────────────────────────────────
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function getAccessToken(serviceAccount: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    { iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    await importPrivateKey(serviceAccount.private_key)
  );

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("OAuth2 token error:", tokenResponse.status, errorText);
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function attemptGoogleTTS(text: string, accessToken: string, projectId: string): Promise<{ success: boolean; audioBytes?: Uint8Array; blocked?: boolean }> {
  try {
    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify({
        input: { prompt: AURA_VOICE_CONFIG.stylePrompt, text },
        voice: { languageCode: "pt-BR", name: AURA_VOICE_CONFIG.voiceName, modelName: "gemini-2.5-pro-tts" },
        audioConfig: { audioEncoding: "MP3", speakingRate: AURA_VOICE_CONFIG.speakingRate },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 400) {
        console.error("🚫 Google TTS blocked content:", { status: response.status, textLength: text.length, error: errorText });
        return { success: false, blocked: true };
      }
      console.error("Google Cloud TTS error:", response.status, errorText);
      return { success: false, blocked: false };
    }

    const data = await response.json();
    if (!data.audioContent) {
      console.error("Google Cloud TTS: No audio content in response");
      return { success: false, blocked: false };
    }

    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return { success: true, audioBytes: bytes };
  } catch (error) {
    console.error("Google Cloud TTS exception:", error);
    return { success: false, blocked: false };
  }
}

async function generateGoogleCloudTTS(text: string, serviceAccount: ServiceAccountCredentials): Promise<{ audioBytes: Uint8Array | null; blocked: boolean }> {
  console.log('🎙️ Attempting Google Cloud TTS with voice:', AURA_VOICE_CONFIG.voiceName);
  const accessToken = await getAccessToken(serviceAccount);

  const sanitizedText = sanitizeTextForTTS(text);
  let result = await attemptGoogleTTS(sanitizedText, accessToken, serviceAccount.project_id);

  if (result.success && result.audioBytes) {
    console.log('✅ Google Cloud TTS success on first attempt:', result.audioBytes.byteLength, 'bytes');
    return { audioBytes: result.audioBytes, blocked: false };
  }

  if (result.blocked) {
    console.log('⚠️ First TTS attempt blocked, retrying with reformulated text...');
    const reformulatedText = reformulateForRetry(sanitizedText);
    result = await attemptGoogleTTS(reformulatedText, accessToken, serviceAccount.project_id);
    if (result.success && result.audioBytes) {
      console.log('✅ Google Cloud TTS success on retry:', result.audioBytes.byteLength, 'bytes');
      return { audioBytes: result.audioBytes, blocked: false };
    }
    console.log('❌ Both TTS attempts failed, will fallback to text');
    return { audioBytes: null, blocked: true };
  }

  console.log('❌ Google Cloud TTS failed (not blocked)');
  return { audioBytes: null, blocked: false };
}

// ─── Inworld TTS ───────────────────────────────────────────────────
async function generateInworldTTS(text: string): Promise<{ audioBytes: Uint8Array | null; blocked: boolean }> {
  const apiKey = Deno.env.get('INWORLD_API_KEY');
  if (!apiKey) {
    console.error('❌ No INWORLD_API_KEY configured');
    return { audioBytes: null, blocked: false };
  }

  console.log('🎙️ Attempting Inworld TTS with voice:', INWORLD_CONFIG.voiceId);

  try {
    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: sanitizeTextForTTS(text),
        voiceId: INWORLD_CONFIG.voiceId,
        modelId: INWORLD_CONFIG.modelId,
        speakingRate: INWORLD_CONFIG.speakingRate,
        temperature: INWORLD_CONFIG.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Inworld TTS error:", response.status, errorText);
      return { audioBytes: null, blocked: response.status === 400 };
    }

    const data = await response.json();
    if (!data.audioContent) {
      console.error("Inworld TTS: No audioContent in response");
      return { audioBytes: null, blocked: false };
    }

    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    console.log('✅ Inworld TTS success:', bytes.byteLength, 'bytes');
    return { audioBytes: bytes, blocked: false };
  } catch (error) {
    console.error("Inworld TTS exception:", error);
    return { audioBytes: null, blocked: false };
  }
}

// ─── Read TTS model from system_config ─────────────────────────────
async function getTTSModel(): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'tts_model')
      .single();

    if (error || !data) return 'google/erinome';

    const val = typeof data.value === 'string' ? data.value.replace(/"/g, '') : String(data.value).replace(/"/g, '');
    return val || 'google/erinome';
  } catch (e) {
    console.error('Error reading tts_model config:', e);
    return 'google/erinome';
  }
}

// ─── Main Handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authHeader || !authHeader.includes(supabaseServiceKey!)) {
      console.warn('🚫 Unauthorized request to aura-tts');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { text } = await req.json();
    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ audioContent: null, fallbackToText: true, reason: "empty_text" }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log("TTS request:", { textLength: text.length });

    const maxChars = 2000;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;

    // Read active TTS model
    const ttsModel = await getTTSModel();
    console.log('🔧 Active TTS model:', ttsModel);

    let audioBytes: Uint8Array | null = null;
    let blocked = false;
    let provider = 'unknown';

    if (ttsModel === 'inworld/aura') {
      provider = 'inworld';
      const result = await generateInworldTTS(truncatedText);
      audioBytes = result.audioBytes;
      blocked = result.blocked;
    } else {
      // Default: Google Cloud TTS
      provider = 'google-cloud';
      const gcpServiceAccountJson = Deno.env.get('GCP_SERVICE_ACCOUNT');
      let serviceAccount: ServiceAccountCredentials | null = null;
      if (gcpServiceAccountJson) {
        try { serviceAccount = JSON.parse(gcpServiceAccountJson); } catch (e) { console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e); }
      }
      if (!serviceAccount) {
        console.error('❌ No GCP_SERVICE_ACCOUNT configured');
        return new Response(JSON.stringify({ audioContent: null, fallbackToText: true, reason: "no_credentials" }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const result = await generateGoogleCloudTTS(truncatedText, serviceAccount);
      audioBytes = result.audioBytes;
      blocked = result.blocked;
    }

    if (!audioBytes) {
      console.log('📝 Returning fallback to text signal');
      return new Response(JSON.stringify({ audioContent: null, fallbackToText: true, reason: blocked ? "safety_filter" : "generation_failed" }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base64Audio = base64Encode(audioBytes.buffer as ArrayBuffer);
    console.log("TTS generated:", { audioSize: audioBytes.byteLength, provider, voice: ttsModel === 'inworld/aura' ? INWORLD_CONFIG.voiceId : AURA_VOICE_CONFIG.voiceName });

    return new Response(JSON.stringify({
      audioContent: base64Audio,
      format: 'mp3',
      voice: ttsModel === 'inworld/aura' ? INWORLD_CONFIG.voiceId : AURA_VOICE_CONFIG.voiceName,
      provider,
      fallbackToText: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error in aura-tts:", error);
    return new Response(JSON.stringify({ audioContent: null, fallbackToText: true, reason: "exception" }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
