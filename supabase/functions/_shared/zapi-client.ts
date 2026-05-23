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
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace('@c.us', '').replace(/\D/g, '');
}

/**
 * Normalize a Brazilian phone number to WhatsApp-compatible format: 55 + DDD + 9 + 8 digits
 * Handles cases where DDI 55 is missing or the 9th digit is absent.
 */
export function normalizeBrazilianPhone(phone: string): string {
  let clean = cleanPhoneNumber(phone);

  // DDDs BR válidos (Anatel). Usado para desambiguar prefixos "55".
  const VALID_BR_DDDS = new Set<string>([
    "11","12","13","14","15","16","17","18","19",
    "21","22","24","27","28",
    "31","32","33","34","35","37","38",
    "41","42","43","44","45","46","47","48","49",
    "51","53","54","55",
    "61","62","63","64","65","66","67","68","69",
    "71","73","74","75","77","79",
    "81","82","83","84","85","86","87","88","89",
    "91","92","93","94","95","96","97","98","99",
  ]);

  // 13 dígitos começando com 55 → já está em E.164 BR completo
  if (clean.length === 13 && clean.startsWith("55") && VALID_BR_DDDS.has(clean.substring(2, 4))) {
    return clean;
  }

  // 12 dígitos começando com 55 (DDD válido) → falta o 9 do celular
  if (clean.length === 12 && clean.startsWith("55") && VALID_BR_DDDS.has(clean.substring(2, 4))) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4); // 8 dígitos
    return "55" + ddd + "9" + rest;
  }

  // 11 dígitos: ambíguo. Pode ser
  //  (a) DDD(2) + 9 + 8d  (celular sem DDI 55)  → prefixar 55
  //  (b) 55 + DDD(2) + 7d (lixo, número incompleto)  → NÃO prefixar de novo
  if (clean.length === 11) {
    const dddA = clean.substring(0, 2);
    const ninthA = clean.substring(2, 3);
    const startsWith55 = clean.startsWith("55");
    const dddB = clean.substring(2, 4);

    // Caso (a): DDD válido + 9º dígito "9" → celular BR sem código de país
    if (VALID_BR_DDDS.has(dddA) && ninthA === "9") {
      return "55" + clean;
    }

    // Caso (b): já começa com 55 e os 2 dígitos seguintes formam DDD válido → não duplicar 55
    // Mantém como está (Twilio rejeita com erro claro em vez de inflar pra 5555...)
    if (startsWith55 && VALID_BR_DDDS.has(dddB)) {
      return clean;
    }

    // Fallback: prefixa 55 mesmo assim (comportamento legado para DDDs raros sem o 9)
    return "55" + clean;
  }

  // 10 dígitos: DDD(2) + 8d (fixo OU celular antigo sem o 9) → adicionar 55 + 9 se DDD válido
  if (clean.length === 10) {
    const ddd = clean.substring(0, 2);
    if (VALID_BR_DDDS.has(ddd)) {
      const rest = clean.substring(2); // 8 dígitos
      // Heurística: se começa com 6/7/8/9 trata como celular e adiciona o 9; senão mantém como fixo
      const isMobile = /^[6-9]/.test(rest);
      return isMobile ? "55" + ddd + "9" + rest : "55" + clean;
    }
    return "55" + clean; // fallback legado
  }

  // Qualquer outro tamanho (< 10, 14, 15+ etc): retornar limpo sem inflar.
  // Twilio devolverá 21211 com mensagem clara em vez de mascarar com prefixo errado.
  return clean;
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
  const clean = cleanPhoneNumber(phone);
  
  // Sempre incluir o número original como primeira variação
  const variations: string[] = [clean];
  
  // Números com 10-11 dígitos podem ser brasileiros (sem código de país)
  // Aplicar lógica brasileira: adicionar 55 e manipular o nono dígito
  if (clean.length === 10 || clean.length === 11) {
    const withCountry = '55' + clean;
    if (!variations.includes(withCountry)) variations.push(withCountry);
    
    // 11 dígitos (DDD + 9 + 8 dígitos) -> criar versão sem o 9
    if (clean.length === 11 && clean.substring(2, 3) === '9') {
      const without9 = '55' + clean.substring(0, 2) + clean.substring(3);
      if (!variations.includes(without9)) variations.push(without9);
    }
    // 10 dígitos (DDD + 8 dígitos) -> criar versão com o 9
    if (clean.length === 10) {
      const with9 = '55' + clean.substring(0, 2) + '9' + clean.substring(2);
      if (!variations.includes(with9)) variations.push(with9);
    }
  }
  
  // Números já com código 55 (12-13 dígitos): lógica brasileira existente
  if (clean.length === 13 && clean.startsWith('55')) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4);
    if (rest.startsWith('9') && rest.length === 9) {
      const without9 = '55' + ddd + rest.substring(1);
      if (!variations.includes(without9)) variations.push(without9);
    }
    // Variação sem código de país (ex: 5519998849238 → 19998849238)
    const withoutCountry = clean.substring(2);
    if (!variations.includes(withoutCountry)) variations.push(withoutCountry);
    // Sem código de país e sem nono dígito (ex: 5519998849238 → 1998849238)
    if (rest.startsWith('9') && rest.length === 9) {
      const withoutCountryAnd9 = ddd + rest.substring(1);
      if (!variations.includes(withoutCountryAnd9)) variations.push(withoutCountryAnd9);
    }
  }
  
  if (clean.length === 12 && clean.startsWith('55')) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4);
    if (rest.length === 8) {
      const with9 = '55' + ddd + '9' + rest;
      if (!variations.includes(with9)) variations.push(with9);
    }
    // Variação sem código de país (ex: 551998849238 → 1998849238)
    const withoutCountry = clean.substring(2);
    if (!variations.includes(withoutCountry)) variations.push(withoutCountry);
    // Sem código de país e com nono dígito (ex: 551998849238 → 19998849238)
    if (rest.length === 8) {
      const withoutCountryWith9 = ddd + '9' + rest;
      if (!variations.includes(withoutCountryWith9)) variations.push(withoutCountryWith9);
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
 * @param delayTyping - Seconds to show "typing..." before sending (1-15)
 */
export async function sendTextMessage(
  phone: string, 
  message: string,
  delayTyping?: number,
  configOverride?: ZapiConfig
): Promise<SendTextResult> {
  try {
    const config = configOverride || getZapiConfig();
    const cleanPhone = cleanPhoneNumber(phone);

    // Calcular delay de typing proporcional ao tamanho se não especificado
    const typingDelay = delayTyping ?? Math.min(Math.ceil(message.length / 40), 10);

    console.log(`📤 [Z-API] Sending text to ${cleanPhone.substring(0, 4)}*** (typing: ${typingDelay}s)`);

    const response = await fetch(buildZapiUrl(config, 'send-text'), {
      method: 'POST',
      headers: buildZapiHeaders(config),
      body: JSON.stringify({
        phone: cleanPhone,
        message: message,
        // Z-API typing indicator: mostra "Digitando..." por X segundos antes de enviar
        ...(typingDelay > 0 && { delayTyping: Math.min(Math.max(typingDelay, 1), 15) }),
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
export async function sendAudioMessage(phone: string, audioBase64: string, configOverride?: ZapiConfig): Promise<SendAudioResult> {
  try {
    const config = configOverride || getZapiConfig();
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
// AUDIO FROM URL
// ============================================================================

/**
 * Send an audio message from a URL via Z-API
 * Useful for pre-generated audio files stored in cloud storage
 * @param audioUrl - Public URL of the audio file (MP3)
 */
export async function sendAudioFromUrl(phone: string, audioUrl: string, configOverride?: ZapiConfig): Promise<SendAudioResult> {
  try {
    const config = configOverride || getZapiConfig();
    const cleanPhone = cleanPhoneNumber(phone);

    console.log(`🔊 [Z-API] Sending audio from URL to ${cleanPhone.substring(0, 4)}***`);

    const response = await fetch(buildZapiUrl(config, 'send-audio'), {
      method: 'POST',
      headers: buildZapiHeaders(config),
      body: JSON.stringify({
        phone: cleanPhone,
        audio: audioUrl, // Z-API aceita URL direta
        waveform: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Z-API] Audio from URL send error:', errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    console.log('✅ [Z-API] Audio from URL sent successfully');
    return { success: true, response: data };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Z-API] Audio from URL send exception:', errorMessage);
    return { success: false, error: errorMessage };
  }
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
  audioBase64?: string | null,
  configOverride?: ZapiConfig
): Promise<{ success: boolean; type: 'audio' | 'text'; error?: string }> {
  
  if (audioBase64) {
    const audioResult = await sendAudioMessage(phone, audioBase64, configOverride);
    if (audioResult.success) {
      return { success: true, type: 'audio' };
    }
    console.log('⚠️ [Z-API] Audio failed, falling back to text');
  }

  const textResult = await sendTextMessage(phone, text, undefined, configOverride);
  return {
    success: textResult.success,
    type: 'text',
    error: textResult.error,
  };
}
