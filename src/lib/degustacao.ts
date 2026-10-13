import { supabasePortal } from "@/integrations/supabase/portal-client";

// Degustação gratuita: 1 sessão cortesia + 1 oração + 1 meditação, sem plano.
export type DegustacaoReason = "session_end" | "session" | "chat" | "prayer" | "meditation" | "manual";

export const DEGUSTACAO_EVENT = "aura:open-degustacao-plans";

export function openDegustacaoPlans(reason: DegustacaoReason) {
  window.dispatchEvent(new CustomEvent(DEGUSTACAO_EVENT, { detail: { reason } }));
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
  { id: "essencial", name: "Essencial", price: 29.9, sessions: "1 sessão guiada por mês", features: ["Conversas ilimitadas com a AURA", "Todas as orações e meditações"], highlight: false },
  { id: "direcao", name: "Direção", price: 49.9, sessions: "4 sessões guiadas por mês", features: ["Um encontro por semana", "Resumo escrito após cada sessão", "Tudo do Essencial"], highlight: true },
  { id: "transformacao", name: "Transformação", price: 79.9, sessions: "8 sessões guiadas por mês", features: ["Dois encontros por semana", "Prioridade em momentos difíceis", "Tudo do Direção"], highlight: false },
] as const;

export type DegustacaoPlanId = (typeof DEGUSTACAO_PLANS)[number]["id"];
