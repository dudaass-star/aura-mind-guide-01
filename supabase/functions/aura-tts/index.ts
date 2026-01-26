import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configurações da voz Erinome para AURA
const AURA_VOICE_CONFIG = {
  voiceName: "Erinome",
  speakingRate: 1.20,
  stylePrompt: "O tom é acolhedor, empático e calmo, mas profissional e confiante. Nada robótico. Articulação clara, timbre suave, fala lenta e gentilmente, como uma terapeuta ou uma amiga próxima oferecendo apoio."
};

// Interface para as credenciais da Service Account
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
    const errorText = await tokenResponse.text();
    console.error("OAuth2 token error:", tokenResponse.status, errorText);
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Função para gerar áudio via Google Cloud TTS com Service Account
async function generateGoogleCloudTTS(
  text: string, 
  serviceAccount: ServiceAccountCredentials
): Promise<Uint8Array | null> {
  try {
    console.log('🎙️ Attempting Google Cloud TTS with voice:', AURA_VOICE_CONFIG.voiceName);
    
    const accessToken = await getAccessToken(serviceAccount);
    
    const response = await fetch(
      "https://texttospeech.googleapis.com/v1/text:synthesize",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-goog-user-project": serviceAccount.project_id,
        },
        body: JSON.stringify({
          input: {
            prompt: AURA_VOICE_CONFIG.stylePrompt,
            text: text,
          },
          voice: {
            languageCode: "pt-BR",
            name: AURA_VOICE_CONFIG.voiceName,
            modelName: "gemini-2.5-flash-tts",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: AURA_VOICE_CONFIG.speakingRate,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Cloud TTS error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (!data.audioContent) {
      console.error("Google Cloud TTS: No audio content in response");
      return null;
    }

    // Decodificar base64 para bytes
    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('✅ Google Cloud TTS success:', bytes.byteLength, 'bytes');
    return bytes;
  } catch (error) {
    console.error("Google Cloud TTS exception:", error);
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

    // Carregar credenciais da Service Account
    const gcpServiceAccountJson = Deno.env.get('GCP_SERVICE_ACCOUNT');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    let serviceAccount: ServiceAccountCredentials | null = null;
    if (gcpServiceAccountJson) {
      try {
        serviceAccount = JSON.parse(gcpServiceAccountJson);
      } catch (e) {
        console.error("Failed to parse GCP_SERVICE_ACCOUNT:", e);
      }
    }
    
    if (!serviceAccount && !OPENAI_API_KEY) {
      throw new Error('No TTS API keys configured');
    }

    const { text } = await req.json();

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required');
    }

    console.log("TTS request:", { textLength: text.length });

    // Limite de caracteres: 2000 para Google Cloud, 500 para OpenAI fallback
    const maxChars = serviceAccount ? 2000 : 500;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;

    let audioBytes: Uint8Array | null = null;
    let provider = 'none';

    // Tentar Google Cloud TTS primeiro
    if (serviceAccount) {
      audioBytes = await generateGoogleCloudTTS(truncatedText, serviceAccount);
      if (audioBytes) {
        provider = 'google-cloud';
      }
    }

    // Fallback para OpenAI se Google Cloud falhar
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
      voice: provider === 'google-cloud' ? AURA_VOICE_CONFIG.voiceName : 'shimmer'
    });

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: 'mp3',
        voice: provider === 'google-cloud' ? AURA_VOICE_CONFIG.voiceName : 'shimmer',
        provider: provider
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error("Error in aura-tts:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate audio' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
