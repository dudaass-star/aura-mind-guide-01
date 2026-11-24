// Avisos que existem só para o WhatsApp (convite ao App, suporte operacional)
// ficam no histórico para auditoria, mas não são fala da Aura dentro do App.
const WHATSAPP_ONLY_KINDS = new Set(["app_migration_redirect", "operational_support", "support_acknowledgement", "whatsapp_access_notice"]);
export function isWhatsAppOnlyNotice(message: { role: string; metadata?: unknown; channel?: string | null }) {
  if (message.role !== "assistant") return false;
  if (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata)) return false;
  return WHATSAPP_ONLY_KINDS.has(String((message.metadata as Record<string, unknown>).kind ?? ""));
}
