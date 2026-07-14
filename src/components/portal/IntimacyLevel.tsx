import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Stage = {
  key: "inicio" | "familiaridade" | "profundidade";
  label: string;
  short: string;
  percent: number;
};

function computeStage(sessions: number, themes: number, corrections: number): Stage {
  if (sessions >= 10 && themes >= 5) {
    return { key: "profundidade", label: "profundamente", short: "Íntimo", percent: 95 };
  }
  if (sessions >= 3 && (themes >= 3 || corrections >= 1)) {
    return { key: "familiaridade", label: "bem", short: "Aprofundando", percent: 65 };
  }
  return { key: "inicio", label: "superficialmente", short: "Superficial", percent: 25 };
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
          <div className="mt-4 rounded-2xl bg-white/60 p-5 cursor-help border border-white/80">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#1B2A4E] font-['Nunito']">
                Nível de Intimidade
              </h3>
              <span className="text-xs font-bold text-[#87A878] font-['Nunito']">
                {stage.short}
              </span>
            </div>
            <div className="h-2 w-full bg-[#1B2A4E]/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#87A878] to-[#B8A5D9] transition-all duration-500"
                style={{ width: `${stage.percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-[#2A2A2A]/40 font-['Nunito']">Superficial</span>
              <span className="text-[10px] text-[#2A2A2A]/40 font-['Nunito']">Íntimo</span>
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