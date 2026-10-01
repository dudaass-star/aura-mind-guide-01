import { supabasePortal } from "@/integrations/supabase/portal-client";

export const MOVEMENT_VISITOR_KEY = "ola-aura-movement-visitor";
export const MOVEMENT_REFERRAL_CODE = "ola-aura-movement-referral";

export function getMovementVisitorKey() {
  let key = localStorage.getItem(MOVEMENT_VISITOR_KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(MOVEMENT_VISITOR_KEY, key);
  }
  return key;
}

export async function recordMovementReach(code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;
  localStorage.setItem(MOVEMENT_REFERRAL_CODE, normalized);
  const { data, error } = await supabasePortal.functions.invoke("movement-public", {
    body: {
      action: "reach",
      referralCode: normalized,
      visitorKey: getMovementVisitorKey(),
    },
  });
  if (error) return null;
  return data?.result as { recorded?: boolean; shared_by?: string } | null;
}

export async function claimMovementReferral() {
  const visitorKey = localStorage.getItem(MOVEMENT_VISITOR_KEY);
  const referralCode = localStorage.getItem(MOVEMENT_REFERRAL_CODE);
  if (!visitorKey || !referralCode) return false;
  const { data, error } = await supabasePortal.functions.invoke("movement-public", {
    body: { action: "claim", visitorKey },
  });
  if (!error && data?.result) localStorage.removeItem(MOVEMENT_REFERRAL_CODE);
  return !error && Boolean(data?.result);
}

export async function decideMovementRecognition(recognitionId: string, decision: "accepted" | "declined") {
  const { data, error } = await supabasePortal.functions.invoke("movement-public", {
    body: { action: "recognition-consent", recognitionId, decision },
  });
  return { ok: !error && Boolean(data?.result?.ok), error };
}

export const MOVEMENT_ACHIEVEMENTS = [
  { id: "first", name: "Primeiro Encontro", description: "Ajudou alguém a iniciar uma conversa.", threshold: 1, metric: "started" },
  { id: "circle", name: "Círculo de Cuidado", description: "Cinco pessoas iniciaram uma conversa.", threshold: 5, metric: "started" },
  { id: "growing", name: "Impacto que Cresce", description: "Dez pessoas iniciaram uma conversa.", threshold: 10, metric: "started" },
  { id: "continues", name: "Caminho que Continua", description: "Alguém decidiu continuar o acompanhamento.", threshold: 1, metric: "continued" },
  { id: "multiplies", name: "Presença que Multiplica", description: "Cinco pessoas decidiram continuar.", threshold: 5, metric: "continued" },
  { id: "voice", name: "Voz do Movimento", description: "Reconhecimento por compartilhar com verdade e constância.", threshold: 1, metric: "voice" },
] as const;

export const PARTICIPANT_ACHIEVEMENTS = [
  { id: "member", name: "Eu Faço Parte", description: "Escolheu fazer parte do Movimento." },
  { id: "cause", name: "Uma Causa em Comum", description: "Escolheu uma mensagem que representa seu apoio." },
  { id: "connected", name: "Presença que Acompanha", description: "Escolheu acompanhar as novidades do Movimento." },
] as const;
