import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Stage = { key: "inicio" | "familiaridade" | "profundidade"; label: string; phrase: string; filled: number };

function computeStage(sessions: number, themes: number, corrections: number): Stage {
  if (sessions >= 10 && themes >= 5) {
    return {
      key: "profundidade",
      label: "profundamente",
      phrase: "Aura te conhece: profundamente",
      filled: 3,
    };
  }
  if (sessions >= 3 && (themes >= 3 || corrections >= 1)) {
    return {
      key: "familiaridade",
      label: "bem",
      phrase: "Aura te conhece: bem",
      filled: 2,
    };
  }
  return {
    key: "inicio",
    label: "superficialmente",
    phrase: "Aura te conhece: superficialmente",
    filled: 1,
  };
}

export function IntimacyLevel({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["portal-intimacy", userId],
    queryFn: async () => {
      const [sessionsRes, themesRes, corrRes] = await Promise.all([
        supabasePortal
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "completed"),
        supabasePortal
          .from("session_themes")
          .select("theme_name")
          .eq("user_id", userId),
        supabasePortal
          .from("user_memory_corrections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      const sessions = sessionsRes.count ?? 0;
      const themes = new Set((themesRes.data ?? []).map((t: any) => t.theme_name)).size;
      const corrections = corrRes.count ?? 0;
      return { sessions, themes, corrections };
    },
  });

  if (!data) return null;
  const stage = computeStage(data.sessions, data.themes, data.corrections);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mt-3 rounded-xl border border-border/50 bg-card/50 px-3 py-2.5 cursor-help">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles size={12} className="text-accent" />
              <p className="text-xs text-muted-foreground font-['Nunito']">{stage.phrase}</p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    i <= stage.filled ? "bg-accent" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs font-['Nunito']">
            Baseado em sessões concluídas, diversidade de temas conversados e correções que você fez
            na memória dela.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}