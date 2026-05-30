// Helpers para deep-link no WhatsApp da Aura.
// Número oficial canônico (Twilio): +1 (662) 525-5005.
export const AURA_WHATSAPP_NUMBER = "16625255005";

export function auraWhatsAppLink(prefilled?: string): string {
  const base = `https://wa.me/${AURA_WHATSAPP_NUMBER}`;
  if (!prefilled) return base;
  return `${base}?text=${encodeURIComponent(prefilled)}`;
}

// ============ Cardápio de Fechamento ============
// Mapeia o closure_type da sessão para título do card e rótulo do botão na aba "Hoje".
export type ClosureType =
  | "tese"
  | "encruzilhada"
  | "leitura"
  | "experimento"
  | "pergunta-pra-carregar"
  | "escolha-binaria"
  | "micro-passo";

export interface ClosurePresentation {
  title: string;
  buttonLabel: string;
  prefilledMessage: string;
}

export function presentClosure(
  closureType: string | null | undefined,
  closureText?: string | null,
): ClosurePresentation {
  const t = (closureType || "").toLowerCase() as ClosureType;
  const echo = closureText ? `Sobre "${closureText.slice(0, 80)}${closureText.length > 80 ? "…" : ""}": ` : "";

  switch (t) {
    case "pergunta-pra-carregar":
      return {
        title: "Pergunta pra carregar",
        buttonLabel: "Responder pra Aura",
        prefilledMessage: `${echo}quero responder essa pergunta.`,
      };
    case "leitura":
      return {
        title: "Leitura da Aura",
        buttonLabel: "Responder pra Aura",
        prefilledMessage: `${echo}quero falar sobre essa leitura.`,
      };
    case "experimento":
      return {
        title: "Experimento dessa semana",
        buttonLabel: "Contar pra Aura como foi",
        prefilledMessage: `${echo}quero contar como foi o experimento.`,
      };
    case "escolha-binaria":
      return {
        title: "Escolha aberta",
        buttonLabel: "Contar pra Aura como foi",
        prefilledMessage: `${echo}quero te contar o que escolhi.`,
      };
    case "micro-passo":
      return {
        title: "Próximo passo",
        buttonLabel: "Contar pra Aura como foi",
        prefilledMessage: `${echo}quero contar como foi esse passo.`,
      };
    case "tese":
      return {
        title: "Tese da Aura",
        buttonLabel: "Continuar essa conversa",
        prefilledMessage: `${echo}quero continuar essa conversa.`,
      };
    case "encruzilhada":
      return {
        title: "Encruzilhada",
        buttonLabel: "Continuar essa conversa",
        prefilledMessage: `${echo}quero pensar mais sobre essa encruzilhada.`,
      };
    default:
      return {
        title: "O que ficou da última sessão",
        buttonLabel: "Continuar com a Aura",
        prefilledMessage: "Oi Aura, quero continuar de onde paramos na última sessão.",
      };
  }
}