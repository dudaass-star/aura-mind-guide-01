/**
 * WhatsApp Official API - Twilio Gateway Integration
 * 
 * Implementação real usando Twilio Content Templates + Free Text.
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
  | 'session_reminder'
  | 'reactivation'
  | 'checkout_recovery'
  | 'welcome'
  | 'welcome_trial'
  | 'reconnect'
  | 'dunning'
  | 'followup'
  | 'access_blocked';

export interface TwilioSendResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

export interface ProactiveMessageResult {
  success: boolean;
  parts: number;
  type: 'template' | 'freetext';
  error?: string;
}

// ============================================================================
// GATEWAY CONFIG
// ============================================================================

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

function getGatewayHeaders(): { Authorization: string; 'X-Connection-Api-Key': string; 'Content-Type': string } {
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
  return from;
}

function formatWhatsAppNumber(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return `whatsapp:+${clean}`;
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

export async function sendFreeText(phone: string, text: string): Promise<TwilioSendResult> {
  try {
    const headers = getGatewayHeaders();
    const from = getFromNumber();
    const to = formatWhatsAppNumber(phone);

    console.log(`📨 [Twilio] Sending free text to ${to}`);

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
    return { success: true, messageSid: data.sid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Twilio] sendFreeText error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND TEMPLATE MESSAGE (ContentSid)
// ============================================================================

export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  variables: string[],
): Promise<TwilioSendResult> {
  try {
    // Look up template in DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: template, error: dbError } = await supabase
      .from('whatsapp_templates')
      .select('twilio_content_sid, is_active')
      .eq('template_name', templateName)
      .single();

    if (dbError || !template) {
      return { success: false, error: `Template "${templateName}" not found in DB` };
    }

    if (!template.is_active || template.twilio_content_sid === 'PENDING_APPROVAL') {
      return { success: false, error: `Template "${templateName}" is not active or pending approval` };
    }

    const headers = getGatewayHeaders();
    const from = getFromNumber();
    const to = formatWhatsAppNumber(phone);

    // Build ContentVariables: {"1": "value1", "2": "value2", ...}
    const contentVars: Record<string, string> = {};
    variables.forEach((v, i) => { contentVars[String(i + 1)] = v; });

    console.log(`📨 [Twilio] Sending template "${templateName}" (SID: ${template.twilio_content_sid}) to ${to}`);

    const body = new URLSearchParams({
      To: to,
      From: from,
      ContentSid: template.twilio_content_sid,
      ContentVariables: JSON.stringify(contentVars),
    });

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Twilio template error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Twilio] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`✅ [Twilio] Template sent, SID: ${data.sid}`);
    return { success: true, messageSid: data.sid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Twilio] sendTemplateMessage error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND AUDIO VIA URL (MediaUrl)
// ============================================================================

export async function sendAudioFromUrl(phone: string, audioUrl: string): Promise<TwilioSendResult> {
  try {
    const headers = getGatewayHeaders();
    const from = getFromNumber();
    const to = formatWhatsAppNumber(phone);

    console.log(`🎵 [Twilio] Sending audio URL to ${to}`);

    const response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ To: to, From: from, MediaUrl: audioUrl }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Twilio audio error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Twilio] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    console.log(`✅ [Twilio] Audio sent, SID: ${data.sid}`);
    return { success: true, messageSid: data.sid };
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
 * 2. Janela fechada → template envelope (pago) + partes extras como texto livre
 */
export async function sendProactiveMessage(
  phone: string,
  text: string,
  templateCategory: TemplateCategory = 'checkin',
  userId?: string,
): Promise<ProactiveMessageResult> {
  try {
    // Check 24h window
    let windowOpen = false;

    if (userId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: profile } = await supabase
        .from('profiles')
        .select('last_user_message_at')
        .eq('user_id', userId)
        .single();

      windowOpen = isWithin24hWindow(profile?.last_user_message_at);
    }

    // Window open → free text
    if (windowOpen) {
      console.log('✅ [Twilio] 24h window open, sending as free text');
      const result = await sendFreeText(phone, text);
      return { success: result.success, parts: 1, type: 'freetext', error: result.error };
    }

    // Window closed → template
    // Look up template config from DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: templateConfig } = await supabase
      .from('whatsapp_templates')
      .select('template_name, prefix, twilio_content_sid, is_active')
      .eq('category', templateCategory)
      .single();

    if (!templateConfig) {
      return { success: false, parts: 0, type: 'template', error: `Template category "${templateCategory}" not found` };
    }

    if (!templateConfig.is_active || templateConfig.twilio_content_sid === 'PENDING_APPROVAL') {
      // Fallback: try free text anyway (may fail if outside window)
      console.warn(`⚠️ [Twilio] Template "${templateCategory}" not active, attempting free text fallback`);
      const result = await sendFreeText(phone, text);
      return { success: result.success, parts: 1, type: 'freetext', error: result.error };
    }

    const parts = splitMessageForTemplate(text, templateConfig.prefix.length);
    console.log(`📨 [Twilio] Sending ${parts.length} part(s) via template "${templateConfig.template_name}"`);

    // Part 1: Template
    const templateResult = await sendTemplateMessage(phone, templateConfig.template_name, [parts[0]]);

    if (!templateResult.success) {
      return { success: false, parts: 0, type: 'template', error: templateResult.error };
    }

    // Parts 2+: Free text (window opened by template)
    for (let i = 1; i < parts.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log(`📨 [Twilio] Sending part ${i + 1}/${parts.length} as free text`);
      const freeResult = await sendFreeText(phone, parts[i]);
      if (!freeResult.success) {
        console.warn(`⚠️ [Twilio] Part ${i + 1} failed: ${freeResult.error}`);
      }
    }

    return { success: true, parts: parts.length, type: 'template' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Twilio] Proactive message error:', errorMessage);
    return { success: false, parts: 0, type: 'template', error: errorMessage };
  }
}
