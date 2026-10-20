import { supabasePortal } from "@/integrations/supabase/portal-client";

// Degustação gratuita: 1 sessão cortesia + 1 oração + 1 meditação, sem plano.
export type DegustacaoReason = "session_end" | "session_soon" | "session" | "chat" | "prayer" | "meditation" | "manual";

export const DEGUSTACAO_EVENT = "aura:open-degustacao-plans";

export function openDegustacaoPlans(reason: DegustacaoReason) {
  window.dispatchEvent(new CustomEvent(DEGUSTACAO_EVENT, { detail: { reason } }));
}

export const DEGUSTACAO_START_EVENT = "aura:degustacao-start-request";

/** Avisos do aparelho ativos e registrados. */
export function isPushReady() {
  return typeof window !== "undefined"
    && "Notification" in window
    && Notification.permission === "granted"
    && localStorage.getItem("aura-push-enabled") === "true";
}

/** Pede para iniciar o encontro gratuito passando antes pela ativação dos avisos. */
export function requestDegustacaoStart(message: string) {
  window.dispatchEvent(new CustomEvent(DEGUSTACAO_START_EVENT, { detail: { message } }));
}

/**
 * Libera o conteúdo se a pessoa não estiver em degustação ou se ainda não usou
 * a cortesia daquele tipo. Caso contrário abre os planos e devolve false.
 */
export async function requestDegustacaoContent(kind: "prayer" | "meditation", contentId: string, isDegustacao: boolean): Promise<boolean> {
  if (!isDegustacao) return true;
  const { data, error } = await supabasePortal.rpc("claim_degustacao_content" as never, { _kind: kind, _content_id: contentId } as never);
  if (error) {
    console.warn("Falha ao validar cortesia", error);
    return false;
  }
  const allowed = Boolean((data as { allowed?: boolean } | null)?.allowed);
  if (!allowed) openDegustacaoPlans(kind);
  return allowed;
}

export const DEGUSTACAO_PLANS = [
  { id: "essencial", name: "Essencial", price: 29.9, sessions: "1 sessão guiada por mês", features: ["Conversas ilimitadas com a AURA", "Todas as orações e meditações"], highlight: true },
  { id: "direcao", name: "Direção", price: 49.9, sessions: "4 sessões guiadas por mês", features: ["Um encontro por semana", "Tudo do Essencial"], highlight: false },
  { id: "transformacao", name: "Transformação", price: 79.9, sessions: "8 sessões guiadas por mês", features: ["Dois encontros por semana", "Prioridade em momentos difíceis", "Tudo do Direção"], highlight: false },
] as const;

export type DegustacaoPlanId = (typeof DEGUSTACAO_PLANS)[number]["id"];
