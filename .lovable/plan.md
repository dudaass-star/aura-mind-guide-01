

## Implementação do Google Cloud TTS com Service Account

### Credenciais Recebidas

A Service Account foi recebida com sucesso:
- **Projeto**: gen-lang-client-0844533581
- **Email**: vertex-express@gen-lang-client-0844533581.iam.gserviceaccount.com

### Passos da Implementação

#### 1. Configurar Secret GCP_SERVICE_ACCOUNT
Solicitar ao usuário que adicione o JSON completo da Service Account como um secret.

#### 2. Atualizar Edge Function aura-tts

**Arquivo**: `supabase/functions/aura-tts/index.ts`

**Novas funcionalidades**:

- **Importar biblioteca djwt** para geração de JWT
```typescript
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
```

- **Função importPrivateKey()** - Converte PEM para CryptoKey
```typescript
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
```

- **Função getAccessToken()** - Gera JWT e troca por Access Token
```typescript
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

  const { access_token } = await tokenResponse.json();
  return access_token;
}
```

- **Função generateGoogleCloudTTS()** - Substitui generateGeminiTTS
```typescript
async function generateGoogleCloudTTS(
  text: string, 
  serviceAccount: ServiceAccountCredentials
): Promise<Uint8Array | null> {
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

  const data = await response.json();
  return decodeBase64(data.audioContent);
}
```

#### 3. Atualizar Lógica Principal

- Ler secret `GCP_SERVICE_ACCOUNT` como JSON
- Usar `generateGoogleCloudTTS()` como método primário
- Manter fallback para OpenAI TTS

---

### Fluxo de Autenticação

```text
Service Account JSON
        |
        v
   Gerar JWT (RS256)
        |
        v
   POST oauth2.googleapis.com/token
        |
        v
   Access Token Bearer
        |
        v
   Cloud TTS API
   texttospeech.googleapis.com/v1/text:synthesize
```

---

### Pré-requisito

Antes de testar, verificar se a **Cloud Text-to-Speech API** está habilitada no projeto GCP:
1. Acesse console.cloud.google.com
2. Vá em APIs & Services > Library
3. Pesquise "Cloud Text-to-Speech API"
4. Verifique se está Enabled

---

### Resultado Esperado

- Voz **Erinome** funcionando via Google Cloud TTS
- Tom acolhedor, empático e calmo conforme configurado
- Velocidade de fala em 1.20x
- Fallback para OpenAI mantido caso Google Cloud falhe

