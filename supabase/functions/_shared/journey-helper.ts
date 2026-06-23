// Helper compartilhado para escolher próxima jornada respeitando o histórico do usuário.
// Evita que o sistema reatribua jornadas que o usuário já concluiu.

export interface PickNextJourneyOptions {
  // Preferência (ex.: tópico mapeado pelo onboarding) — usada se ainda não estiver no histórico.
  preferredJourneyId?: string | null;
  // Se true e todas as jornadas ativas já foram feitas, retorna a mais antiga; senão, retorna null.
  allowRecycle?: boolean;
}

/**
 * Escolhe a próxima jornada para um usuário, excluindo:
 * - a jornada atual do profile (current_journey_id)
 * - todas as jornadas já presentes em user_journey_history
 *
 * Retorna o id da jornada escolhida, ou null se não houver candidata e allowRecycle=false.
 */
export async function pickNextJourney(
  supabase: any,
  userId: string,
  options: PickNextJourneyOptions = {}
): Promise<string | null> {
  const { preferredJourneyId, allowRecycle = false } = options;

  // Carrega histórico + jornada atual em paralelo
  const [{ data: history }, { data: profile }, { data: activeJourneys }] = await Promise.all([
    supabase.from('user_journey_history').select('journey_id, completed_at').eq('user_id', userId),
    supabase.from('profiles').select('current_journey_id').eq('user_id', userId).maybeSingle(),
    supabase.from('content_journeys').select('id').eq('is_active', true).order('id'),
  ]);

  const completedIds = new Set<string>((history || []).map((h: any) => h.journey_id));
  const currentId = profile?.current_journey_id || null;
  const blocked = new Set<string>([...completedIds, ...(currentId ? [currentId] : [])]);

  const candidates: string[] = (activeJourneys || []).map((j: any) => j.id);

  // 1) Preferência do onboarding, se ainda não foi feita
  if (preferredJourneyId && !blocked.has(preferredJourneyId) && candidates.includes(preferredJourneyId)) {
    return preferredJourneyId;
  }

  // 2) Primeira jornada ativa que não está bloqueada
  for (const id of candidates) {
    if (!blocked.has(id)) return id;
  }

  // 3) Reciclar a concluída há mais tempo (apenas se permitido)
  if (allowRecycle && history && history.length > 0) {
    const sorted = [...history].sort((a: any, b: any) => {
      const ta = new Date(a.completed_at || 0).getTime();
      const tb = new Date(b.completed_at || 0).getTime();
      return ta - tb;
    });
    const oldest = sorted.find((h: any) => h.journey_id !== currentId);
    if (oldest) {
      console.warn(`♻️ [journey-helper] Reciclando jornada antiga ${oldest.journey_id} para user ${userId} — todas já foram feitas.`);
      return oldest.journey_id;
    }
  }

  console.warn(`⚠️ [journey-helper] Nenhuma jornada disponível para user ${userId} (allowRecycle=${allowRecycle}).`);
  return null;
}

/**
 * Detecta se a mensagem do usuário contém pedido EXPLÍCITO de trocar/pausar jornada.
 * Usado para bloquear ações `switch`/`pause` inferidas erroneamente pelo extractor.
 */
export function hasExplicitJourneyIntent(userMessage: string): { switch: boolean; pause: boolean } {
  const msg = (userMessage || '').toLowerCase();
  const switchPatterns = [
    /\btroca(r)?\s+(a\s+|de\s+|essa\s+|minha\s+)?jornada/,
    /\bmudar?\s+(de\s+|a\s+|essa\s+|minha\s+)?jornada/,
    /\bquero\s+(uma\s+)?(outra|nova)\s+jornada/,
    /\b(mudar|trocar)\s+pra\s+(a\s+)?jornada/,
    /\bcomeçar\s+(uma\s+)?(outra|nova)\s+jornada/,
    /\bjornada\s+(de|sobre)\s+\w+/, // "jornada de ansiedade", "jornada sobre..."
  ];
  const pausePatterns = [
    /\bpausa(r)?\s+(as\s+|a\s+|minhas?\s+|essa\s+)?jornadas?/,
    /\bparar?\s+(as\s+|a\s+|minhas?\s+|essa\s+|com\s+as\s+)?jornadas?/,
    /\bn[ãa]o\s+quero\s+(mais\s+)?(receber\s+)?(as\s+)?jornadas?/,
    /\bcancela(r)?\s+(as\s+|minhas?\s+)?jornadas?/,
    /\bsuspende(r)?\s+(as\s+|minhas?\s+)?jornadas?/,
  ];
  return {
    switch: switchPatterns.some((re) => re.test(msg)),
    pause: pausePatterns.some((re) => re.test(msg)),
  };
}