/**
 * WhatsApp Official API - Meta Cloud API Direct Integration
 * 
 * Implementação direta usando Meta Graph API v21.0.
 * Ativado quando WHATSAPP_PROVIDER = 'official' em system_config.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPES
// ============================================================================

export type TemplateCategory =
  | 'checkin'
  | 'content'
  | 'weekly_report'
  | 'insight'
  | 'reactivation'
  | 'welcome'
  | 'welcome_trial'
  | 'reconnect'
  | 'access_blocked';

export interface MetaSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ProactiveMessageResult {
  success: boolean;
  parts: number;
  type: 'template' | 'freetext';
  error?: string;
}

// Keep legacy type alias for backwards compatibility
export type TwilioSendResult = MetaSendResult;

// ============================================================================
// META CLOUD API CONFIG
// ============================================================================

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function getPhoneNumberId(): string {
  const id = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!id) throw new Error('META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  return id;
}

function getAccessToken(): string {
  const token = Deno.env.get('META_ACCESS_TOKEN');
  if (!token) throw new Error('META_ACCESS_TOKEN is not configured');
  return token;
}

function formatPhoneForMeta(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) throw new Error(`Invalid phone number (no digits): "${phone}"`);
  return clean;
}

// ============================================================================
// 24-HOUR WINDOW CHECK
// ============================================================================

export function isWithin24hWindow(lastUserMessageAt: string | null | undefined): boolean {
  if (!lastUserMessageAt) return false;
  const lastMsg = new Date(lastUserMessageAt);
  const now = new Date();
  const diffMs = now.getTime() - lastMsg.getTime();
  return diffMs < 24 * 60 * 60 * 1000;
}

// ============================================================================
// MESSAGE SPLITTING (for template body limit)
// ============================================================================

const MAX_TEMPLATE_BODY = 1024;
const SAFETY_MARGIN = 44;

export function splitMessageForTemplate(text: string, prefixLength: number): string[] {
  const maxFirstPart = MAX_TEMPLATE_BODY - prefixLength - SAFETY_MARGIN;

  if (text.length <= maxFirstPart) return [text];

  const parts: string[] = [];
  let remaining = text;
  let isFirst = true;

  while (remaining.length > 0) {
    const maxLen = isFirst ? maxFirstPart : 4096;

    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }

    let cutPoint = remaining.lastIndexOf('\n\n', maxLen);
    if (cutPoint < maxLen * 0.5) cutPoint = remaining.lastIndexOf('\n', maxLen);
    if (cutPoint < maxLen * 0.5) cutPoint = remaining.lastIndexOf(' ', maxLen);
    if (cutPoint < maxLen * 0.3) cutPoint = maxLen;

    parts.push(remaining.substring(0, cutPoint).trimEnd());
    remaining = remaining.substring(cutPoint).trimStart();
    isFirst = false;
  }

  return parts;
}

// ============================================================================
// SEND FREE TEXT (within 24h window)
// ============================================================================

export async function sendFreeText(phone: string, text: string): Promise<MetaSendResult> {
  try {
    if (!phone || !phone.replace(/\D/g, '')) {
      return { success: false, error: `Invalid phone number: "${phone}"` };
    }
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();
    const to = formatPhoneForMeta(phone);

    console.log(`📨 [Meta] Sending free text | To: ${to} | Body length: ${text.length}`);

    const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Meta API error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Meta] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const messageId = data.messages?.[0]?.id;
    console.log(`✅ [Meta] Free text sent, ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta] sendFreeText error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND TEMPLATE MESSAGE (Meta Cloud API)
// ============================================================================

export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  variables: string[],
  languageCode: string = 'pt_BR',
): Promise<MetaSendResult> {
  if (!phone || !phone.replace(/\D/g, '')) {
    return { success: false, error: `Invalid phone number: "${phone}"` };
  }
  try {
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();
    const to = formatPhoneForMeta(phone);

    // Build template components with variables
    const components: any[] = [];
    if (variables.length > 0) {
      components.push({
        type: 'body',
        parameters: variables.map(v => ({
          type: 'text',
          text: v.replace(/\n+/g, ' '), // Sanitize newlines
        })),
      });
    }

    console.log(`📨 [Meta] Sending template "${templateName}" (lang: ${languageCode}) to ${to}`);

    const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components.length > 0 ? components : undefined,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Meta template error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Meta] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const messageId = data.messages?.[0]?.id;
    console.log(`✅ [Meta] Template sent, ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta] sendTemplateMessage error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND AUDIO VIA URL (Meta Cloud API)
// ============================================================================

export async function sendAudioFromUrl(phone: string, audioUrl: string): Promise<MetaSendResult> {
  try {
    if (!phone || !phone.replace(/\D/g, '')) {
      return { success: false, error: `Invalid phone number: "${phone}"` };
    }
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();
    const to = formatPhoneForMeta(phone);

    console.log(`🎵 [Meta] Sending audio URL to ${to}`);

    const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'audio',
        audio: { link: audioUrl },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Meta audio error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Meta] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const messageId = data.messages?.[0]?.id;
    console.log(`✅ [Meta] Audio sent, ID: ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta] sendAudioFromUrl error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// PROACTIVE MESSAGE SENDER
// ============================================================================

/**
 * Envia uma mensagem proativa (fora da conversa iniciada pelo usuário).
 * 
 * 1. Verifica janela de 24h → texto livre (grátis)
 * 2. Janela fechada → template envelope (pago)
 * 
 * For content/journey messages outside 24h window, pass `teaserText` 
 * (short version with link) to avoid splitting long messages.
 */
export async function sendProactiveMessage(
  phone: string,
  text: string,
  templateCategory: TemplateCategory = 'checkin',
  userId?: string,
  teaserText?: string,
  templateVariables?: string[],
): Promise<ProactiveMessageResult> {
  try {
    // Check 24h window + resolve user name in a single query
    let windowOpen = false;
    let userName: string | null = null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_user_message_at, name')
        .eq('user_id', userId)
        .single();

      windowOpen = isWithin24hWindow(profile?.last_user_message_at);
      userName = profile?.name || null;
    }

    // Window open → free text
    if (windowOpen) {
      // For weekly_report and content: ALWAYS send teaser/link, never full text
      if (['weekly_report', 'content'].includes(templateCategory)) {
        console.log(`✅ [Meta] 24h window open, but forcing teaser for ${templateCategory}`);
        const messageToSend = teaserText || text;
        const result = await sendFreeText(phone, messageToSend);
        return { success: result.success, parts: 1, type: 'freetext', error: result.error };
      }
      // For insight and others: send full text as free text
      console.log('✅ [Meta] 24h window open, sending as free text');
      const result = await sendFreeText(phone, text);
      return { success: result.success, parts: 1, type: 'freetext', error: result.error };
    }

    // Window closed → template ONLY (never inject message text into variables)
    const { data: templateConfig } = await supabase
      .from('whatsapp_templates')
      .select('template_name, prefix, is_active, language_code')
      .eq('category', templateCategory)
      .single();

    if (!templateConfig) {
      return { success: false, parts: 0, type: 'template', error: `Template category "${templateCategory}" not found` };
    }

    if (!templateConfig.is_active) {
      const errMsg = `Template "${templateCategory}" not active. Cannot send outside 24h window without approved template. Aborting to protect Meta account quality.`;
      console.error(`🛑 [Meta] ${errMsg}`);
      return { success: false, parts: 0, type: 'template', error: errMsg };
    }

    const langCode = templateConfig.language_code || 'pt_BR';

    // If structured template variables provided explicitly, use them directly
    if (templateVariables && templateVariables.length > 0) {
      console.log(`📨 [Meta] Sending template "${templateConfig.template_name}" with ${templateVariables.length} structured variable(s)`);
      const templateResult = await sendTemplateMessage(phone, templateConfig.template_name, templateVariables, langCode);
      return { success: templateResult.success, parts: 1, type: 'template', error: templateResult.error };
    }

    // No explicit templateVariables → auto-resolve first name as the ONLY variable
    // NEVER inject message text into template variables (Meta policy protection)
    const firstName = userName ? userName.split(' ')[0] : 'there';
    console.log(`📨 [Meta] Sending template "${templateConfig.template_name}" with auto-resolved name: "${firstName}"`);

    const templateResult = await sendTemplateMessage(phone, templateConfig.template_name, [firstName], langCode);
    return { success: templateResult.success, parts: 1, type: 'template', error: templateResult.error };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Meta] Proactive message error:', errorMessage);
    return { success: false, parts: 0, type: 'template', error: errorMessage };
  }
}
