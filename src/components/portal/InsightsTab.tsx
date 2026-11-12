import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, BookMarked, Calendar, Check, ChevronDown, ChevronUp, CircleHelp, Mail, MessageCircle, Quote, Sparkles, Trophy } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, PortalLoadingInline } from "./shared";
import { sanitizePortalText } from "./sanitize";
import { reportPushConversion } from "@/lib/push-notifications";
import { reportTodayDirectionProgress } from "@/lib/today-direction";
import { takePercursoFocus } from "@/lib/percurso-focus";

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

type Letter = { id: string; letter_month: string; letter_text: string | null; preview_text: string | null; created_at: string | null };
type Milestone = { id: string; milestone_text: string | null; milestone_date: string | null; context_excerpt: string | null; source?: string | null };
type SessionRow = { id: string; ended_at: string | null; focus_topic: string | null; closure_text: string | null; session_summary: string | null; theme_label: string | null };
type ActiveTheme = { id: string; theme_name: string | null; status: string | null; session_count: number | null; last_mentioned_at: string | null };
type Feedback = { source_kind: string; source_id: string; response: "agrees" | "corrects" };
type FeedbackSource = "thematic_snapshot" | "active_theme" | "weekly_report" | "monthly_report";
type Chapter = { key: string; monthLabel: string; anchorDate: string; headline: string; quote: string | null; themes: string[]; sessions: SessionRow[]; snapshots: Snapshot[]; letter: Letter | null; milestones: Milestone[]; report: MonthlyReport | null };
type WeeklyReport = { id: string; period_start: string; period_end: string; metrics_json: unknown; highlights_json: unknown; analysis_text: string | null; continuation_text: string | null; report_content: string | null };
type MonthlyReport = { id: string; report_month: string; metrics_json: unknown; analysis_text: string | null; report_html: string | null; created_at: string };

const CONF_ORDER: Record<string, number> = { high: 2, low: 1 };
const OPERATIONAL_THEME = /(agendar|reagendar|cancelar|organizar sess|setup mensal|preferência por áudio|mudança de assunto|recusa de)/i;
const ACTIVITY_MILESTONE = /(sessão|jornada com a aura|mês de jornada|meses de jornada|ano de jornada|virou ritual|áudio|audio|organizar sess|agendar|reagendar|cancelar)/i;

function normalizeWords(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2);
}

function themesOverlap(a: string, b: string) {
  const aWords = new Set(normalizeWords(a));
  const bWords = new Set(normalizeWords(b));
  if (aWords.size === 0 || bWords.size === 0) return false;
  const stem = (w: string) => w.slice(0, 5);
  const bStems = new Set([...bWords].map(stem));
  const shared = [...aWords].filter((word) => bWords.has(word) || bStems.has(stem(word))).length;
  return shared / Math.min(aWords.size, bWords.size) >= 0.6;
}

function monthKeyOf(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// Converte resumo em 3ª pessoa para a voz da AURA falando com a cliente.
function toAuraVoice(text: string, firstName: string) {
  let out = sanitizePortalText(text).trim();
  if (firstName) out = out.replace(new RegExp(`\\b${firstName}\\b`, "gi"), "você");
  out = out.replace(/\b(o|a) (cliente|usuári[oa]|paciente)\b/gi, "você").replace(/\bvocê demonstrou\b/gi, "você mostrou");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Remove o rótulo técnico do extrator ("Um tema seu deu sinal de virada:").
function milestoneText(text: string | null) {
  const clean = sanitizePortalText(text || "").trim().replace(/^um tema seu deu sinal de virada:\s*/i, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function truncate(text: string, max: number) {
  const clean = sanitizePortalText(text).trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

export function InsightsTab({ userId, profile, onOpenConversation }: { userId: string; profile: any; onOpenConversation: (prefilledMessage?: string) => void }) {
  const queryClient = useQueryClient();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  useEffect(() => {
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "progress", event_type: "opened", source: "app" });
    void reportPushConversion("/meu-espaco?tab=insights", "first14_progress");
    reportTodayDirectionProgress(userId, "completed", "progress");
  }, [userId]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-live-journey", userId],
    queryFn: async () => {
      const [sessionsRes, snapshotsRes, lettersRes, milestonesRes, themesRes, feedbackRes, weeklyReportsRes, monthlyReportsRes] = await Promise.all([
        supabasePortal.from("sessions").select("id, ended_at, focus_topic, closure_text, session_summary, theme_label").eq("user_id", userId).eq("status", "completed").order("ended_at", { ascending: false }).limit(80),
        supabasePortal.from("thematic_snapshots").select("id, theme, snapshot_before, snapshot_change, evidence_quote, evidence_date, confidence, period_end").eq("user_id", userId).in("confidence", ["high", "low"]).order("period_end", { ascending: false }).limit(60),
        supabasePortal.from("monthly_letters").select("id, letter_month, letter_text, preview_text, created_at").eq("user_id", userId).order("letter_month", { ascending: false }).limit(24),
        supabasePortal.from("user_milestones").select("id, milestone_text, milestone_date, context_excerpt, source").eq("user_id", userId).order("milestone_date", { ascending: false }).limit(60),
        supabasePortal.from("session_themes").select("id, theme_name, status, session_count, last_mentioned_at").eq("user_id", userId).neq("status", "resolved").order("last_mentioned_at", { ascending: false }).limit(20),
        supabasePortal.from("journey_reflection_feedback").select("source_kind, source_id, response").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
        supabasePortal.from("weekly_reports").select("id, period_start, period_end, metrics_json, highlights_json, analysis_text, continuation_text, report_content").eq("user_id", userId).order("period_start", { ascending: false }).limit(12),
        supabasePortal.from("monthly_reports").select("id, report_month, metrics_json, analysis_text, report_html, created_at").eq("user_id", userId).order("report_month", { ascending: false }).limit(12),
      ]);
      return {
        sessions: (sessionsRes.data ?? []) as SessionRow[], snapshots: (snapshotsRes.data ?? []) as Snapshot[], letters: (lettersRes.data ?? []) as Letter[],
        milestones: (milestonesRes.data ?? []) as Milestone[], themes: (themesRes.data ?? []) as ActiveTheme[], feedback: (feedbackRes.data ?? []) as Feedback[],
        weeklyReports: (weeklyReportsRes.data ?? []) as WeeklyReport[], monthlyReports: (monthlyReportsRes.data ?? []) as MonthlyReport[],
      };
    },
    enabled: !!userId,
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ sourceKind, sourceId, response }: { sourceKind: FeedbackSource; sourceId: string; response: "agrees" | "corrects" }) => {
      const { error } = await supabasePortal.from("journey_reflection_feedback").upsert({ user_id: userId, source_kind: sourceKind, source_id: sourceId, response }, { onConflict: "user_id,source_kind,source_id" });
      if (error) throw error;
      return { sourceKind, sourceId, response };
    },
    onSuccess: ({ response }) => {
      void queryClient.invalidateQueries({ queryKey: ["portal-live-journey", userId] });
      if (response === "agrees") toast({ title: "Entendido", description: "A AURA vai considerar essa leitura como confirmada por você." });
    },
    onError: () => toast({ title: "Não foi possível registrar", description: "Tente novamente em instantes.", variant: "destructive" }),
  });

  const feedbackMap = useMemo(() => new Map((data?.feedback ?? []).map((item) => [`${item.source_kind}:${item.source_id}`, item.response])), [data?.feedback]);
  const activeThemes = useMemo(() => {
    const result: ActiveTheme[] = [];
    for (const theme of data?.themes ?? []) {
      if (!theme.theme_name?.trim() || OPERATIONAL_THEME.test(theme.theme_name)) continue;
      if (result.some((current) => themesOverlap(current.theme_name || "", theme.theme_name || ""))) continue;
      result.push(theme);
      if (result.length === 3) break;
    }
    return result;
  }, [data?.themes]);
  const recentMovements = useMemo(() => {
    const out: Snapshot[] = [];
    for (const s of data?.snapshots ?? []) {
      if (!(s.snapshot_change || s.snapshot_before || s.evidence_quote)) continue;
      if (out.some((o) => themesOverlap(o.theme || o.snapshot_change || "", s.theme || s.snapshot_change || ""))) continue;
      out.push(s);
      if (out.length === 3) break;
    }
    return out;
  }, [data?.snapshots]);
  const savedItems = useMemo(() => (data?.milestones ?? []).filter((milestone) => milestone.source === "user_saved" && milestone.milestone_text), [data?.milestones]);
  const meaningfulMilestones = useMemo(() => (data?.milestones ?? []).filter((milestone) => milestone.source !== "user_saved" && milestone.milestone_text && !ACTIVITY_MILESTONE.test(milestone.milestone_text)).filter((m, i, all) => all.findIndex((o) => normalizeWords(o.milestone_text || "").slice(0, 6).join(" ") === normalizeWords(m.milestone_text || "").slice(0, 6).join(" ")) === i).slice(0, 4), [data?.milestones]);
  const lastSession = data?.sessions?.[0] ?? null;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [letterOpen, setLetterOpen] = useState(false);
  // "Ver frase": abre direto o item guardado, mesmo com a aba já montada.
  useEffect(() => {
    const check = () => {
      if (!savedItems.length) return;
      const id = takePercursoFocus();
      if (!id) return;
      setFocusedId(id);
      requestAnimationFrame(() => document.getElementById(`guardado-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    check();
    window.addEventListener("aura:percurso-focus", check);
    return () => window.removeEventListener("aura:percurso-focus", check);
  }, [savedItems]);
  const weeklyReports = data?.weeklyReports ?? [];
  const monthlyReports = data?.monthlyReports ?? [];

  const chapters = useMemo<Chapter[]>(() => {
    if (!data) return [];
    const map = new Map<string, Chapter>();
    const ensure = (iso: string) => {
      const key = monthKeyOf(iso);
      const existing = map.get(key);
      if (existing) return existing;
      const chapter: Chapter = { key, monthLabel: monthLabelOf(iso), anchorDate: iso, headline: "", quote: null, themes: [], sessions: [], snapshots: [], letter: null, milestones: [], report: null };
      map.set(key, chapter);
      return chapter;
    };
    data.letters.forEach((letter) => { const iso = letter.letter_month || letter.created_at; if (iso) ensure(iso).letter = letter; });
    data.snapshots.forEach((snapshot) => { const iso = snapshot.evidence_date || snapshot.period_end; if (iso) ensure(iso).snapshots.push(snapshot); });
    data.monthlyReports.forEach((report) => { if (report.report_month) ensure(`${report.report_month.slice(0, 10)}T12:00:00`).report = report; });
    data.sessions.forEach((session) => { if (session.ended_at) ensure(session.ended_at).sessions.push(session); });
    data.milestones.forEach((milestone) => {
      if (milestone.milestone_date && milestone.milestone_text && !ACTIVITY_MILESTONE.test(milestone.milestone_text)) {
        ensure(milestone.milestone_date).milestones.push(milestone);
      }
    });
    return Array.from(map.values()).filter((chapter) => chapter.letter || chapter.report || chapter.snapshots.length || chapter.milestones.length).map((chapter) => {
      const best = [...chapter.snapshots].sort((a, b) => (CONF_ORDER[b.confidence ?? ""] ?? 0) - (CONF_ORDER[a.confidence ?? ""] ?? 0))[0];
      chapter.headline = truncate(chapter.letter?.preview_text || best?.snapshot_change || best?.snapshot_before || milestoneText(chapter.milestones[0]?.milestone_text ?? null) || sanitizePortalText(chapter.report?.analysis_text || ""), 180);
      chapter.quote = best?.evidence_quote ? sanitizePortalText(best.evidence_quote) : null;
      chapter.themes = Array.from(new Set(chapter.snapshots.map((snapshot) => snapshot.theme?.trim()).filter(Boolean) as string[])).slice(0, 3);
      return chapter;
    }).sort((a, b) => new Date(b.anchorDate).getTime() - new Date(a.anchorDate).getTime());
  }, [data]);

  if (isLoading) return <PortalLoadingInline />;

  const hasLiveMaterial = activeThemes.length > 0 || recentMovements.length > 0 || !!lastSession || meaningfulMilestones.length > 0;
  const deepId = new URLSearchParams(window.location.search).get("id");
  const featuredWeek = weeklyReports.find((r) => r.id === deepId) ?? weeklyReports[0] ?? null;
  const deepChapter = chapters.find((c) => c.report?.id === deepId);
  const openChapter = chapters.find((c) => c.key === (expandedKey ?? deepChapter?.key)) ?? chapters[0] ?? null;
  const firstName = typeof profile?.name === "string" ? profile.name.trim().split(/\s+/)[0] : "";
  const sessionCount = data?.sessions?.length ?? 0;
  const latestLetter = data?.letters?.find((letter) => letter.letter_text) ?? null;

  const registerFeedback = (sourceKind: FeedbackSource, sourceId: string, response: "agrees" | "corrects", context: string) => {
    feedbackMutation.mutate({ sourceKind, sourceId, response }, {
      onSuccess: () => {
        if (response === "corrects") onOpenConversation(`Aura, não foi bem assim: ${context}. Quero te explicar melhor.`);
      },
    });
  };

  return (
    <div className="portal-area-page portal-progress-page space-y-8">
      <section className="percurso-hero" aria-labelledby="percurso-vivo">
        <p className="percurso-kicker">Seu Percurso</p>
        <h2 id="percurso-vivo" className="percurso-title">
          {firstName ? `${firstName}, o caminho` : "O caminho"} que você vem construindo.
        </h2>
        <p className="percurso-lead">{hasLiveMaterial || savedItems.length ? "O que você trouxe, o que guardou e o que começou a mudar — reunido com cuidado, nas suas palavras." : "Ainda é o começo. Conforme vocês conversarem, este espaço guarda o que for real para você."}</p>
        {(sessionCount > 0 || savedItems.length > 0 || chapters.length > 0) && (
          <p className="percurso-meta">{[sessionCount > 0 && `${sessionCount} ${sessionCount === 1 ? "encontro" : "encontros"}`, savedItems.length > 0 && `${savedItems.length} ${savedItems.length === 1 ? "frase guardada" : "frases guardadas"}`, chapters.length > 0 && `${chapters.length} ${chapters.length === 1 ? "capítulo" : "capítulos"}`].filter(Boolean).join(" · ")}</p>
        )}
      </section>

      <div className="portal-progress-flow">

      {savedItems.length > 0 && (
        <section className="portal-progress-step space-y-3" aria-labelledby="o-que-voce-guardou">
          <SectionTitle icon={BookMarked} eyebrow="Escolhido por você" title="O que você levou dos encontros" />
          <div id="o-que-voce-guardou" className="space-y-3">
            {savedItems.map((item) => (
              <article key={item.id} id={`guardado-${item.id}`} className={cn("percurso-relic scroll-mt-24", focusedId === item.id && "percurso-relic-focus")}>
                <Quote className="percurso-relic-mark" aria-hidden="true" />
                <p className="percurso-relic-text">{sanitizePortalText(item.milestone_text)}</p>
                {item.milestone_date && <p className="percurso-relic-date">Encontro de {new Date(item.milestone_date).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {savedItems.length === 0 && sessionCount > 0 && (
        <section className="portal-progress-step space-y-3">
          <SectionTitle icon={BookMarked} eyebrow="Seu relicário" title="O que você leva dos encontros" />
          <div className="percurso-invite"><Quote className="percurso-relic-mark" aria-hidden="true" /><p>Ao fim de cada encontro, a AURA te entrega uma frase para levar. As que você guardar ficam reunidas aqui, só suas.</p></div>
        </section>
      )}

      {latestLetter && (
        <section className="portal-progress-step space-y-3" aria-labelledby="carta-aura">
          <SectionTitle icon={Mail} eyebrow={monthLabelOf(latestLetter.letter_month || latestLetter.created_at || new Date().toISOString())} title="Uma carta da AURA para você" />
          <article id="carta-aura" className="percurso-letter">
            <p className={cn("percurso-letter-text", !letterOpen && "percurso-letter-clamp")}>{sanitizePortalText(latestLetter.letter_text)}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="percurso-letter-sign">— AURA</span>
              <Button variant="ghost" size="sm" onClick={() => setLetterOpen((value) => !value)}>{letterOpen ? "Recolher" : "Ler a carta inteira"}</Button>
            </div>
          </article>
        </section>
      )}

      {activeThemes.length > 0 ? (
        <section className="portal-progress-step portal-progress-step-current space-y-3" aria-labelledby="momento-atual">
          <SectionTitle icon={Sparkles} eyebrow="Agora" title="Onde sua atenção tem estado" />
          <div className="percurso-card space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">Pelo que você vem me trazendo, é aqui que sua atenção tem morado.</p>
            <div className="flex flex-wrap gap-2">
              {activeThemes.map((theme) => <span key={theme.id} className="percurso-pill">{sanitizePortalText(theme.theme_name)}</span>)}
            </div>
            <button type="button" className="percurso-soft-link" onClick={() => onOpenConversation("Aura, quero conversar sobre o que tem ocupado minha atenção.")}>Conversar sobre isso <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </section>
      ) : (
        <div className="portal-progress-step percurso-card space-y-3">
          <p className="font-display text-lg font-semibold text-foreground">Seu momento vai tomar forma aqui</p>
          <p className="text-sm leading-relaxed text-muted-foreground">Ainda não há material suficiente para uma leitura honesta. Conforme vocês conversarem, a AURA organiza os temas sem presumir o que você sente.</p>
          <Button variant="outline" onClick={() => onOpenConversation("Aura, quero te contar como estou agora.")}><MessageCircle /> Contar como estou</Button>
        </div>
      )}

      {recentMovements.length > 0 && (
        <section className="portal-progress-step space-y-3" aria-labelledby="movimentos-recentes">
          <SectionTitle icon={Quote} eyebrow="Nas suas palavras" title="O que vem mudando em você" />
          <div className="space-y-3">
            {recentMovements.map((snapshot) => (
              <article key={snapshot.id} className="percurso-card space-y-3">
                {snapshot.theme && !/^(principal|nome)$/i.test(snapshot.theme.trim()) && <p className="text-xs font-bold uppercase text-primary">{sanitizePortalText(snapshot.theme)}</p>}
                {snapshot.snapshot_before && snapshot.snapshot_change ? (
                  <div className="percurso-shift">
                    <div><p className="percurso-shift-label">Antes</p><p className="percurso-shift-before">{truncate(snapshot.snapshot_before, 220)}</p></div>
                    <div><p className="percurso-shift-label percurso-shift-label-now">Agora</p><p className="percurso-shift-now">{truncate(snapshot.snapshot_change, 260)}</p></div>
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed text-foreground">{truncate(snapshot.snapshot_change || snapshot.snapshot_before || "", 260)}</p>
                )}
                {snapshot.evidence_quote && <blockquote className="percurso-quote">“{sanitizePortalText(snapshot.evidence_quote)}”<span>— você, numa conversa</span></blockquote>}
              </article>
            ))}
          </div>
        </section>
      )}

      {lastSession && (lastSession.closure_text || lastSession.session_summary || lastSession.focus_topic) && (
        <section className="portal-progress-step space-y-3">
          <SectionTitle icon={MessageCircle} eyebrow="O fio da nossa conversa" title="Do nosso último encontro" />
          <div className="percurso-thread space-y-4">
            <p className="percurso-thread-text">{lastSession.closure_text ? sanitizePortalText(lastSession.closure_text) : toAuraVoice(lastSession.session_summary || lastSession.focus_topic || "", firstName)}</p>
            {lastSession.ended_at && <p className="percurso-relic-date">{new Date(lastSession.ended_at).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</p>}
            <Button onClick={() => onOpenConversation(`Aura, quero retomar o assunto da minha última sessão: ${lastSession.focus_topic || lastSession.theme_label || "o que ficou em aberto"}.`)}>Retomar com a AURA <ArrowRight /></Button>
          </div>
        </section>
      )}

      {meaningfulMilestones.length > 0 && (
        <section className="portal-progress-step space-y-3">
          <SectionTitle icon={Trophy} eyebrow="Reconhecer" title="Viradas que você já viveu" />
          <ol className="percurso-timeline">
            {meaningfulMilestones.map((milestone) => (
              <li key={milestone.id}>
                {milestone.milestone_date && <p className="percurso-relic-date">{new Date(milestone.milestone_date).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</p>}
                <p className="percurso-timeline-text">{milestoneText(milestone.milestone_text)}</p>
                {milestone.context_excerpt && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{truncate(milestone.context_excerpt, 150)}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {!hasLiveMaterial && chapters.length === 0 && !featuredWeek && <EmptyState icon={BookMarked} title="Seu Percurso está começando" description="Não vamos inventar uma história antes da hora. A primeira leitura aparece quando houver algo real para reconhecer." />}

      {(featuredWeek || chapters.length > 0) && (
        <section className="portal-progress-step portal-progress-archive space-y-4" aria-labelledby="livro-percurso">
          <SectionTitle icon={BookMarked} eyebrow="Seu livro" title="A história que vocês vêm escrevendo" />
          {featuredWeek && <WeekReading report={featuredWeek} onContinue={onOpenConversation} />}
          {chapters.length > 0 && (
            <div className="space-y-3">
              <p className="percurso-shelf-label">Capítulos · toque para abrir</p>
              <div id="livro-percurso" className="percurso-shelf" role="tablist">
                {chapters.map((chapter, index) => (
                  <button key={chapter.key} type="button" role="tab" aria-selected={openChapter?.key === chapter.key}
                    className={cn("percurso-book", openChapter?.key === chapter.key && "percurso-book-open")}
                    onClick={() => setExpandedKey(chapter.key)}>
                    <span className="percurso-book-num">Cap. {chapters.length - index}</span>
                    <span className="percurso-book-title">{chapter.monthLabel.split(" ")[0]}</span>
                    <span className="percurso-book-year">{chapter.monthLabel.split(" ").slice(-1)[0]}</span>
                  </button>
                ))}
              </div>
              {openChapter && <ChapterReading chapter={openChapter} onContinue={onOpenConversation} />}
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: typeof Sparkles; eyebrow: string; title: string }) {
  return <div className="portal-progress-section-title flex items-center gap-3"><span className="portal-progress-node flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{eyebrow}</p><h2 className="percurso-section-title">{title}</h2></div></div>;
}

function ChapterReading({ chapter, onContinue }: { chapter: Chapter; onContinue: (message?: string) => void }) {
  const [full, setFull] = useState(false);
  const body = chapter.letter?.letter_text || chapter.report?.analysis_text || chapter.report?.report_html || "";
  return <article className="percurso-chapter percurso-chapter-reading space-y-4 p-5" key={chapter.key}>
    <div><p className="percurso-kicker">Capítulo de</p><h3 className="font-display text-2xl capitalize text-foreground">{chapter.monthLabel}</h3></div>
    {chapter.headline && <p className="percurso-thread-text">{chapter.headline}</p>}
    {chapter.quote && <blockquote className="percurso-quote">“{chapter.quote}”<span>— você, neste mês</span></blockquote>}
    {chapter.themes.length > 0 && <div className="flex flex-wrap gap-2">{chapter.themes.map((t) => <span key={t} className="percurso-pill">{sanitizePortalText(t)}</span>)}</div>}
    {full && <>
      {body && <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{sanitizePortalText(body)}</p>}
      {chapter.milestones.length > 0 && <ChapterSection icon={Trophy} title="Viradas do mês"><ul className="space-y-2">{chapter.milestones.slice(0, 4).map((m) => <li key={m.id} className="text-sm text-foreground">{milestoneText(m.milestone_text)}</li>)}</ul></ChapterSection>}
    </>}
    <div className="flex flex-wrap items-center gap-4">
      {(body || chapter.milestones.length > 0) && <button type="button" className="percurso-soft-link" onClick={() => setFull((v) => !v)}>{full ? "Fechar o capítulo" : "Ler o capítulo inteiro"}</button>}
      <button type="button" className="percurso-soft-link" onClick={() => onContinue(`Aura, quero revisitar o que vivi em ${chapter.monthLabel}.`)}>Revisitar com a AURA <ArrowRight className="h-3.5 w-3.5" /></button>
    </div>
  </article>;
}

function WeekReading({ report, onContinue }: { report: WeeklyReport; onContinue: (message?: string) => void }) {
  const [full, setFull] = useState(() => new URLSearchParams(window.location.search).get("id") === report.id);
  const fmt = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  const content = sanitizePortalText(report.report_content || report.analysis_text || "");
  if (!content) return null;
  return <article className="percurso-thread space-y-3">
    <p className="percurso-kicker">Esta semana · {fmt(report.period_start)} a {fmt(report.period_end)}</p>
    <p className={cn("whitespace-pre-line text-[15px] leading-relaxed text-foreground", !full && "percurso-letter-clamp")}>{content}</p>
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className="percurso-soft-link" onClick={() => setFull((v) => !v)}>{full ? "Recolher" : "Ler a semana inteira"}</button>
      <button type="button" className="percurso-soft-link" onClick={() => onContinue("Aura, quero conversar sobre o que apareceu na minha semana.")}>Continuar com a AURA <ArrowRight className="h-3.5 w-3.5" /></button>
    </div>
  </article>;
}

function ChapterSection({ icon: Icon, title, children }: { icon: typeof Sparkles; title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><div className="flex items-center gap-2 text-primary"><Icon className="h-4 w-4" /><h4 className="text-xs font-bold uppercase">{title}</h4></div>{children}</section>;
}
