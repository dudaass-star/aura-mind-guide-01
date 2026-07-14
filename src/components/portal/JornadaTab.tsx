import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Route, Quote } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";

type Snapshot = {
  id: string;
  theme: string;
  period_start: string;
  period_end: string;
  snapshot_before: string | null;
  snapshot_change: string | null;
  evidence_quote: string | null;
  evidence_date: string | null;
  confidence: "high" | "low" | "insufficient_data";
};

function formatMonth(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function JornadaTab({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-thematic-snapshots", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("thematic_snapshots")
        .select("id, theme, period_start, period_end, snapshot_before, snapshot_change, evidence_quote, evidence_date, confidence")
        .eq("user_id", userId)
        .order("period_start", { ascending: false })
        .limit(60);
      if (error) return [];
      return (data || []) as Snapshot[];
    },
    enabled: !!userId,
  });

  if (isLoading) return <PortalLoadingInline />;

  const snapshots = (data || []).filter(s => s.theme !== "__month__");
  const insufficientMonths = (data || []).filter(s => s.theme === "__month__" && s.confidence === "insufficient_data");

  if (snapshots.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader icon={Route} title="Sua jornada" />
        {insufficientMonths.length > 0 ? (
          <div className="rounded-xl border border-border/40 bg-muted/30 p-5 text-sm text-muted-foreground font-['Nunito'] leading-relaxed">
            No último mês vocês conversaram pouco — sem material suficiente pra uma leitura honesta da sua jornada. Quando o volume cresce, os recortes aparecem aqui.
          </div>
        ) : (
          <EmptyState
            icon={Route}
            title="Sua jornada começa a se desenhar"
            description="Depois do primeiro mês ativo, os recortes por tema aparecem aqui, com trechos literais do que você escreveu."
          />
        )}
      </div>
    );
  }

  // Agrupa por tema, mantendo ordem cronológica reversa por período
  const byTheme = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const arr = byTheme.get(s.theme) || [];
    arr.push(s);
    byTheme.set(s.theme, arr);
  }

  // Ordena temas pelo snapshot mais recente
  const themesOrdered = Array.from(byTheme.entries()).sort((a, b) => {
    return b[1][0].period_start.localeCompare(a[1][0].period_start);
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <SectionHeader icon={Route} title="Sua jornada" />
      <p className="text-sm text-muted-foreground font-['Nunito'] -mt-4">
        Cada tema mostra onde você estava, o que mudou no mês e um trecho literal do que você escreveu.
      </p>

      {themesOrdered.map(([theme, items]) => (
        <div key={theme} className="space-y-3">
          <h3 className="font-['Fraunces'] text-lg font-semibold text-foreground capitalize">
            {theme}
          </h3>
          <div className="space-y-3 border-l-2 border-accent/30 pl-4">
            {items.map(s => (
              <div key={s.id} className="rounded-lg bg-card border border-border/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-['Nunito']">
                    {capitalize(formatMonth(s.period_start))}
                  </span>
                  {s.confidence === "low" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-['Nunito']">
                      leitura preliminar
                    </span>
                  )}
                </div>
                {s.snapshot_before && (
                  <p className="text-sm text-muted-foreground font-['Nunito']">
                    <span className="font-semibold text-foreground/80">Onde estava: </span>{s.snapshot_before}
                  </p>
                )}
                {s.snapshot_change && (
                  <p className="text-sm text-foreground font-['Nunito']">
                    <span className="font-semibold">O que mudou: </span>{s.snapshot_change}
                  </p>
                )}
                {s.evidence_quote && (
                  <div className="mt-2 flex gap-2 items-start bg-accent/5 rounded-md p-3 border-l-2 border-accent/60">
                    <Quote size={14} className="text-accent shrink-0 mt-0.5" />
                    <div className="text-sm text-foreground font-['Fraunces'] italic leading-relaxed">
                      "{s.evidence_quote}"
                      {s.evidence_date && (
                        <span className="block mt-1 text-[11px] not-italic text-muted-foreground font-['Nunito']">
                          — você, {formatDay(s.evidence_date)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}