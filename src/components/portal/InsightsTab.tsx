import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Sparkles, Trophy, Calendar, Mail, Route, MessageSquare } from "lucide-react";
import { useState } from "react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";

// Timeline unificada ("Percurso"): funde sessões concluídas, snapshots temáticos,
// cartas mensais, marcos e insights em uma linha cronológica única agrupada por mês.

type TimelineKind = "session" | "snapshot" | "letter" | "milestone" | "insight";

type TimelineItem = {
  id: string;
  kind: TimelineKind;
  date: string;
  title: string;
  preview: string;
  full?: string | null;
};

const KIND_META: Record<
  TimelineKind,
  { icon: any; label: string; tint: string }
> = {
  session: { icon: Calendar, label: "Sessão", tint: "text-accent" },
  snapshot: { icon: Route, label: "Snapshot", tint: "text-primary" },
  letter: { icon: Mail, label: "Carta mensal", tint: "text-accent" },
  milestone: { icon: Trophy, label: "Marco", tint: "text-primary" },
  insight: { icon: Sparkles, label: "Insight", tint: "text-accent" },
};

function truncate(txt: string, n: number) {
  const clean = (txt || "").trim();
  return clean.length > n ? clean.slice(0, n).trimEnd() + "…" : clean;
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays < 1) return "hoje";
  if (diffDays < 2) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function InsightsTab({ userId, profile }: { userId: string; profile: any }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: sessions, isLoading: l1 } = useQuery({
    queryKey: ["percurso-sessions", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("sessions")
        .select(
          "id, ended_at, focus_topic, closure_text, closure_type, session_summary, theme_label",
        )
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(30);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: snapshots, isLoading: l2 } = useQuery({
    queryKey: ["percurso-snapshots", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("thematic_snapshots")
        .select(
          "id, theme, snapshot_before, snapshot_change, evidence_quote, evidence_date, confidence, period_end",
        )
        .eq("user_id", userId)
        .neq("confidence", "insufficient_data")
        .order("period_end", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: letters, isLoading: l3 } = useQuery({
    queryKey: ["percurso-letters", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("monthly_letters")
        .select("id, letter_month, letter_text, preview_text, created_at")
        .eq("user_id", userId)
        .order("letter_month", { ascending: false })
        .limit(12);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: milestones, isLoading: l4 } = useQuery({
    queryKey: ["percurso-milestones", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_milestones")
        .select("id, milestone_text, milestone_date, context_excerpt")
        .eq("user_id", userId)
        .order("milestone_date", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  if (l1 || l2 || l3 || l4) return <PortalLoadingInline />;

  const items: TimelineItem[] = [];

  for (const s of sessions || []) {
    if (!s.ended_at) continue;
    const body = s.closure_text || s.session_summary || "";
    items.push({
      id: `s-${s.id}`,
      kind: "session",
      date: s.ended_at,
      title: s.theme_label || s.focus_topic || "Sessão concluída",
      preview: truncate(body, 140),
      full: body,
    });
  }

  for (const sn of snapshots || []) {
    const anchorDate = (sn as any).evidence_date || (sn as any).period_end;
    if (!anchorDate) continue;
    const body = [sn.snapshot_before, sn.snapshot_change]
      .filter(Boolean)
      .join("\n\n");
    items.push({
      id: `sn-${sn.id}`,
      kind: "snapshot",
      date: anchorDate,
      title: sn.theme || "Tema recorrente",
      preview: truncate(sn.snapshot_change || sn.snapshot_before || "", 140),
      full: sn.evidence_quote ? `${body}\n\n"${sn.evidence_quote}"` : body,
    });
  }

  for (const l of letters || []) {
    const anchorDate = l.created_at || l.letter_month;
    if (!anchorDate) continue;
    const monthName = new Date(l.letter_month).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    items.push({
      id: `l-${l.id}`,
      kind: "letter",
      date: anchorDate,
      title: `Carta de ${monthName}`,
      preview: truncate(l.preview_text || l.letter_text || "", 140),
      full: l.letter_text,
    });
  }

  for (const m of milestones || []) {
    if (!m.milestone_date) continue;
    items.push({
      id: `m-${m.id}`,
      kind: "milestone",
      date: m.milestone_date,
      title: "Marco da jornada",
      preview: truncate(m.milestone_text || "", 140),
      full: m.context_excerpt
        ? `${m.milestone_text}\n\n"${m.context_excerpt}"`
        : m.milestone_text,
    });
  }

  if (profile?.pending_insight) {
    items.push({
      id: "pending",
      kind: "insight",
      date: profile?.last_proactive_insight_at || new Date().toISOString(),
      title: "Insight recente",
      preview: truncate(profile.pending_insight, 140),
      full: profile.pending_insight,
    });
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Agrupa por mês preservando ordem cronológica reversa
  const groups: { month: string; items: TimelineItem[] }[] = [];
  for (const it of items) {
    const key = monthKey(it.date);
    const last = groups[groups.length - 1];
    if (last && last.month === key) last.items.push(it);
    else groups.push({ month: key, items: [it] });
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={Sparkles} title="Percurso" />

      {items.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="Seu percurso começa aqui"
          description="Conforme vocês conversam, sessões, marcos e cartas mensais aparecem nessa linha do tempo."
        />
      )}

      {groups.map((group) => (
        <div key={group.month} className="space-y-3">
          <p className="sticky top-14 z-[1] bg-background/85 backdrop-blur-sm py-1 text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito'] capitalize">
            {group.month}
          </p>
          {group.items.map((it, idx) => (
            <TimelineCard
              key={it.id}
              item={it}
              idx={idx}
              expanded={expandedId === it.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === it.id ? null : it.id))
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TimelineCard({
  item,
  idx,
  expanded,
  onToggle,
}: {
  item: TimelineItem;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const canExpand = !!item.full && item.full.length > item.preview.length;

  return (
    <button
      onClick={canExpand ? onToggle : undefined}
      className={`w-full text-left rounded-2xl border border-border bg-card p-4 space-y-2 shadow-sm animate-fade-up transition-colors ${
        canExpand ? "hover:border-accent/40" : "cursor-default"
      }`}
      style={{ animationDelay: `${idx * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] uppercase tracking-wider font-semibold font-['Nunito'] ${meta.tint}`}>
            {meta.label} · {dayLabel(item.date)}
          </p>
          <p className="font-['Fraunces'] font-semibold text-foreground mt-0.5 line-clamp-1">
            {item.title}
          </p>
        </div>
        <div className="bg-accent/10 rounded-full p-1.5 shrink-0">
          <Icon size={14} className={meta.tint} />
        </div>
      </div>
      {!expanded && item.preview && (
        <p className="text-sm text-foreground/80 font-['Nunito'] leading-relaxed line-clamp-2">
          {item.preview}
        </p>
      )}
      {expanded && item.full && (
        <p className="text-sm text-foreground font-['Nunito'] leading-relaxed whitespace-pre-line">
          {item.full}
        </p>
      )}
      {canExpand && (
        <p className="text-[11px] text-muted-foreground font-['Nunito']">
          {expanded ? "toque pra recolher" : "toque pra ler tudo"}
        </p>
      )}
    </button>
  );
}