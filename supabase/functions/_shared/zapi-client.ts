/**
 * Z-API Client - Módulo centralizado para integração com Z-API
 * 
 * Todas as funções relacionadas ao Z-API devem usar este módulo.
 * Isso garante consistência nos headers, URLs e tratamento de erros.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ZapiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

export function getZapiConfig(): ZapiConfig {
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
  const token = Deno.env.get('ZAPI_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  if (!instanceId || !token || !clientToken) {
    throw new Error('Z-API configuration missing: ZAPI_INSTANCE_ID, ZAPI_TOKEN, or ZAPI_CLIENT_TOKEN');
  }

  return { instanceId, token, clientToken };
}

// ============================================================================
// URL & HEADERS BUILDERS
// ============================================================================

const ZAPI_BASE_URL = 'https://api.z-api.io';

export function buildZapiUrl(config: ZapiConfig, endpoint: string): string {
  return `${ZAPI_BASE_URL}/instances/${config.instanceId}/token/${config.token}/${endpoint}`;
}

export function buildZapiHeaders(config: ZapiConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Client-Token': config.clientToken,
  };
}

// ============================================================================
// PHONE NUMBER UTILITIES
// ============================================================================

/**
 * Clean and validate phone number
 * Removes all non-digit characters and validates E.164 format (10-15 digits)
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace('@c.us', '').replace(/\D/g, '');
}

export function isValidPhoneNumber(phone: string): boolean {
  const clean = cleanPhoneNumber(phone);
  return /^[0-9]{10,15}$/.test(clean);
}

/**
 * Gera variações do telefone brasileiro para busca flexível
 * Retorna array com formatos com e sem o 9 extra
 * 
 * Exemplos:
 * - 5551996219341 (13 dígitos) -> ['5551996219341', '555196219341']
 * - 555196219341 (12 dígitos) -> ['555196219341', '5551996219341']
 */
export function getPhoneVariations(phone: string): string[] {
  let clean = cleanPhoneNumber(phone);
  
  // Adicionar 55 se não tiver
  if (clean.length === 10 || clean.length === 11) {
    clean = '55' + clean;
  }
  
  const variations: string[] = [clean];
  
  // Se tem 13 dígitos (55 + DDD + 9 + 8 dígitos), criar versão sem o 9
  if (clean.length === 13 && clean.startsWith('55')) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4); // 9 dígitos
    if (rest.startsWith('9') && rest.length === 9) {
      const without9 = '55' + ddd + rest.substring(1);
      variations.push(without9);
    }
  }
  
  // Se tem 12 dígitos (55 + DDD + 8 dígitos), criar versão com o 9
  if (clean.length === 12 && clean.startsWith('55')) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4); // 8 dígitos
    if (rest.length === 8) {
      const with9 = '55' + ddd + '9' + rest;
      variations.push(with9);
    }
  }
  
  return variations;
}

// ============================================================================
// MESSAGE SENDING
// ============================================================================

export interface SendTextResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

export interface SendAudioResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

/**
 * Send a text message via Z-API
 */
export async function sendTextMessage(phone: string, message: string): Promise<SendTextResult> {
  try {
    const config = getZapiConfig();
    const cleanPhone = cleanPhoneNumber(phone);

    console.log(`📤 [Z-API] Sending text to ${cleanPhone.substring(0, 4)}***`);

    const response = await fetch(buildZapiUrl(config, 'send-text'), {
      method: 'POST',
      headers: buildZapiHeaders(config),
      body: JSON.stringify({
        phone: cleanPhone,
        message: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Z-API] Text send error:', errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    console.log('✅ [Z-API] Text sent successfully');
    return { success: true, response: data };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Z-API] Text send exception:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send an audio message via Z-API
 * @param audioBase64 - Base64 encoded audio (without data URI prefix)
 */
export async function sendAudioMessage(phone: string, audioBase64: string): Promise<SendAudioResult> {
  try {
    const config = getZapiConfig();
    const cleanPhone = cleanPhoneNumber(phone);

    console.log(`🔊 [Z-API] Sending audio to ${cleanPhone.substring(0, 4)}***`);

    const response = await fetch(buildZapiUrl(config, 'send-audio'), {
      method: 'POST',
      headers: buildZapiHeaders(config),
      body: JSON.stringify({
        phone: cleanPhone,
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        waveform: true, // Para aparecer como mensagem de voz
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Z-API] Audio send error:', errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    console.log('✅ [Z-API] Audio sent successfully');
    return { success: true, response: data };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Z-API] Audio send exception:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// WEBHOOK AUTHENTICATION
// ============================================================================

export interface WebhookAuthResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate incoming webhook request from Z-API
 * 
 * Z-API can send the token in different headers:
 * - `z-api-token` / `Z-Api-Token` - should match ZAPI_TOKEN
 * - `client-token` / `Client-Token` - should match ZAPI_CLIENT_TOKEN
 */
export function validateWebhookAuth(req: Request): WebhookAuthResult {
  const receivedZapiToken = req.headers.get('z-api-token') || req.headers.get('Z-Api-Token');
  const receivedClientToken = req.headers.get('client-token') || req.headers.get('Client-Token');

  const expectedZapiToken = Deno.env.get('ZAPI_TOKEN');
  const expectedClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  // Determine which header was sent and what to validate against
  const usingZapiTokenHeader = !!receivedZapiToken;
  const receivedToken = receivedZapiToken ?? receivedClientToken;
  const expectedToken = usingZapiTokenHeader ? expectedZapiToken : expectedClientToken;

  // Logging for debugging
  const mask = (v: string | null | undefined) => (v ? v.substring(0, 8) + '***' : 'NULL');
  console.log('🔐 [Z-API] Webhook auth:', {
    origin: req.headers.get('origin'),
    usingHeader: usingZapiTokenHeader ? 'z-api-token' : 'client-token',
    expected: mask(expectedToken),
    received: mask(receivedToken),
    match: !!receivedToken && !!expectedToken && receivedToken === expectedToken,
  });

  if (!expectedToken) {
    return { isValid: false, error: 'Server configuration error: missing expected token' };
  }

  if (!receivedToken || receivedToken !== expectedToken) {
    return { isValid: false, error: 'Unauthorized: invalid or missing token' };
  }

  return { isValid: true };
}

// ============================================================================
// PAYLOAD PARSING
// ============================================================================

export interface ParsedZapiMessage {
  phone: string | null;
  cleanPhone: string | null;
  messageId: string | null;
  isFromMe: boolean;
  isGroup: boolean;
  text: string;
  hasAudio: boolean;
  audioUrl: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  imageCaption: string | null;
}

/**
 * Parse incoming Z-API webhook payload into a consistent structure
 */
export function parseZapiPayload(payload: Record<string, unknown>): ParsedZapiMessage {
  const phone = (payload.phone || payload.from) as string | null;
  const cleanPhone = phone ? cleanPhoneNumber(phone) : null;
  
  const audio = payload.audio as { audioUrl?: string } | undefined;
  const image = payload.image as { imageUrl?: string; caption?: string } | undefined;
  const textObj = payload.text as { message?: string } | undefined;

  return {
    phone,
    cleanPhone,
    messageId: (payload.messageId as string) || null,
    isFromMe: !!(payload.fromMe || payload.isFromMe),
    isGroup: !!(payload.isGroup),
    text: textObj?.message || (payload.body as string) || '',
    hasAudio: !!(audio?.audioUrl),
    audioUrl: audio?.audioUrl || null,
    hasImage: !!(image?.imageUrl),
    imageUrl: image?.imageUrl || null,
    imageCaption: image?.caption || null,
  };
}

// ============================================================================
// CONVENIENCE: SEND WITH FALLBACK
// ============================================================================

/**
 * Send a message, trying audio first (if audioBase64 provided) with text fallback
 */
export async function sendMessageWithFallback(
  phone: string,
  text: string,
  audioBase64?: string | null
): Promise<{ success: boolean; type: 'audio' | 'text'; error?: string }> {
  
  if (audioBase64) {
    const audioResult = await sendAudioMessage(phone, audioBase64);
    if (audioResult.success) {
      return { success: true, type: 'audio' };
    }
    console.log('⚠️ [Z-API] Audio failed, falling back to text');
  }

  const textResult = await sendTextMessage(phone, text);
  return {
    success: textResult.success,
    type: 'text',
    error: textResult.error,
  };
}
