/**
 * WhatsApp Provider Abstraction Layer
 * 
 * Camada que decide entre Z-API (atual) e API Oficial do WhatsApp (Twilio).
 * O provider ativo é controlado pela key `whatsapp_provider` em `system_config`.
 * 
 * Default: 'zapi' — nenhuma mudança no comportamento existente.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, sendAudioMessage, sendAudioFromUrl as zapiSendAudioFromUrl, type ZapiConfig } from "./zapi-client.ts";
import { sendFreeText, sendAudioFromUrl as twilioSendAudioFromUrl, sendProactiveMessage, type TemplateCategory, type ProactiveMessageResult } from "./whatsapp-official.ts";

// ============================================================================
// PROVIDER DETECTION
// ============================================================================

export type WhatsAppProvider = 'zapi' | 'official';

/**
 * Lê o provider ativo da tabela system_config.
 * Default: 'zapi' (sem mudança no comportamento atual).
 */
export async function getProvider(): Promise<WhatsAppProvider> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'whatsapp_provider')
      .single();

    const provider = data?.value as string | undefined;
    if (provider === 'official') return 'official';
    return 'zapi';
  } catch (error) {
    console.warn('⚠️ [WhatsApp Provider] Could not read provider config, defaulting to zapi:', error);
    return 'zapi';
  }
}

// ============================================================================
// UNIFIED MESSAGE SENDING
// ============================================================================

export interface SendResult {
  success: boolean;
  provider: WhatsAppProvider;
  error?: string;
}

// ============================================================================
// TRANSIENT ERROR RETRY
// ============================================================================

const TRANSIENT_ERROR_PATTERNS = [
  /429/i, /rate.?limit/i, /too many/i,
  /500/i, /502/i, /503/i, /504/i,
  /timeout/i, /timed.?out/i, /econnreset/i, /econnrefused/i,
  /network/i, /fetch.?failed/i,
];

function isTransientError(error?: string): boolean {
  if (!error) return false;
  return TRANSIENT_ERROR_PATTERNS.some(p => p.test(error));
}

async function withRetry<T extends SendResult>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  const result = await fn();
  if (result.success) return result;

  if (isTransientError(result.error)) {
    console.warn(`⚠️ [WhatsApp Provider] Transient error on ${label}: ${result.error}. Retrying in 2s...`);
    await new Promise(r => setTimeout(r, 2000));
    const retry = await fn();
    if (retry.success) {
      console.log(`✅ [WhatsApp Provider] Retry succeeded for ${label}`);
    } else {
      console.error(`❌ [WhatsApp Provider] Retry also failed for ${label}: ${retry.error}`);
    }
    return retry;
  }

  return result;
}

/**
 * Envia uma mensagem de texto usando o provider ativo.
 * Para mensagens proativas (fora da janela de 24h), usar `sendProactive()`.
 */
export async function sendMessage(
  phone: string,
  text: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  return withRetry(async () => {
    const provider = await getProvider();

    if (provider === 'zapi') {
      const result = await sendTextMessage(phone, text, undefined, configOverride);
      return { success: result.success, provider: 'zapi', error: result.error };
    }

    // Official API: texto livre via Twilio Gateway
    const result = await sendFreeText(phone, text);
    return { success: result.success, provider: 'official', error: result.error };
  }, `sendMessage(${phone.substring(0, 4)}***)`);
}

/**
 * Envia uma mensagem proativa (sem conversa ativa do usuário).
 * - Z-API: envia texto direto (sem restrição de janela)
 * - Official: usa template envelope se fora da janela de 24h
 */
export async function sendProactive(
  phone: string,
  text: string,
  templateCategory: TemplateCategory = 'checkin',
  userId?: string,
  configOverride?: ZapiConfig,
  teaserText?: string,
  templateVariables?: string[],
): Promise<SendResult> {
  return withRetry(async () => {
    const provider = await getProvider();

    if (provider === 'zapi') {
      const result = await sendTextMessage(phone, text, undefined, configOverride);
      return { success: result.success, provider: 'zapi', error: result.error };
    }

    // Official API: template envelope + split (teaser avoids split)
    const result: ProactiveMessageResult = await sendProactiveMessage(phone, text, templateCategory, userId, teaserText, templateVariables);
    return { success: result.success, provider: 'official', error: result.error };
  }, `sendProactive(${phone.substring(0, 4)}***)`);
}

/**
 * Envia áudio usando o provider ativo.
 * API oficial NÃO suporta base64 — apenas URLs públicas.
 */
export async function sendAudio(
  phone: string,
  audioBase64: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  return withRetry(async () => {
    const provider = await getProvider();

    if (provider === 'zapi') {
      const result = await sendAudioMessage(phone, audioBase64, configOverride);
      return { success: result.success, provider: 'zapi', error: result.error };
    }

    // Official API: base64 não suportado
    console.warn('⚠️ [WhatsApp Provider] Official API does not support base64 audio. Use sendAudioUrl() with a public URL instead.');
    return {
      success: false,
      provider: 'official',
      error: 'Official API does not support base64 audio. Upload to storage and use sendAudioUrl() instead.',
    };
  }, `sendAudio(${phone.substring(0, 4)}***)`);
}

/**
 * Envia áudio de URL usando o provider ativo.
 */
export async function sendAudioUrl(
  phone: string,
  audioUrl: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  return withRetry(async () => {
    const provider = await getProvider();

    if (provider === 'zapi') {
      const result = await zapiSendAudioFromUrl(phone, audioUrl, configOverride);
      return { success: result.success, provider: 'zapi', error: result.error };
    }

    // Official API: MediaUrl via Twilio Gateway
    const result = await twilioSendAudioFromUrl(phone, audioUrl);
    return { success: result.success, provider: 'official', error: result.error };
  }, `sendAudioUrl(${phone.substring(0, 4)}***)`);
}
