import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";

// Guarda local (por device) do último "visto" de cada aba.
// Evita migração em profiles só pra badge visual. Trade-off aceito:
// badge pode reaparecer em novo device, o que é aceitável.
const STORAGE_KEY = (userId: string) => `aura_portal_tab_seen_${userId}`;

export type TabKey = "hoje" | "insights";

export function getSeenAt(userId: string, tab: TabKey): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId));
    if (!raw) return null;
    return JSON.parse(raw)?.[tab] ?? null;
  } catch {
    return null;
  }
}

export function markTabSeen(userId: string, tab: TabKey) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(userId));
    const obj = raw ? JSON.parse(raw) : {};
    obj[tab] = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(obj));
  } catch {
    // silent
  }
}

// Retorna { hoje, insights, jornada } com true onde há conteúdo novo desde last seen.
export function usePortalNovidades(userId: string | undefined) {
  return useQuery({
    queryKey: ["portal-novidades", userId],
    queryFn: async () => {
      if (!userId) return { hoje: false, insights: false };

      // Busca timestamps máximos por aba em paralelo
      const [lastSession, lastInsight, lastLetter, lastSnapshot, lastMilestone] =
        await Promise.all([
          supabasePortal
            .from("sessions")
            .select("ended_at")
            .eq("user_id", userId)
            .eq("status", "completed")
            .order("ended_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabasePortal
            .from("user_insights")
            .select("updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabasePortal
            .from("monthly_letters")
            .select("created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabasePortal
            .from("thematic_snapshots")
            .select("created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabasePortal
            .from("user_milestones")
            .select("milestone_date")
            .eq("user_id", userId)
            .order("milestone_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      const seenHoje = getSeenAt(userId, "hoje");
      const seenTimeline = getSeenAt(userId, "insights");

      const isNewer = (candidate: string | null | undefined, baseline: string | null) => {
        if (!candidate) return false;
        if (!baseline) return true;
        return new Date(candidate).getTime() > new Date(baseline).getTime();
      };

      const sessionTs = (lastSession.data as any)?.ended_at ?? null;
      const insightTs = (lastInsight.data as any)?.updated_at ?? null;
      const letterTs = (lastLetter.data as any)?.created_at ?? null;
      const snapshotTs = (lastSnapshot.data as any)?.created_at ?? null;
      const milestoneTs = (lastMilestone.data as any)?.milestone_date ?? null;

      return {
        // Hoje: nova sessão concluída
        hoje: isNewer(sessionTs, seenHoje),
        // Timeline (Percurso): carta, snapshot, milestone ou insight recente
        insights:
          isNewer(letterTs, seenTimeline) ||
          isNewer(snapshotTs, seenTimeline) ||
          isNewer(milestoneTs, seenTimeline) ||
          isNewer(insightTs, seenTimeline),
      };
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}