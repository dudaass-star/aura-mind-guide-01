// Tipos de mensagem operacional do WhatsApp (convite ao App, suporte, avisos)
// que não fazem parte da conversa terapêutica e não devem alimentar resumos/análises.
export const NON_CONVERSATION_KINDS = ['response_failure', 'app_migration_redirect', 'operational_support', 'support_acknowledgement', 'whatsapp_access_notice'];

export function isConversationMessage(m: { metadata?: { kind?: string } | null }): boolean {
  return !NON_CONVERSATION_KINDS.includes(m?.metadata?.kind ?? '');
}
