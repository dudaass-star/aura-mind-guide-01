/**
 * WhatsApp Official API - Template envelope system
 * 
 * Preparação para migração da Z-API para API Oficial do WhatsApp.
 * Este módulo NÃO é usado enquanto WHATSAPP_PROVIDER = 'zapi'.
 * 
 * Estratégia: "templates envelope" com prefixo de ancoragem + split automático
 * para mensagens >1024 chars (limite do body da Meta).
 */

import { sendTextMessage } from "./zapi-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TEMPLATE MAP
// ============================================================================

export type TemplateCategory =
  | 'checkin'
  | 'content'
  | 'weekly_report'
  | 'insight'
  | 'session_reminder'
  | 'reactivation'
  | 'checkout_recovery';

interface TemplateConfig {
  name: string;
  prefix: string;
  category: 'utility' | 'marketing';
}

export const TEMPLATE_MAP: Record<TemplateCategory, TemplateConfig> = {
  checkin:           { name: 'aura_checkin',             prefix: 'Seu check-in 🌿\n\n',                category: 'utility' },
  content:           { name: 'aura_content',             prefix: 'Conteúdo da jornada 🌱\n\n',         category: 'utility' },
  weekly_report:     { name: 'aura_weekly_report',       prefix: 'Seu resumo semanal 📊\n\n',          category: 'utility' },
  insight:           { name: 'aura_insight',             prefix: 'Insight da Aura ✨\n\n',              category: 'utility' },
  session_reminder:  { name: 'aura_session_reminder',    prefix: 'Lembrete de sessão 🕐\n\n',          category: 'utility' },
  reactivation:      { name: 'aura_reactivation',        prefix: 'Oi, sentimos sua falta 💜\n\n',      category: 'marketing' },
  checkout_recovery: { name: 'aura_checkout_recovery',   prefix: 'Seu acesso está esperando ✨\n\n',   category: 'marketing' },
};

// ============================================================================
// 24-HOUR WINDOW CHECK
// ============================================================================

/**
 * Verifica se a última mensagem do usuário está dentro da janela de 24h.
 * Se sim, podemos enviar texto livre (sem template/custo).
 */
export function isWithin24hWindow(lastUserMessageAt: string | null | undefined): boolean {
  if (!lastUserMessageAt) return false;

  const lastMsg = new Date(lastUserMessageAt);
  const now = new Date();
  const diffMs = now.getTime() - lastMsg.getTime();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  return diffMs < twentyFourHoursMs;
}

// ============================================================================
// MESSAGE SPLITTING
// ============================================================================

/**
 * Meta body limit = 1024 chars total (prefix + variable).
 * Margem de segurança: 980 chars para o conteúdo da variável.
 */
const MAX_TEMPLATE_BODY = 1024;
const SAFETY_MARGIN = 44; // espaço para prefixo + formatação

/**
 * Divide uma mensagem longa em partes que cabem no template.
 * - Parte 1: vai dentro do template (≤ maxChars)
 * - Partes 2+: texto livre (enviadas na janela aberta pelo template)
 * 
 * Tenta cortar em quebra de linha ou espaço para não cortar palavras.
 */
export function splitMessageForTemplate(
  text: string,
  prefixLength: number
): string[] {
  const maxFirstPart = MAX_TEMPLATE_BODY - prefixLength - SAFETY_MARGIN;
  
  if (text.length <= maxFirstPart) {
    return [text];
  }

  const parts: string[] = [];
  let remaining = text;
  let isFirst = true;

  while (remaining.length > 0) {
    const maxLen = isFirst ? maxFirstPart : 4096; // partes livres podem ser maiores
    
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }

    // Tentar cortar em \n\n, depois \n, depois espaço
    let cutPoint = remaining.lastIndexOf('\n\n', maxLen);
    if (cutPoint < maxLen * 0.5) {
      cutPoint = remaining.lastIndexOf('\n', maxLen);
    }
    if (cutPoint < maxLen * 0.5) {
      cutPoint = remaining.lastIndexOf(' ', maxLen);
    }
    if (cutPoint < maxLen * 0.3) {
      cutPoint = maxLen; // force cut
    }

    parts.push(remaining.substring(0, cutPoint).trimEnd());
    remaining = remaining.substring(cutPoint).trimStart();
    isFirst = false;
  }

  return parts;
}

// ============================================================================
// TEMPLATE MESSAGE SENDER (placeholder)
// ============================================================================

export interface TemplateMessageResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

/**
 * Envia uma mensagem via template da API Oficial do WhatsApp.
 * 
 * PLACEHOLDER: Esta função será implementada na Fase 2 quando
 * o provedor for escolhido (Twilio, Gupshup, 360dialog, etc).
 */
export async function sendTemplateMessage(
  _phone: string,
  _templateName: string,
  _variables: string[],
  _config?: unknown
): Promise<TemplateMessageResult> {
  console.error('❌ [WhatsApp Official] sendTemplateMessage not configured yet');
  return {
    success: false,
    error: 'Official WhatsApp API not configured. Set up provider in Phase 2.',
  };
}

// ============================================================================
// PROACTIVE MESSAGE SENDER
// ============================================================================

export interface ProactiveMessageResult {
  success: boolean;
  parts: number;
  type: 'template' | 'freetext';
  error?: string;
}

/**
 * Envia uma mensagem proativa (fora da conversa iniciada pelo usuário).
 * 
 * Lógica:
 * 1. Verifica se a janela de 24h está aberta (via last_user_message_at no profile)
 * 2. Se SIM → texto livre (grátis)
 * 3. Se NÃO → template envelope (pago) + partes extras como texto livre
 * 
 * Para mensagens > 1024 chars:
 * - Parte 1 vai no template (abre a janela)
 * - Partes 2+ como texto livre (grátis, dentro da janela recém-aberta)
 */
export async function sendProactiveMessage(
  phone: string,
  text: string,
  templateCategory: TemplateCategory = 'generic',
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

    // If window is open, send as free text (no template cost)
    if (windowOpen) {
      console.log('✅ [WhatsApp Official] 24h window open, sending as free text');
      // In official API mode, this would use the direct message API
      // For now, placeholder that will be implemented in Phase 2
      return { success: true, parts: 1, type: 'freetext' };
    }

    // Window closed → need template
    const template = TEMPLATE_MAP[templateCategory];
    const parts = splitMessageForTemplate(text, template.prefix.length);
    
    console.log(`📨 [WhatsApp Official] Sending ${parts.length} part(s) via template "${template.name}"`);

    // Part 1: Template message
    const templateResult = await sendTemplateMessage(
      phone,
      template.name,
      [parts[0]], // {{1}} = first part
    );

    if (!templateResult.success) {
      return {
        success: false,
        parts: 0,
        type: 'template',
        error: templateResult.error,
      };
    }

    // Parts 2+: Free text (window opened by template)
    for (let i = 1; i < parts.length; i++) {
      // Small delay between messages for natural feel
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In official API, this would use the direct message endpoint
      // For now, placeholder
      console.log(`📨 [WhatsApp Official] Sending part ${i + 1}/${parts.length} as free text`);
    }

    return {
      success: true,
      parts: parts.length,
      type: 'template',
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [WhatsApp Official] Proactive message error:', errorMessage);
    return {
      success: false,
      parts: 0,
      type: 'template',
      error: errorMessage,
    };
  }
}
