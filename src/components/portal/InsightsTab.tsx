import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Sparkles, Heart, Trophy, Calendar } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";

type TimelineItem = {
  id: string;
  kind: "milestone" | "capsule" | "insight" | "monthly";
  date: string;
  text: string;
  extra?: string | null;
};

export function InsightsTab({ userId, profile }: { userId: string; profile: any }) {
  // Marcos da jornada (user_milestones)
  const { data: milestones, isLoading: l1 } = useQuery({
    queryKey: ["portal-milestones", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_milestones")
        .select("id, milestone_text, milestone_date, source, context_excerpt")
        .eq("user_id", userId)
        .order("milestone_date", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  // Cápsulas do tempo entregues
  const { data: capsules, isLoading: l2 } = useQuery({
    queryKey: ["portal-insights-capsules", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("time_capsules")
        .select("id, delivered_at, context_message, transcription")
        .eq("user_id", userId)
        .eq("delivered", true)
        .order("delivered_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  // Relatórios mensais (para "padrões do mês")
  const { data: monthlyReports, isLoading: l3 } = useQuery({
    queryKey: ["portal-insights-monthly", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("monthly_reports")
        .select("id, report_month, analysis_text")
        .eq("user_id", userId)
        .order("report_month", { ascending: false })
        .limit(6);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  if (l1 || l2 || l3) return <PortalLoadingInline />;

  const items: TimelineItem[] = [];
  for (const m of milestones || []) {
    items.push({
      id: `m-${m.id}`,
      kind: "milestone",
      date: m.milestone_date,
      text: m.milestone_text,
      extra: m.context_excerpt,
    });
  }
  for (const c of capsules || []) {
    items.push({
      id: `c-${c.id}`,
      kind: "capsule",
      date: c.delivered_at,
      text: c.context_message || "Cápsula do tempo entregue",
      extra: c.transcription,
    });
  }
  if (profile?.pending_insight) {
    items.push({
      id: "pending",
      kind: "insight",
      date: profile?.last_proactive_insight_at || new Date().toISOString(),
      text: profile.pending_insight,
    });
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const hasAny = items.length > 0 || (monthlyReports && monthlyReports.length > 0);

  return (
    <div className="space-y-5">
      <SectionHeader icon={Sparkles} title="Insights" />

      {!hasAny && (
        <EmptyState
          icon={Sparkles}
          title="A Aura ainda está te conhecendo"
          description="Conforme vocês conversam, os insights e marcos da sua jornada aparecem aqui."
        />
      )}

      {/* Padrões do último mês */}
      {monthlyReports && monthlyReports.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-2 shadow-sm animate-fade-up">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-accent" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
              Padrões do último mês
            </p>
          </div>
          <p className="text-sm text-foreground font-['Nunito'] leading-relaxed whitespace-pre-line">
            {(monthlyReports[0].analysis_text || "").slice(0, 480)}
            {(monthlyReports[0].analysis_text || "").length > 480 ? "…" : ""}
          </p>
        </div>
      )}

      {/* Timeline */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((it, idx) => (
            <TimelineCard key={it.id} item={it} idx={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineCard({ item, idx }: { item: TimelineItem; idx: number }) {
  const Icon =
    item.kind === "milestone" ? Trophy : item.kind === "capsule" ? Heart : Sparkles;
  const dateLabel = item.date
    ? new Date(item.date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";
  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 space-y-2 shadow-sm animate-fade-up"
      style={{ animationDelay: `${idx * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground font-['Nunito']">{dateLabel}</p>
        <div className="bg-accent/10 rounded-full p-1.5 shrink-0">
          <Icon size={14} className="text-accent" />
        </div>
      </div>
      <p className="text-foreground font-['Fraunces'] leading-relaxed">{item.text}</p>
      {item.extra && (
        <p className="text-xs text-muted-foreground font-['Nunito'] italic border-l-2 border-accent/30 pl-3 line-clamp-3">
          {item.extra}
        </p>
      )}
    </div>
  );
}