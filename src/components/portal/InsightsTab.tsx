import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, BookMarked, Calendar, Check, ChevronDown, ChevronUp, CircleHelp, Mail, MessageCircle, Quote, Sparkles, Trophy } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { EmptyState, PortalLoadingInline } from "./shared";
import { sanitizePortalText } from "./sanitize";

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
type Chapter = { key: string; monthLabel: string; anchorDate: string; headline: string; quote: string | null; themes: string[]; sessions: SessionRow[]; snapshots: Snapshot[]; letter: Letter | null; milestones: Milestone[] };
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
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared / Math.min(aWords.size, bWords.size) >= 0.6;
}

function monthKeyOf(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function truncate(text: string, max: number) {
  const clean = sanitizePortalText(text).trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

export function InsightsTab({ userId, profile, onOpenConversation }: { userId: string; profile: any; onOpenConversation: (prefilledMessage?: string) => void }) {
  const queryClient = useQueryClient();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-live-journey", userId],
    queryFn: async () => {
      const [sessionsRes, snapshotsRes, lettersRes, milestonesRes, themesRes, feedbackRes, weeklyReportsRes, monthlyReportsRes] = await Promise.all([
        supabasePortal.from("sessions").select("id, ended_at, focus_topic, closure_text, session_summary, theme_label").eq("user_id", userId).eq("status", "completed").order("ended_at", { ascending: false }).limit(80),
        supabasePortal.from("thematic_snapshots").select("id, theme, snapshot_before, snapshot_change, evidence_quote, evidence_date, confidence, period_end").eq("user_id", userId).in("confidence", ["high", "low"]).order("period_end", { ascending: false }).limit(60),
        supabasePortal.from("monthly_letters").select("id, letter_month, letter_text, preview_text, created_at").eq("user_id", userId).order("letter_month", { ascending: false }).limit(24),
        supabasePortal.from("user_milestones").select("id, milestone_text, milestone_date, context_excerpt, source").eq("user_id", userId).order("milestone_date", { ascending: false }).limit(60),
        supabasePortal.from("session_themes").select("id, theme_name, status, session_count, last_mentioned_at").eq("user_id", userId).neq("status", "resolved").order("last_mentioned_at", { ascending: false }).limit(20),
        supabasePortal.from("journey_reflection_feedback").select("source_kind, source_id, response").eq("user_id", userId),
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
    mutationFn: async ({ sourceKind, sourceId, response }: { sourceKind: "thematic_snapshot" | "active_theme"; sourceId: string; response: "agrees" | "corrects" }) => {
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
  const recentMovements = useMemo(() => (data?.snapshots ?? []).filter((snapshot) => snapshot.snapshot_change || snapshot.snapshot_before || snapshot.evidence_quote).slice(0, 3), [data?.snapshots]);
  const meaningfulMilestones = useMemo(() => (data?.milestones ?? []).filter((milestone) => milestone.milestone_text && !ACTIVITY_MILESTONE.test(milestone.milestone_text)).slice(0, 4), [data?.milestones]);
  const lastSession = data?.sessions?.[0] ?? null;
  const weeklyReports = data?.weeklyReports ?? [];
  const monthlyReports = data?.monthlyReports ?? [];

  const chapters = useMemo<Chapter[]>(() => {
    if (!data) return [];
    const map = new Map<string, Chapter>();
    const ensure = (iso: string) => {
      const key = monthKeyOf(iso);
      const existing = map.get(key);
      if (existing) return existing;
      const chapter: Chapter = { key, monthLabel: monthLabelOf(iso), anchorDate: iso, headline: "", quote: null, themes: [], sessions: [], snapshots: [], letter: null, milestones: [] };
      map.set(key, chapter);
      return chapter;
    };
    data.letters.forEach((letter) => { const iso = letter.letter_month || letter.created_at; if (iso) ensure(iso).letter = letter; });
    data.snapshots.forEach((snapshot) => { const iso = snapshot.evidence_date || snapshot.period_end; if (iso) ensure(iso).snapshots.push(snapshot); });
    data.sessions.forEach((session) => { if (session.ended_at) ensure(session.ended_at).sessions.push(session); });
    data.milestones.forEach((milestone) => {
      if (milestone.milestone_date && milestone.milestone_text && !ACTIVITY_MILESTONE.test(milestone.milestone_text)) {
        ensure(milestone.milestone_date).milestones.push(milestone);
      }
    });
    return Array.from(map.values()).filter((chapter) => chapter.letter || chapter.snapshots.length || chapter.milestones.length).map((chapter) => {
      const best = [...chapter.snapshots].sort((a, b) => (CONF_ORDER[b.confidence ?? ""] ?? 0) - (CONF_ORDER[a.confidence ?? ""] ?? 0))[0];
      chapter.headline = truncate(chapter.letter?.preview_text || best?.snapshot_change || best?.snapshot_before || chapter.milestones[0]?.milestone_text || "", 180);
      chapter.quote = best?.evidence_quote ? sanitizePortalText(best.evidence_quote) : null;
      chapter.themes = Array.from(new Set(chapter.snapshots.map((snapshot) => snapshot.theme?.trim()).filter(Boolean) as string[])).slice(0, 3);
      return chapter;
    }).sort((a, b) => new Date(b.anchorDate).getTime() - new Date(a.anchorDate).getTime());
  }, [data]);

  if (isLoading) return <PortalLoadingInline />;

  const hasLiveMaterial = activeThemes.length > 0 || recentMovements.length > 0 || !!lastSession || meaningfulMilestones.length > 0;
  const visibleChapters = showOlder ? chapters : chapters.slice(0, 12);
  const firstName = typeof profile?.name === "string" ? profile.name.trim().split(/\s+/)[0] : "";
  const journeySignals = activeThemes.length + recentMovements.length + meaningfulMilestones.length;

  const registerFeedback = (sourceKind: "thematic_snapshot" | "active_theme", sourceId: string, response: "agrees" | "corrects", context: string) => {
    feedbackMutation.mutate({ sourceKind, sourceId, response }, {
      onSuccess: () => {
        if (response === "corrects") onOpenConversation(`Aura, não foi bem assim: ${context}. Quero te explicar melhor.`);
      },
    });
  };

  return (
    <div className="portal-area-page portal-progress-page space-y-8">
      <section className="portal-progress-intro" aria-labelledby="percurso-vivo">
        <div className="portal-progress-intro-mark"><Sparkles className="h-5 w-5" /></div>
        <p className="portal-progress-kicker">Sua história em movimento</p>
        <h2 id="percurso-vivo" className="portal-progress-headline">
          {hasLiveMaterial ? `${firstName ? `${firstName}, sua` : "Sua"} história já está ganhando forma.` : `${firstName ? `${firstName}, este` : "Este"} é o começo do seu percurso.`}
        </h2>
        <p className="portal-progress-lead">O que antes eram conversas soltas começa a revelar continuidade — sem conclusões prontas e sempre com a sua confirmação.</p>
        {hasLiveMaterial && (
          <div className="portal-progress-summary" aria-label="Resumo do seu percurso">
            <div><strong>{activeThemes.length}</strong><span>{activeThemes.length === 1 ? "tema presente" : "temas presentes"}</span></div>
            <div><strong>{journeySignals}</strong><span>{journeySignals === 1 ? "ponto do percurso" : "pontos do percurso"}</span></div>
            <div><strong>{chapters.length}</strong><span>{chapters.length === 1 ? "capítulo" : "capítulos"}</span></div>
          </div>
        )}
      </section>

      <div className="portal-progress-flow">

      {activeThemes.length > 0 ? (
        <section className="portal-progress-step portal-progress-step-current space-y-3" aria-labelledby="momento-atual">
          <SectionTitle icon={Sparkles} eyebrow="Agora" title="Seu momento agora" />
          <div className="portal-progress-feature rounded-2xl border bg-card p-5 space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">Pelo que você vem trazendo, estes parecem ser os temas mais presentes. Você pode confirmar ou corrigir a leitura.</p>
            <div className="space-y-3">
              {activeThemes.map((theme) => (
                <ReflectionRow key={theme.id} title={sanitizePortalText(theme.theme_name)} feedback={feedbackMap.get(`active_theme:${theme.id}`)} busy={feedbackMutation.isPending}
                  onAgree={() => registerFeedback("active_theme", theme.id, "agrees", theme.theme_name || "essa leitura")}
                  onCorrect={() => registerFeedback("active_theme", theme.id, "corrects", theme.theme_name || "essa leitura")} />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="portal-progress-step rounded-2xl border bg-card p-5 space-y-3">
          <p className="font-display text-lg font-semibold text-foreground">Seu momento vai tomar forma aqui</p>
          <p className="text-sm leading-relaxed text-muted-foreground">Ainda não há material suficiente para uma leitura honesta. Conforme vocês conversarem, a AURA organiza os temas sem presumir o que você sente.</p>
          <Button variant="outline" onClick={() => onOpenConversation("Aura, quero te contar como estou agora.")}><MessageCircle /> Contar como estou</Button>
        </div>
      )}

      {recentMovements.length > 0 && (
        <section className="portal-progress-step space-y-3" aria-labelledby="movimentos-recentes">
          <SectionTitle icon={Quote} eyebrow="Nas suas palavras" title="Movimentos recentes" />
          <div className="space-y-3">
            {recentMovements.map((snapshot) => (
              <article key={snapshot.id} className="rounded-2xl border bg-card p-5 space-y-3">
                <div>
                  {snapshot.theme && <p className="text-xs font-bold uppercase text-primary">{sanitizePortalText(snapshot.theme)}</p>}
                  <p className="mt-1 text-[15px] leading-relaxed text-foreground">Talvez exista um movimento aqui: {sanitizePortalText(snapshot.snapshot_change || snapshot.snapshot_before || "")}</p>
                </div>
                {snapshot.evidence_quote && <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">“{sanitizePortalText(snapshot.evidence_quote)}”</blockquote>}
                <FeedbackActions value={feedbackMap.get(`thematic_snapshot:${snapshot.id}`)} busy={feedbackMutation.isPending}
                  onAgree={() => registerFeedback("thematic_snapshot", snapshot.id, "agrees", snapshot.theme || snapshot.snapshot_change || "essa leitura")}
                  onCorrect={() => registerFeedback("thematic_snapshot", snapshot.id, "corrects", snapshot.theme || snapshot.snapshot_change || "essa leitura")} />
              </article>
            ))}
          </div>
        </section>
      )}

      {lastSession && (lastSession.closure_text || lastSession.session_summary || lastSession.focus_topic) && (
        <section className="portal-progress-step space-y-3">
          <SectionTitle icon={MessageCircle} eyebrow="Fio aberto" title="Para continuar" />
          <div className="portal-progress-resume rounded-2xl border bg-secondary/70 p-5 space-y-3">
            <p className="text-sm leading-relaxed text-foreground">{sanitizePortalText(lastSession.closure_text || lastSession.session_summary || lastSession.focus_topic || "")}</p>
            <Button onClick={() => onOpenConversation(`Aura, quero retomar o assunto da minha última sessão: ${lastSession.focus_topic || lastSession.theme_label || "o que ficou em aberto"}.`)}>Retomar com a AURA <ArrowRight /></Button>
          </div>
        </section>
      )}

      {meaningfulMilestones.length > 0 && (
        <section className="portal-progress-step space-y-3">
          <SectionTitle icon={Trophy} eyebrow="Reconhecer" title="Marcos que importam" />
          <div className="rounded-2xl border bg-card divide-y divide-border">
            {meaningfulMilestones.map((milestone) => (
              <div key={milestone.id} className="p-4">
                <p className="text-sm leading-relaxed text-foreground">{sanitizePortalText(milestone.milestone_text)}</p>
                {milestone.context_excerpt && <p className="mt-1 text-xs text-muted-foreground">{truncate(milestone.context_excerpt, 150)}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(weeklyReports.length > 0 || monthlyReports.length > 0) && (
        <section className="portal-progress-step space-y-3" aria-labelledby="relatorios-percurso">
          <SectionTitle icon={BarChart3} eyebrow="Rever" title="Seus relatórios" />
          <div id="relatorios-percurso" className="space-y-3">
            {weeklyReports.map((report, index) => <ReportCard key={report.id} kind="weekly" report={report} featured={index === 0} onContinue={onOpenConversation} />)}
            {monthlyReports.map((report) => <ReportCard key={report.id} kind="monthly" report={report} onContinue={onOpenConversation} />)}
          </div>
        </section>
      )}

      {!hasLiveMaterial && chapters.length === 0 && <EmptyState icon={BookMarked} title="Seu percurso está começando" description="Não vamos inventar uma história antes da hora. A primeira leitura aparece quando houver algo real para reconhecer." />}

      {chapters.length > 0 && (
        <section className="portal-progress-step portal-progress-archive space-y-3">
          <SectionTitle icon={BookMarked} eyebrow="Arquivo" title="Sua história por mês" />
          <div className="space-y-3">
            {visibleChapters.map((chapter) => <ChapterCard key={chapter.key} chapter={chapter} expanded={expandedKey === chapter.key} onToggle={() => setExpandedKey((current) => current === chapter.key ? null : chapter.key)} />)}
          </div>
          {chapters.length > 12 && !showOlder && <Button variant="outline" className="w-full" onClick={() => setShowOlder(true)}>Ver capítulos anteriores ({chapters.length - 12})</Button>}
        </section>
      )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: typeof Sparkles; eyebrow: string; title: string }) {
  return <div className="portal-progress-section-title flex items-center gap-3"><span className="portal-progress-node flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase text-muted-foreground">{eyebrow}</p><h2 className="font-display text-lg font-semibold text-foreground">{title}</h2></div></div>;
}

function ReflectionRow({ title, feedback, busy, onAgree, onCorrect }: { title: string; feedback?: Feedback["response"]; busy: boolean; onAgree: () => void; onCorrect: () => void }) {
  return <div className="border-t border-border pt-3 first:border-0 first:pt-0"><p className="font-display text-base font-semibold text-foreground">{title}</p><FeedbackActions value={feedback} busy={busy} onAgree={onAgree} onCorrect={onCorrect} /></div>;
}

function FeedbackActions({ value, busy, onAgree, onCorrect }: { value?: Feedback["response"]; busy: boolean; onAgree: () => void; onCorrect: () => void }) {
  if (value) return <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" />{value === "agrees" ? "Confirmado por você" : "Correção enviada à conversa"}</p>;
  return <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={onAgree}><Check /> Faz sentido</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onCorrect}><CircleHelp /> Não foi bem assim</Button></div>;
}

function ChapterCard({ chapter, expanded, onToggle }: { chapter: Chapter; expanded: boolean; onToggle: () => void }) {
  const canExpand = !!chapter.letter?.letter_text || chapter.snapshots.length > 0 || chapter.milestones.length > 0 || chapter.sessions.length > 0;
  return <article className="overflow-hidden rounded-2xl border bg-card">
    <Button variant="ghost" className="h-auto w-full justify-between whitespace-normal rounded-none p-5 text-left" onClick={canExpand ? onToggle : undefined}>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-primary">Capítulo</p><h3 className="mt-0.5 font-display text-xl font-semibold capitalize text-foreground">{chapter.monthLabel}</h3>{chapter.headline && <p className="mt-2 text-sm font-normal leading-relaxed text-muted-foreground">{chapter.headline}</p>}</div>
      {canExpand && (expanded ? <ChevronUp /> : <ChevronDown />)}
    </Button>
    {expanded && <div className="space-y-5 border-t bg-secondary/40 p-5">
      {chapter.quote && <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">“{chapter.quote}”</blockquote>}
      {chapter.letter?.letter_text && <ChapterSection icon={Mail} title="Carta do mês"><p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{sanitizePortalText(chapter.letter.letter_text)}</p></ChapterSection>}
      {chapter.snapshots.length > 0 && <ChapterSection icon={Sparkles} title="O que mudou">{chapter.snapshots.map((snapshot) => <div key={snapshot.id} className="rounded-lg border bg-card p-3 text-sm leading-relaxed text-foreground">{sanitizePortalText(snapshot.snapshot_change || snapshot.snapshot_before || "")}</div>)}</ChapterSection>}
      {chapter.milestones.length > 0 && <ChapterSection icon={Trophy} title="Marcos"><ul className="space-y-2">{chapter.milestones.map((milestone) => <li key={milestone.id} className="text-sm text-foreground">• {sanitizePortalText(milestone.milestone_text)}</li>)}</ul></ChapterSection>}
      {chapter.sessions.length > 0 && <ChapterSection icon={Calendar} title="Sessões do mês"><ul className="space-y-1">{chapter.sessions.map((session) => <li key={session.id} className="text-sm text-muted-foreground">{session.theme_label || session.focus_topic || "Sessão"}</li>)}</ul></ChapterSection>}
    </div>}
  </article>;
}

function ChapterSection({ icon: Icon, title, children }: { icon: typeof Sparkles; title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><div className="flex items-center gap-2 text-primary"><Icon className="h-4 w-4" /><h4 className="text-xs font-bold uppercase">{title}</h4></div>{children}</section>;
}

function ReportCard({ kind, report, featured = false, onContinue }: { kind: "weekly" | "monthly"; report: WeeklyReport | MonthlyReport; featured?: boolean; onContinue: (message?: string) => void }) {
  const [expanded, setExpanded] = useState(() => new URLSearchParams(window.location.search).get("id") === report.id || (new URLSearchParams(window.location.search).get("report") === kind && featured));
  const weekly = kind === "weekly" ? report as WeeklyReport : null;
  const monthly = kind === "monthly" ? report as MonthlyReport : null;
  const start = weekly?.period_start || monthly?.report_month || "";
  const label = kind === "weekly"
    ? `${new Date(`${start}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} a ${new Date(`${weekly?.period_end}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
    : new Date(`${start}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const content = sanitizePortalText(weekly?.report_content || monthly?.analysis_text || monthly?.report_html || "Seu relatório está guardado aqui.");
  return <article className={cn("overflow-hidden rounded-2xl border bg-card", featured && "portal-progress-feature")}>
    <Button variant="ghost" className="h-auto w-full justify-between whitespace-normal rounded-none p-5 text-left" onClick={() => setExpanded((value) => !value)}>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-primary">{kind === "weekly" ? "Sua semana" : "Seu mês em perspectiva"}</p><h3 className="mt-1 font-display text-lg font-semibold capitalize text-foreground">{label}</h3></div>
      {expanded ? <ChevronUp /> : <ChevronDown />}
    </Button>
    {expanded && <div className="space-y-4 border-t bg-secondary/40 p-5"><p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{content}</p><Button variant="outline" className="w-full" onClick={() => onContinue(kind === "weekly" ? "Aura, quero conversar sobre o que apareceu no meu resumo desta semana." : "Aura, quero conversar sobre o que apareceu no meu relatório deste mês.")}>Continuar com a AURA <ArrowRight /></Button></div>}
  </article>;
}
