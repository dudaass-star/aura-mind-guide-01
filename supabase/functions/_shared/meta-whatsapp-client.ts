/**
 * Cliente Meta Cloud API direta para WhatsApp Business
 *
 * Espelha a interface de `whatsapp-official.ts` (que hoje vai pro Twilio Gateway),
 * mas chama `graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` diretamente.
 *
 * Usado quando `system_config.whatsapp_provider = 'meta'`. Twilio segue intocado.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PROACTIVE_TITLES,
  prefixWithTitle,
  isWithin24hWindow,
  type TemplateCategory,
  type TwilioSendResult,
  type ProactiveMessageResult,
} from "./whatsapp-official.ts";

// ============================================================================
// META CLOUD API CONFIG
// ============================================================================

const META_GRAPH_VERSION = 'v21.0';

function getMetaConfig(): { token: string; phoneNumberId: string } {
  const token = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  if (!token) throw new Error('META_WHATSAPP_ACCESS_TOKEN is not configured');
  const phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) throw new Error('META_WHATSAPP_PHONE_NUMBER_ID is not configured');
  return { token, phoneNumberId };
}

/**
 * Meta exige E.164 sem `+` e sem prefixo `whatsapp:` — só dígitos (ex. `5511999998888`).
 * Normaliza adicionando `55` se ausente (mesmo padrão do Twilio client).
 */
function formatPhoneForMeta(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) throw new Error(`Invalid phone number (no digits): "${phone}"`);
  return clean.startsWith('55') ? clean : `55${clean}`;
}

function metaUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
}

function metaHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// SEND FREE TEXT (dentro da janela de 24h)
// ============================================================================

export async function sendFreeText(phone: string, text: string): Promise<TwilioSendResult> {
  try {
    if (!phone || !phone.replace(/\D/g, '')) {
      return { success: false, error: `Invalid phone number: "${phone}"` };
    }
    const { token, phoneNumberId } = getMetaConfig();
    const to = formatPhoneForMeta(phone);

    console.log(`📨 [Meta] Sending free text | To: ${to.substring(0, 4)}*** | Body length: ${text.length}`);

    const response = await fetch(metaUrl(phoneNumberId), {
      method: 'POST',
      headers: metaHeaders(token),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Meta API error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Meta] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const wamid = data?.messages?.[0]?.id;
    console.log(`✅ [Meta] Free text sent, wamid: ${wamid}`);
    return { success: true, messageId: wamid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta] sendFreeText error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND TEMPLATE MESSAGE (fora da janela de 24h — Cloud API direta)
// ============================================================================

/**
 * Envia template aprovado por nome (Meta Cloud API).
 * Variáveis viram parâmetros do componente "body" do template.
 */
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  languageCode: string,
  variables: string[],
): Promise<TwilioSendResult> {
  if (!phone || !phone.replace(/\D/g, '')) {
    return { success: false, error: `Invalid phone number: "${phone}"` };
  }
  try {
    const { token, phoneNumberId } = getMetaConfig();
    const to = formatPhoneForMeta(phone);

    console.log(`📨 [Meta] Sending template name="${templateName}" lang=${languageCode} to ${to.substring(0, 4)}***`);

    const components: Array<Record<string, unknown>> = [];
    if (variables.length > 0) {
      components.push({
        type: 'body',
        parameters: variables.map(v => ({ type: 'text', text: v })),
      });
    }

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    const response = await fetch(metaUrl(phoneNumberId), {
      method: 'POST',
      headers: metaHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = `Meta template error [${response.status}]: ${JSON.stringify(data)}`;
      console.error(`❌ [Meta] ${errMsg}`);
      return { success: false, error: errMsg };
    }

    const wamid = data?.messages?.[0]?.id;
    console.log(`✅ [Meta] Template sent, wamid: ${wamid}`);
    return { success: true, messageId: wamid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta] sendTemplateMessage error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// SEND AUDIO VIA URL pública
// ============================================================================

export async function sendAudioFromUrl(phone: string, audioUrl: string): Promise<TwilioSendResult> {
  try {
    if (!phone || !phone.replace(/\D/g, '')) {
      return { success: false, error: `Invalid phone number: "${phone}"` };
    }
    const { token, phoneNumberId } = getMetaConfig();
    const to = formatPhoneForMeta(phone);

    console.log(`🎵 [Meta] Sending audio URL to ${to.substring(0, 4)}***`);

    const response = await fetch(metaUrl(phoneNumberId), {
      method: 'POST',
      headers: metaHeaders(token),
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

    const wamid = data?.messages?.[0]?.id;
    console.log(`✅ [Meta] Audio sent, wamid: ${wamid}`);
    return { success: true, messageId: wamid };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta] sendAudioFromUrl error: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============================================================================
// TEMPLATE-ONLY SENDER (QA / reenvio forçado)
// ============================================================================

/**
 * Envia OBRIGATORIAMENTE um template aprovado, sem checar janela de 24h.
 * Falha fechado se o template não estiver ativo ou sem `meta_template_name`.
 */
export async function sendTemplateOnly(
  phone: string,
  templateCategory: TemplateCategory,
  userId?: string,
  templateVariables?: string[],
): Promise<ProactiveMessageResult> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: templateConfig } = await supabase
      .from('whatsapp_templates')
      .select('template_name, meta_template_name, meta_language_code, is_active')
      .eq('category', templateCategory)
      .single();

    if (!templateConfig) {
      return { success: false, parts: 0, type: 'template', error: `Template category "${templateCategory}" not found` };
    }
    if (!templateConfig.is_active) {
      return { success: false, parts: 0, type: 'template', error: `Template "${templateCategory}" is not active` };
    }
    const metaName = templateConfig.meta_template_name || templateConfig.template_name;
    if (!metaName) {
      return { success: false, parts: 0, type: 'template', error: `Template "${templateCategory}" has no meta_template_name configured` };
    }
    const langCode = templateConfig.meta_language_code || 'pt_BR';

    // Resolve variables: explicit > first name > "there"
    let variables = templateVariables ?? [];
    if (variables.length === 0 && userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', userId)
        .single();
      const firstName = profile?.name ? profile.name.split(' ')[0] : 'there';
      variables = [firstName];
    }
    if (variables.length === 0) variables = ['there'];

    console.log(`📨 [Meta][TemplateOnly] Sending "${metaName}" (${langCode}) to ${phone.substring(0, 4)}*** vars=${JSON.stringify(variables)}`);

    const result = await sendTemplateMessage(phone, metaName, langCode, variables);
    return { success: result.success, parts: 1, type: 'template', error: result.error, messageId: result.messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [Meta][TemplateOnly] error: ${msg}`);
    return { success: false, parts: 0, type: 'template', error: msg };
  }
}

// ============================================================================
// PROACTIVE MESSAGE SENDER
// ============================================================================

/**
 * Envia uma mensagem proativa via Meta Cloud API.
 *
 * 1. Janela 24h aberta → texto livre (grátis)
 * 2. Janela fechada → template aprovado (utility/marketing)
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

    const title = PROACTIVE_TITLES[templateCategory];

    // Janela aberta → texto livre (com teaser pra weekly/content, igual Twilio)
    if (windowOpen) {
      if (['weekly_report', 'content'].includes(templateCategory)) {
        console.log(`✅ [Meta] 24h window open, forcing teaser for ${templateCategory}`);
        const baseMessage = teaserText || text;
        const messageToSend = title ? prefixWithTitle(title, baseMessage) : baseMessage;
        const result = await sendFreeText(phone, messageToSend);
        return { success: result.success, parts: 1, type: 'freetext', error: result.error };
      }
      console.log('✅ [Meta] 24h window open, sending as free text');
      const messageToSend = title ? prefixWithTitle(title, text) : text;
      const result = await sendFreeText(phone, messageToSend);
      return { success: result.success, parts: 1, type: 'freetext', error: result.error };
    }

    // Janela fechada → template aprovado
    const { data: templateConfig } = await supabase
      .from('whatsapp_templates')
      .select('template_name, meta_template_name, meta_language_code, is_active')
      .eq('category', templateCategory)
      .single();

    if (!templateConfig) {
      return { success: false, parts: 0, type: 'template', error: `Template category "${templateCategory}" not found` };
    }
    if (!templateConfig.is_active) {
      const errMsg = `Template "${templateCategory}" not active. Cannot send outside 24h window. Aborting to protect Meta account quality.`;
      console.error(`🛑 [Meta] ${errMsg}`);
      return { success: false, parts: 0, type: 'template', error: errMsg };
    }
    const metaName = templateConfig.meta_template_name || templateConfig.template_name;
    if (!metaName) {
      return { success: false, parts: 0, type: 'template', error: `Template "${templateCategory}" has no meta_template_name configured` };
    }
    const langCode = templateConfig.meta_language_code || 'pt_BR';

    // Variáveis explícitas têm prioridade
    if (templateVariables && templateVariables.length > 0) {
      console.log(`📨 [Meta] Sending template "${metaName}" with ${templateVariables.length} structured variable(s)`);
      const r = await sendTemplateMessage(phone, metaName, langCode, templateVariables);
      return { success: r.success, parts: 1, type: 'template', error: r.error, messageId: r.messageId };
    }

    // Auto-resolve primeiro nome como única variável (padrão Aura)
    const firstName = userName ? userName.split(' ')[0] : 'there';
    console.log(`📨 [Meta] Sending template "${metaName}" with auto-resolved name: "${firstName}"`);

    const r = await sendTemplateMessage(phone, metaName, langCode, [firstName]);
    return { success: r.success, parts: 1, type: 'template', error: r.error, messageId: r.messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [Meta] Proactive message error:', msg);
    return { success: false, parts: 0, type: 'template', error: msg };
  }
}

// ============================================================================
// META MEDIA DOWNLOAD (para áudios recebidos no webhook)
// ============================================================================

/**
 * Baixa um arquivo de mídia da Meta Cloud API a partir do media ID.
 * Fluxo: GET /{media_id} → retorna URL assinada curta → GET <url> com Bearer.
 */
export async function downloadMetaMedia(mediaId: string): Promise<Blob | null> {
  try {
    const { token } = getMetaConfig();

    const metaRes = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.error(`❌ [Meta] media metadata fetch failed: ${metaRes.status}`);
      return null;
    }
    const meta = await metaRes.json();
    const mediaUrl = meta?.url;
    if (!mediaUrl) {
      console.error('❌ [Meta] media metadata has no url');
      return null;
    }

    const blobRes = await fetch(mediaUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!blobRes.ok) {
      console.error(`❌ [Meta] media blob fetch failed: ${blobRes.status}`);
      return null;
    }
    return await blobRes.blob();
  } catch (error) {
    console.error('❌ [Meta] downloadMetaMedia error:', error);
    return null;
  }
}