// Regras determinísticas do chat de suporte do App: limite de turnos e derivação para humano.
export const MAX_USER_TURNS = 4;
export const HUMAN_REQUEST_RE = /\b(atendente|humano|uma pessoa|algu[eé]m da equipe|falar com (algu[eé]m|a equipe|uma pessoa)|pessoa de verdade)\b/i;
export const SENSITIVE_RE = /reembols|estorn|devolu[cç][aã]o|dinheiro de volta|cobran[cç]a (duplicada|indevida|em dobro)|cobraram (duas|2) vezes|procon|advogad|processo judicial|reclame ?aqui|chargeback|contesta[cç][aã]o|lgpd|apagar (meus )?dados|excluir (minha )?conta/i;

export type HandoffReason = "pedido_humano" | "tema_sensivel" | "limite_turnos" | null;

// Decide antes da IA se a conversa deve ir para a equipe humana.
export function deterministicHandoff(userTurns: string[]): HandoffReason {
  const last = userTurns[userTurns.length - 1] ?? "";
  if (HUMAN_REQUEST_RE.test(last)) return "pedido_humano";
  if (SENSITIVE_RE.test(last)) return "tema_sensivel";
  if (userTurns.length > MAX_USER_TURNS) return "limite_turnos";
  return null;
}
