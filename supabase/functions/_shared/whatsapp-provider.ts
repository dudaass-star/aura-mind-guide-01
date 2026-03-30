/**
 * WhatsApp Provider Abstraction Layer
 * 
 * Camada que decide entre Z-API (atual) e API Oficial do WhatsApp.
 * O provider ativo é controlado pela key `whatsapp_provider` em `system_config`.
 * 
 * Default: 'zapi' — nenhuma mudança no comportamento existente.
 * 
 * Quando WHATSAPP_PROVIDER = 'official':
 * - Mensagens proativas usam templates envelope
 * - Mensagens dentro da janela de 24h usam texto livre
 * - Mensagens de resposta (dentro de conversa) usam texto livre
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTextMessage, sendAudioMessage, sendAudioFromUrl, type ZapiConfig } from "./zapi-client.ts";
import { sendProactiveMessage, type TemplateCategory, type ProactiveMessageResult } from "./whatsapp-official.ts";

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
    
    if (provider === 'official') {
      return 'official';
    }
    
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

/**
 * Envia uma mensagem de texto usando o provider ativo.
 * 
 * Para mensagens proativas (fora da janela de 24h), usar `sendProactive()`.
 * Esta função é para respostas diretas dentro de uma conversa ativa.
 */
export async function sendMessage(
  phone: string,
  text: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  const provider = await getProvider();

  if (provider === 'zapi') {
    const result = await sendTextMessage(phone, text, undefined, configOverride);
    return { success: result.success, provider: 'zapi', error: result.error };
  }

  // Official API: direct message (dentro da janela ou como resposta)
  // Placeholder — será implementado na Fase 2
  console.error('❌ [WhatsApp Provider] Official API direct message not implemented yet');
  return {
    success: false,
    provider: 'official',
    error: 'Official API not configured yet',
  };
}

/**
 * Envia uma mensagem proativa (sem conversa ativa do usuário).
 * 
 * - Z-API: envia texto direto (sem restrição de janela)
 * - Official: usa template envelope se fora da janela de 24h
 */
export async function sendProactive(
  phone: string,
  text: string,
  templateCategory: TemplateCategory = 'generic',
  userId?: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  const provider = await getProvider();

  if (provider === 'zapi') {
    // Z-API não tem restrição de janela — envia direto
    const result = await sendTextMessage(phone, text, undefined, configOverride);
    return { success: result.success, provider: 'zapi', error: result.error };
  }

  // Official API: template envelope + split
  const result: ProactiveMessageResult = await sendProactiveMessage(
    phone,
    text,
    templateCategory,
    userId,
  );
  
  return {
    success: result.success,
    provider: 'official',
    error: result.error,
  };
}

/**
 * Envia áudio usando o provider ativo.
 * Na API oficial, áudio pode ser enviado como mídia dentro da janela de 24h.
 */
export async function sendAudio(
  phone: string,
  audioBase64: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  const provider = await getProvider();

  if (provider === 'zapi') {
    const result = await sendAudioMessage(phone, audioBase64, configOverride);
    return { success: result.success, provider: 'zapi', error: result.error };
  }

  // Official API: placeholder
  console.error('❌ [WhatsApp Provider] Official API audio not implemented yet');
  return {
    success: false,
    provider: 'official',
    error: 'Official API audio not configured yet',
  };
}

/**
 * Envia áudio de URL usando o provider ativo.
 */
export async function sendAudioUrl(
  phone: string,
  audioUrl: string,
  configOverride?: ZapiConfig,
): Promise<SendResult> {
  const provider = await getProvider();

  if (provider === 'zapi') {
    const result = await sendAudioFromUrl(phone, audioUrl, configOverride);
    return { success: result.success, provider: 'zapi', error: result.error };
  }

  // Official API: placeholder
  console.error('❌ [WhatsApp Provider] Official API audio URL not implemented yet');
  return {
    success: false,
    provider: 'official',
    error: 'Official API audio URL not configured yet',
  };
}
