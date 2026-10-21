import { supabasePortal } from "@/integrations/supabase/portal-client";

export type PracticeKind = "meditation" | "prayer";
export type PracticeAudioEvent = "audio_started" | "audio_completed";

// Registra início/conclusão de uma faixa. O `.then()` é obrigatório:
// o construtor de consulta é preguiçoso e não envia nada sem ele.
export function recordPracticeAudio(userId: string | undefined, kind: PracticeKind, event: PracticeAudioEvent, track: { id: string; title?: string; category?: string | null }) {
  if (!userId) return;
  void supabasePortal.from("portal_value_events").insert({
    user_id: userId,
    feature: "practice",
    event_type: event,
    source: "app",
    metadata: { kind, track_id: track.id, title: track.title ?? null, category: track.category ?? null, ...(kind === "meditation" ? { meditation_id: track.id } : { prayer_id: track.id }) },
  }).then(() => undefined);
}
