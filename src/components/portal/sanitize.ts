// Limpa metadados técnicos e markdown básico dos textos do Portal
// (ex.: [CONTENT] prefix de fila proativa, **negrito**, links markdown).
export function sanitizePortalText(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw);
  // Prefixos técnicos de fila de entrega (buffer do WhatsApp)
  s = s.replace(/^\s*\[[A-Z_]+\]\s*/g, "");
  // Negrito/itálico markdown
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|\s)\*([^*]+)\*/g, "$1$2");
  s = s.replace(/__([^_]+)__/g, "$1");
  // Links markdown -> só o texto
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  // URLs cruas
  s = s.replace(/https?:\/\/\S+/g, "").trim();
  // Aspas triplas / colapsa espaços
  return s.replace(/\s{2,}/g, " ").trim();
}
