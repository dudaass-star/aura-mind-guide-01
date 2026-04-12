/**
 * WhatsApp Official API - Twilio Gateway (sending) + Meta webhook (receiving)
 * 
 * Modelo híbrido:
 * - ENVIO: via Twilio Gateway (connector-gateway.lovable.dev/twilio)
 * - RECEBIMENTO: via webhook-meta (Meta Cloud API direta)
 * 
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

export interface TwilioSendResult {
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

// Keep alias for backwards compat
export type MetaSendResult = TwilioSendResult;

// ============================================================================
// TWILIO GATEWAY CONFIG
// ============================================================================

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

function getGatewayHeaders(): Record<string, string> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableKey) throw new Error('LOVABLE_API_KEY is not configured');

  const twilioKey = Deno.env.get('TWILIO_API_KEY');
  if (!twilioKey) throw new Error('TWILIO_API_KEY is not configured');

  return {
    'Authorization': `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': twilioKey,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

function getFromNumber(): string {
  const from = Deno.env.get('TWILIO_WHATSAPP_FROM');
  if (!from) throw new Error('TWILIO_WHATSAPP_FROM is not configured');
  return from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
}

function formatPhoneForTwilio(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) throw new Error(`Invalid phone number (no digits): "${phone}"`);
  const withCountry = clean.startsWith('55') ? clean : `55${clean}`;
  return `whatsapp:+${withCountry}`;
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
// SEND FREE TEXT (within 24h window) - via Twilio Gateway
// ============================================================================

export async function sendFreeText(phone: string, text: string): Promise<TwilioSendResult> {
  try {
    if (!phone || !phone.replace(/\D/g, '')) {
      return { success: false, error: `Invalid phone number: "${phone}"` };
    }
    const to = formatPhoneForTwilio(phone);
    const from = getFromNumber();
    const headers = getGatewayHeaders();

    console.log(`📨 [Twilio] Sending free text | To: ${to} | Body length: ${text.length}`);

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ To: to, From: from, Body: text }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Twilio API error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Twilio] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`✅ [Twilio] Free text sent, SID: ${data.sid}`);
    return { success: true, messageId: data.sid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Twilio] sendFreeText error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND TEMPLATE MESSAGE - via Twilio Gateway (ContentSid)
// ============================================================================

export async function sendTemplateMessage(
  phone: string,
  contentSid: string,
  variables: string[],
  _languageCode: string = 'pt_BR',
): Promise<TwilioSendResult> {
  if (!phone || !phone.replace(/\D/g, '')) {
    return { success: false, error: `Invalid phone number: "${phone}"` };
  }
  try {
    const to = formatPhoneForTwilio(phone);
    const from = getFromNumber();
    const headers = getGatewayHeaders();

    console.log(`📨 [Twilio] Sending template ContentSid="${contentSid}" to ${to}`);

    const params: Record<string, string> = {
      To: to,
      From: from,
      ContentSid: contentSid,
    };

    if (variables.length > 0) {
      const varsObj: Record<string, string> = {};
      variables.forEach((v, i) => { varsObj[String(i + 1)] = v; });
      params.ContentVariables = JSON.stringify(varsObj);
    }

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(params),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Twilio template error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Twilio] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`✅ [Twilio] Template sent, SID: ${data.sid}`);
    return { success: true, messageId: data.sid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Twilio] sendTemplateMessage error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND AUDIO VIA URL - via Twilio Gateway
// ============================================================================

export async function sendAudioFromUrl(phone: string, audioUrl: string): Promise<TwilioSendResult> {
  try {
    if (!phone || !phone.replace(/\D/g, '')) {
      return { success: false, error: `Invalid phone number: "${phone}"` };
    }
    const to = formatPhoneForTwilio(phone);
    const from = getFromNumber();
    const headers = getGatewayHeaders();

    console.log(`🎵 [Twilio] Sending audio URL to ${to}`);

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        To: to,
        From: from,
        MediaUrl: audioUrl,
        Body: '',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Twilio audio error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Twilio] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`✅ [Twilio] Audio sent, SID: ${data.sid}`);
    return { success: true, messageId: data.sid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Twilio] sendAudioFromUrl error: ${msg}`);
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
 * 2. Janela fechada → template envelope (pago via ContentSid)
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
      if (['weekly_report', 'content'].includes(templateCategory)) {
        console.log(`✅ [Twilio] 24h window open, but forcing teaser for ${templateCategory}`);
        const messageToSend = teaserText || text;
        const result = await sendFreeText(phone, messageToSend);
        return { success: result.success, parts: 1, type: 'freetext', error: result.error };
      }
      console.log('✅ [Twilio] 24h window open, sending as free text');
      const result = await sendFreeText(phone, text);
      return { success: result.success, parts: 1, type: 'freetext', error: result.error };
    }

    // Window closed → template via ContentSid
    const { data: templateConfig } = await supabase
      .from('whatsapp_templates')
      .select('template_name, twilio_content_sid, prefix, is_active, language_code')
      .eq('category', templateCategory)
      .single();

    if (!templateConfig) {
      return { success: false, parts: 0, type: 'template', error: `Template category "${templateCategory}" not found` };
    }

    if (!templateConfig.is_active) {
      const errMsg = `Template "${templateCategory}" not active/approved. Cannot send outside 24h window without approved template. Aborting to protect Meta account quality.`;
      console.error(`🛑 [Twilio] ${errMsg}`);
      return { success: false, parts: 0, type: 'template', error: errMsg };
    }

    const contentSid = templateConfig.twilio_content_sid;
    if (!contentSid) {
      return { success: false, parts: 0, type: 'template', error: `Template "${templateCategory}" has no ContentSid configured` };
    }

    // If structured template variables provided explicitly, use them directly
    if (templateVariables && templateVariables.length > 0) {
      console.log(`📨 [Twilio] Sending template ContentSid="${contentSid}" with ${templateVariables.length} structured variable(s)`);
      const templateResult = await sendTemplateMessage(phone, contentSid, templateVariables);
      return { success: templateResult.success, parts: 1, type: 'template', error: templateResult.error };
    }

    // Auto-resolve first name as the ONLY variable
    const firstName = userName ? userName.split(' ')[0] : 'there';
    console.log(`📨 [Twilio] Sending template ContentSid="${contentSid}" with auto-resolved name: "${firstName}"`);

    const templateResult = await sendTemplateMessage(phone, contentSid, [firstName]);
    return { success: templateResult.success, parts: 1, type: 'template', error: templateResult.error };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Twilio] Proactive message error:', errorMessage);
    return { success: false, parts: 0, type: 'template', error: errorMessage };
  }
}
