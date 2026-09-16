function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RE_EXPLICIT_STOP = /(para|pare|parem|parar|cancele|cancelar|remove|remova|remover|exclua|excluir|tira|tirar).{0,35}(mensage|whatsapp|contato|numero|lista)|descadastr|sair da lista|nao (me )?(mande|envie|chame|procure|contate)|nao quero (mais )?(receber|mensagem|contato)/i;

const RE_HUMAN_REQUEST = /\b(atendente|humano|pessoa de verdade)\b/i;

const RE_LITE_ACCEPT = /\b(quero|aceito|vou|pode|manda|envia|assino|fecho|fazer|seguir|ficar|mudar|trocar|reativar|reativo|continuar|bora|sim)\b.{0,30}\b(lite|life)\b|\b(lite|life)\b.{0,30}\b(quero|aceito|vou|pode|manda|envia|assino|fecho|fazer|seguir|ficar|mudar|trocar|reativar|reativo|continuar|bora|sim)\b/i;

/** Pedido inequívoco para interromper contato; objeção de preço não é opt-out. */
export function isExplicitStopRequest(text: string): boolean {
  const normalized = normalizeText(text);
  return RE_EXPLICIT_STOP.test(normalized);
}

/** Pedido explícito para falar com uma pessoa. */
export function isHumanRequest(text: string): boolean {
  return RE_HUMAN_REQUEST.test(normalizeText(text));
}

/** Aceite do Lite. Só deve ser usado quando há uma oferta Lite recente entregue. */
export function isLiteAcceptance(text: string): boolean {
  return RE_LITE_ACCEPT.test(normalizeText(text));
}