import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Sparkles, Trophy, Calendar, Mail, BookMarked, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";

// "Percurso" como Capítulos mensais: um card por mês, síntese narrativa curta
// no topo (frase-resumo + citação + chips de tema + contadores). O detalhe
// (carta, snapshots, marcos, sessões) só aparece quando o usuário expande.

type Snapshot = {
  id: string;
  theme: string | null;
  snapshot_before: string | null;
  snapshot_change: string | null;
  evidence_quote: string | null;
  evidence_date: string | null;
  confidence: string | null;
  period_end: string | null;
};

type Letter = {
  id: string;
  letter_month: string;
  letter_text: string | null;
  preview_text: string | null;
  created_at: string | null;
};

type Milestone = {
  id: string;
  milestone_text: string | null;
  milestone_date: string | null;
  context_excerpt: string | null;
};

type SessionRow = {
  id: string;
  ended_at: string | null;
  focus_topic: string | null;
  closure_text: string | null;
  session_summary: string | null;
  theme_label: string | null;
};

type Chapter = {
  key: string; // yyyy-mm
  monthLabel: string;
  anchorDate: string;
  headline: string;
  quote: string | null;
  themes: string[];
  sessions: SessionRow[];
  snapshots: Snapshot[];
  letter: Letter | null;
  milestones: Milestone[];
};

const CONF_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

function monthKeyOf(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function truncate(txt: string, n: number) {
  const clean = (txt || "").trim().replace(/\s+/g, " ");
  return clean.length > n ? clean.slice(0, n).trimEnd() + "…" : clean;
}

export function InsightsTab({ userId, profile }: { userId: string; profile: any }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  const { data: sessions, isLoading: l1 } = useQuery({
    queryKey: ["capitulos-sessions", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("sessions")
        .select("id, ended_at, focus_topic, closure_text, session_summary, theme_label")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(80);
      return (data ?? []) as SessionRow[];
    },
    enabled: !!userId,
  });

  const { data: snapshots, isLoading: l2 } = useQuery({
    queryKey: ["capitulos-snapshots", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("thematic_snapshots")
        .select("id, theme, snapshot_before, snapshot_change, evidence_quote, evidence_date, confidence, period_end")
        .eq("user_id", userId)
        .neq("confidence", "insufficient_data")
        .order("period_end", { ascending: false })
        .limit(60);
      return (data ?? []) as Snapshot[];
    },
    enabled: !!userId,
  });

  const { data: letters, isLoading: l3 } = useQuery({
    queryKey: ["capitulos-letters", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("monthly_letters")
        .select("id, letter_month, letter_text, preview_text, created_at")
        .eq("user_id", userId)
        .order("letter_month", { ascending: false })
        .limit(24);
      return (data ?? []) as Letter[];
    },
    enabled: !!userId,
  });

  const { data: milestones, isLoading: l4 } = useQuery({
    queryKey: ["capitulos-milestones", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("user_milestones")
        .select("id, milestone_text, milestone_date, context_excerpt")
        .eq("user_id", userId)
        .order("milestone_date", { ascending: false })
        .limit(60);
      return (data ?? []) as Milestone[];
    },
    enabled: !!userId,
  });

  const { data: profileMeta } = useQuery({
    queryKey: ["capitulos-profile", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("profiles")
        .select("created_at")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const chapters = useMemo<Chapter[]>(() => {
    const map = new Map<string, Chapter>();

    const ensure = (iso: string): Chapter => {
      const key = monthKeyOf(iso);
      let c = map.get(key);
      if (!c) {
        c = {
          key,
          monthLabel: monthLabelOf(iso),
          anchorDate: iso,
          headline: "",
          quote: null,
          themes: [],
          sessions: [],
          snapshots: [],
          letter: null,
          milestones: [],
        };
        map.set(key, c);
      } else if (new Date(iso).getTime() > new Date(c.anchorDate).getTime()) {
        c.anchorDate = iso;
      }
      return c;
    };

    for (const l of letters ?? []) {
      const iso = l.letter_month || l.created_at;
      if (!iso) continue;
      const c = ensure(iso);
      c.letter = l;
    }
    for (const sn of snapshots ?? []) {
      const iso = sn.evidence_date || sn.period_end;
      if (!iso) continue;
      ensure(iso).snapshots.push(sn);
    }
    for (const s of sessions ?? []) {
      if (!s.ended_at) continue;
      ensure(s.ended_at).sessions.push(s);
    }
    for (const m of milestones ?? []) {
      if (!m.milestone_date) continue;
      ensure(m.milestone_date).milestones.push(m);
    }

    // Só cria capítulo se tem material minimamente narrável:
    // pelo menos carta OU (snapshot com confiança) OU marco.
    const list: Chapter[] = [];
    for (const c of map.values()) {
      const hasNarrative = !!c.letter || c.snapshots.length > 0 || c.milestones.length > 0;
      if (!hasNarrative) continue;

      // Headline: carta > melhor snapshot > marco
      if (c.letter?.preview_text) {
        c.headline = truncate(c.letter.preview_text, 180);
      } else if (c.snapshots.length > 0) {
        const best = [...c.snapshots].sort(
          (a, b) => (CONF_ORDER[b.confidence ?? ""] ?? 0) - (CONF_ORDER[a.confidence ?? ""] ?? 0),
        )[0];
        c.headline = truncate(best.snapshot_change || best.snapshot_before || "", 180);
        c.quote = best.evidence_quote?.trim() || null;
      } else if (c.milestones.length > 0) {
        c.headline = truncate(c.milestones[0].milestone_text || "", 180);
      }

      // Citação (se não veio do snapshot acima)
      if (!c.quote) {
        const withQuote = c.snapshots.find((s) => s.evidence_quote?.trim());
        if (withQuote) c.quote = withQuote.evidence_quote!.trim();
      }

      // Temas (até 3, dedup)
      const seen = new Set<string>();
      for (const s of c.snapshots) {
        const t = (s.theme || "").trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        c.themes.push(t);
        if (c.themes.length >= 3) break;
      }

      list.push(c);
    }

    list.sort((a, b) => new Date(b.anchorDate).getTime() - new Date(a.anchorDate).getTime());
    return list;
  }, [sessions, snapshots, letters, milestones]);

  if (l1 || l2 || l3 || l4) return <PortalLoadingInline />;

  const visible = showOlder ? chapters : chapters.slice(0, 12);
  const hasMore = chapters.length > 12;

  const daysSinceSignup = profileMeta?.created_at
    ? Math.floor((Date.now() - new Date(profileMeta.created_at).getTime()) / 86_400_000)
    : null;
  const isBrandNew = daysSinceSignup !== null && daysSinceSignup < 30;

  return (
    <div className="space-y-5">
      <SectionHeader icon={BookMarked} title="Percurso" />
      <p className="text-sm text-muted-foreground font-['Nunito'] -mt-2">
        Um capítulo por mês. Como as coisas foram mudando dentro de você.
      </p>

      {chapters.length === 0 && (
        <EmptyState
          icon={BookMarked}
          title={isBrandNew ? "Seu primeiro capítulo vem no fim do mês" : "Ainda sem capítulo por aqui"}
          description={
            isBrandNew
              ? "A cada mês a Aura escreve um capítulo sobre o que mudou em você — com trechos das suas próprias palavras."
              : "Quando houver material suficiente, um capítulo aparece automaticamente aqui."
          }
        />
      )}

      <div className="space-y-4">
        {visible.map((c, i) => (
          <ChapterCard
            key={c.key}
            chapter={c}
            idx={i}
            expanded={expandedKey === c.key}
            onToggle={() => setExpandedKey((cur) => (cur === c.key ? null : c.key))}
          />
        ))}
      </div>

      {hasMore && !showOlder && (
        <button
          onClick={() => setShowOlder(true)}
          className="w-full py-3 text-sm text-muted-foreground hover:text-accent font-['Nunito'] border border-border rounded-xl transition-colors"
        >
          Ver capítulos anteriores ({chapters.length - 12})
        </button>
      )}
    </div>
  );
}

function ChapterCard({
  chapter,
  idx,
  expanded,
  onToggle,
}: {
  chapter: Chapter;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { monthLabel, headline, quote, themes, sessions, snapshots, letter, milestones } = chapter;
  const sessionsCount = sessions.length;
  const milestonesCount = milestones.length;
  const canExpand = !!letter?.letter_text || snapshots.length > 0 || milestones.length > 0 || sessionsCount > 0;

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden animate-fade-up"
      style={{ animationDelay: `${idx * 60}ms` }}
    >
      <button
        onClick={canExpand ? onToggle : undefined}
        className={`w-full text-left p-5 space-y-3 transition-colors ${
          canExpand ? "hover:bg-muted/20" : "cursor-default"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest font-semibold text-accent font-['Nunito']">
              Capítulo
            </p>
            <p className="font-['Fraunces'] text-lg font-semibold text-foreground mt-0.5 capitalize">
              {monthLabel}
            </p>
          </div>
          {canExpand && (
            <span className="text-muted-foreground shrink-0 mt-1">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          )}
        </div>

        {headline && (
          <p className="text-[15px] text-foreground/90 font-['Nunito'] leading-relaxed">
            {headline}
          </p>
        )}

        {quote && (
          <blockquote className="border-l-2 border-accent/40 pl-3 text-sm text-foreground/80 italic font-['Nunito'] leading-relaxed">
            "{quote}"
          </blockquote>
        )}

        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-accent/10 text-accent text-[11px] font-medium font-['Nunito']"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {(sessionsCount > 0 || milestonesCount > 0) && (
          <div className="flex gap-4 text-[11px] text-muted-foreground font-['Nunito'] pt-1">
            {sessionsCount > 0 && (
              <span className="flex items-center gap-1">
                <Calendar size={11} /> {sessionsCount} {sessionsCount === 1 ? "sessão" : "sessões"}
              </span>
            )}
            {milestonesCount > 0 && (
              <span className="flex items-center gap-1">
                <Trophy size={11} /> {milestonesCount} {milestonesCount === 1 ? "marco" : "marcos"}
              </span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 p-5 space-y-5 bg-muted/10 animate-fade-in">
          {letter?.letter_text && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail size={13} className="text-accent" />
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-['Nunito']">
                  Carta do mês
                </p>
              </div>
              <p className="text-sm text-foreground font-['Nunito'] leading-relaxed whitespace-pre-line">
                {letter.letter_text}
              </p>
            </section>
          )}

          {snapshots.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-accent" />
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-['Nunito']">
                  O que mudou
                </p>
              </div>
              <div className="space-y-3">
                {snapshots.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border/60 bg-card p-3 space-y-1.5">
                    {s.theme && (
                      <p className="text-xs font-semibold text-accent font-['Nunito']">{s.theme}</p>
                    )}
                    {s.snapshot_before && (
                      <p className="text-sm text-foreground/70 font-['Nunito'] leading-relaxed">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Antes:</span>
                        {s.snapshot_before}
                      </p>
                    )}
                    {s.snapshot_change && (
                      <p className="text-sm text-foreground font-['Nunito'] leading-relaxed">
                        <span className="text-[10px] uppercase tracking-wider text-accent mr-1">Mudou:</span>
                        {s.snapshot_change}
                      </p>
                    )}
                    {s.evidence_quote && (
                      <blockquote className="border-l-2 border-accent/30 pl-2 text-xs text-foreground/75 italic font-['Nunito']">
                        "{s.evidence_quote}"
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {milestones.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Trophy size={13} className="text-accent" />
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-['Nunito']">
                  Marcos
                </p>
              </div>
              <ul className="space-y-2">
                {milestones.map((m) => (
                  <li key={m.id} className="text-sm text-foreground font-['Nunito'] leading-relaxed flex gap-2">
                    <span className="text-accent mt-1.5 select-none leading-none">•</span>
                    <span>{m.milestone_text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sessions.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-accent" />
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-['Nunito']">
                  Sessões do mês
                </p>
              </div>
              <ul className="space-y-1.5">
                {sessions.map((s) => (
                  <li key={s.id} className="text-xs text-muted-foreground font-['Nunito']">
                    <span className="text-foreground/80">
                      {s.theme_label || s.focus_topic || "Sessão"}
                    </span>
                    {s.ended_at && (
                      <span className="ml-2">
                        · {new Date(s.ended_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}