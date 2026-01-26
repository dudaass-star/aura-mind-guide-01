

## Migração para Google Cloud TTS com Service Account

### Visão Geral

O Gemini TTS não aceita API Keys simples - requer autenticação OAuth2 via Service Account. Vamos migrar a função `aura-tts` para usar o endpoint correto do Google Cloud TTS com autenticação por token JWT.

---

## Passos para Configuração no Google Cloud

### 1. Criar Service Account no GCP Console

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Selecione ou crie um projeto
3. Vá em **IAM & Admin > Service Accounts**
4. Clique em **Create Service Account**
5. Dê um nome (ex: `aura-tts-service`)
6. Clique em **Create and Continue**

### 2. Habilitar a API de Text-to-Speech

1. Vá em **APIs & Services > Library**
2. Pesquise por **Cloud Text-to-Speech API**
3. Clique em **Enable**

### 3. Gerar Chave JSON

1. Na página do Service Account criado, clique na aba **Keys**
2. Clique em **Add Key > Create new key**
3. Selecione **JSON** e baixe o arquivo
4. O arquivo terá formato semelhante a:
```json
{
  "type": "service_account",
  "project_id": "seu-projeto",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "aura-tts@seu-projeto.iam.gserviceaccount.com",
  ...
}
```

### 4. Configurar Secret no Lovable

Você precisará adicionar um novo secret chamado `GCP_SERVICE_ACCOUNT` contendo o JSON completo da Service Account.

---

## Mudanças Técnicas

### Arquivo: `supabase/functions/aura-tts/index.ts`

**Principais alterações:**

1. **Novo endpoint**: Mudar de `generativelanguage.googleapis.com` para `texttospeech.googleapis.com/v1/text:synthesize`

2. **Nova função de autenticação JWT**:
   - Criar JWT assinado com a private key da Service Account
   - Trocar JWT por Access Token no endpoint OAuth2 do Google
   - Usar Access Token como Bearer no header Authorization

3. **Nova estrutura de requisição**:
```typescript
{
  "input": {
    "prompt": "O tom é acolhedor, empático...", // estilo
    "text": "Texto a ser falado"
  },
  "voice": {
    "languageCode": "pt-BR",
    "name": "Erinome",
    "modelName": "gemini-2.5-flash-tts"
  },
  "audioConfig": {
    "audioEncoding": "MP3",
    "speakingRate": 1.20
  }
}
```

4. **Implementação de geração de JWT** usando a biblioteca `djwt` do Deno:
```typescript
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

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

  // Trocar JWT por access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const { access_token } = await tokenResponse.json();
  return access_token;
}
```

5. **Nova função `generateGoogleCloudTTS`** substituindo `generateGeminiTTS`:
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
  // Decodificar base64 do audioContent
  return decodeBase64(data.audioContent);
}
```

---

## Fluxo de Autenticação

```text
+-------------------+     +------------------+     +-------------------+
|  Service Account  | --> |   Gerar JWT      | --> |  OAuth2 Google    |
|  (JSON Secret)    |     |   (djwt lib)     |     |  /token endpoint  |
+-------------------+     +------------------+     +-------------------+
                                                           |
                                                           v
                                                   +-------------------+
                                                   |   Access Token    |
                                                   +-------------------+
                                                           |
                                                           v
                                                   +-------------------+
                                                   | Cloud TTS API     |
                                                   | Authorization:    |
                                                   | Bearer <token>    |
                                                   +-------------------+
```

---

## Resumo das Ações

| Ação | Responsável |
|------|-------------|
| Criar Service Account no GCP Console | Você |
| Habilitar Cloud Text-to-Speech API | Você |
| Gerar e baixar chave JSON | Você |
| Configurar secret `GCP_SERVICE_ACCOUNT` | Você (via Lovable) |
| Atualizar código da edge function | Lovable |
| Deploy e teste | Automático |

---

## Resultado Esperado

Após a implementação:
- Voz **Erinome** funcionando corretamente
- Tom acolhedor e empático conforme configurado
- Velocidade de fala em 1.20x
- Fallback para OpenAI mantido caso Google Cloud falhe

