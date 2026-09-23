import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CalendarDays, Headphones, MessageCircle, NotebookPen, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import type { Json } from "@/integrations/supabase/types";
import { IntimacyLevel } from "./IntimacyLevel";
import { PerguntaDoDiaCard } from "./PerguntaDoDiaCard";
import { PortalLoadingInline } from "./shared";
import { sanitizePortalText } from "./sanitize";

interface HojeTabProps {
  userId: string;
  firstName: string;
  profile: any;
  onNavigateTab: (tab: string) => void;
  onOpenConversation: (prefilledMessage?: string) => void;
}

type TodayAction = "conversation" | "session" | "session_preparation" | "journey" | "continuity" | "practice";

function brtHour() {
  return Number(new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(new Date()));
}

function greeting() {
  const hour = brtHour();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function dayKeyBrt() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function relativeTime(iso: string | null | undefined) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora há pouco";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatScheduledBrt(iso: string) {
  const label = new Date(iso).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function recordTodayEvent(userId: string, eventType: string, action: TodayAction, metadata: Record<string, unknown> = {}) {
  void supabasePortal.from("portal_value_events").insert({
    user_id: userId,
    feature: "today",
    event_type: eventType,
    source: "app",
    metadata: { action, ...metadata } as Json,
  });
}

export function HojeTab({ userId, firstName, profile, onNavigateTab, onOpenConversation }: HojeTabProps) {
  const zeroConversation = !profile?.last_user_message_at;

  const { data, isLoading } = useQuery({
    queryKey: ["portal-today-direction", userId, profile?.current_journey_id, profile?.current_episode],
    queryFn: async () => {
      const [lastSessionResult, nextSessionResult, snapshotResult, reportResult, userAddedResult, meditationResult, episodeResult] = await Promise.all([
        supabasePortal.from("sessions")
          .select("id, ended_at, focus_topic, session_summary, closure_text, theme_label")
          .eq("user_id", userId).eq("status", "completed")
          .order("ended_at", { ascending: false }).limit(1).maybeSingle(),
        supabasePortal.from("sessions")
          .select("id, scheduled_at, status, preparation_note")
          .eq("user_id", userId).in("status", ["scheduled", "in_progress"])
          .gte("scheduled_at", new Date(Date.now() - 60 * 60_000).toISOString())
          .order("scheduled_at", { ascending: true }).limit(1).maybeSingle(),
        supabasePortal.from("thematic_snapshots")
          .select("theme, snapshot_change, snapshot_before, evidence_quote, period_end, confidence")
          .eq("user_id", userId).neq("confidence", "insufficient_data")
          .order("period_end", { ascending: false }).limit(1).maybeSingle(),
        supabasePortal.from("monthly_reports")
          .select("analysis_text, created_at").eq("user_id", userId)
          .not("analysis_text", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabasePortal.from("user_insights")
          .select("id", { count: "exact", head: true }).eq("user_id", userId).eq("category", "user_added"),
        supabase.from("meditations")
          .select("id, title, duration_seconds, description").eq("is_active", true).limit(20),
        profile?.current_journey_id && profile?.current_episode
          ? supabasePortal.from("journey_episodes")
              .select("id, title, stage_title, episode_number")
              .eq("journey_id", profile.current_journey_id)
              .lte("episode_number", profile.current_episode)
              .order("episode_number", { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      let meditation = null;
      const meditations = meditationResult.data ?? [];
      if (meditations.length > 0) {
        const { data: audios } = await supabase.from("meditation_audios")
          .select("meditation_id").in("meditation_id", meditations.map((item) => item.id));
        const withAudio = meditations.filter((item) => audios?.some((audio) => audio.meditation_id === item.id));
        meditation = withAudio[Number(dayKeyBrt().replace(/-/g, "")) % Math.max(1, withAudio.length)] ?? null;
      }

      const snapshot = snapshotResult.data;
      const report = reportResult.data;
      const insight = snapshot
        ? {
            title: snapshot.theme || "Um movimento seu",
            body: snapshot.snapshot_change || snapshot.snapshot_before || snapshot.evidence_quote || "",
          }
        : report?.analysis_text
          ? { title: "Seu mês em perspectiva", body: report.analysis_text }
          : null;

      return {
        lastSession: lastSessionResult.data,
        nextSession: nextSessionResult.data,
        insight,
        meditation,
        episode: episodeResult.data,
        userAddedCount: userAddedResult.count ?? 0,
      };
    },
    enabled: Boolean(userId),
  });

  const priority = useMemo(() => {
    if (zeroConversation) return {
      action: "conversation" as const,
      eyebrow: "Seu começo",
      title: "Pode começar do seu jeito",
      description: "Conte o que está passando por você agora, por texto ou áudio.",
      button: "Conversar com a AURA",
      icon: MessageCircle,
    };

    const nextSession = data?.nextSession;
    if (nextSession) {
      const diff = new Date(nextSession.scheduled_at).getTime() - Date.now();
      if (nextSession.status === "in_progress" || (diff <= 15 * 60_000 && diff >= -60 * 60_000)) {
        return {
          action: "session" as const,
          eyebrow: nextSession.status === "in_progress" ? "Seu encontro está acontecendo" : "Seu encontro começa em breve",
          title: nextSession.status === "in_progress" ? "Continue sua sessão" : "Está quase na hora",
          description: formatScheduledBrt(nextSession.scheduled_at),
          button: nextSession.status === "in_progress" ? "Continuar sessão" : "Entrar na sessão",
          icon: CalendarDays,
        };
      }
      if (!nextSession.preparation_note) {
        return {
          action: "session_preparation" as const,
          eyebrow: "Antes do próximo encontro",
          title: "Tem algo que você não quer esquecer?",
          description: `${formatScheduledBrt(nextSession.scheduled_at)}. Deixe uma situação, dúvida ou assunto preparado para a AURA considerar na abertura.`,
          button: "Preparar este encontro",
          icon: NotebookPen,
        };
      }
    }

    if (data?.episode) return {
      action: "journey" as const,
      eyebrow: "Sua jornada continua",
      title: data.episode.stage_title || data.episode.title,
      description: `Episódio ${data.episode.episode_number} disponível para você continuar no seu ritmo.`,
      button: "Abrir episódio",
      icon: BookOpen,
    };

    if (data?.lastSession && (data.lastSession.closure_text || data.lastSession.session_summary)) return {
      action: "continuity" as const,
      eyebrow: "Um fio para continuar",
      title: data.lastSession.theme_label || data.lastSession.focus_topic || "O que ficou do último encontro",
      description: sanitizePortalText(data.lastSession.closure_text || data.lastSession.session_summary || ""),
      button: "Retomar com a AURA",
      icon: Sparkles,
    };

    return {
      action: "conversation" as const,
      eyebrow: "Seu momento agora",
      title: "O que merece atenção hoje?",
      description: "Você não precisa chegar com tudo organizado. Comece pelo que estiver mais vivo.",
      button: "Conversar com a AURA",
      icon: MessageCircle,
    };
  }, [data, zeroConversation]);

  useEffect(() => {
    if (isLoading || !priority) return;
    const areaKey = `aura-today-opened:${userId}:${dayKeyBrt()}`;
    if (!sessionStorage.getItem(areaKey)) {
      sessionStorage.setItem(areaKey, "true");
      recordTodayEvent(userId, "area_opened", priority.action);
    }
    const key = `aura-today-presented:${userId}:${dayKeyBrt()}:${priority.action}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "true");
    recordTodayEvent(userId, "priority_presented", priority.action);
  }, [isLoading, priority, userId]);

  if (isLoading) return <PortalLoadingInline />;

  const handlePriority = () => {
    recordTodayEvent(userId, "priority_opened", priority.action);
    if (priority.action === "session" || priority.action === "session_preparation") {
      onNavigateTab("sessoes");
      return;
    }
    if (priority.action === "journey" && data?.episode?.id) {
      window.location.assign(`/episodio/${data.episode.id}?u=${userId}`);
      return;
    }
    if (priority.action === "continuity") {
      onOpenConversation(`Quero retomar o que ficou da minha última sessão: ${data?.lastSession?.closure_text || data?.lastSession?.session_summary || data?.lastSession?.focus_topic || "o que conversamos"}`);
      return;
    }
    onOpenConversation();
  };

  const accountCreatedAt = profile?.created_at ? new Date(profile.created_at).getTime() : null;
  const showProfileInvitation = !zeroConversation && data?.userAddedCount === 0 && accountCreatedAt && Date.now() - accountCreatedAt > 7 * 86_400_000;
  const showSessionContinuation = data?.nextSession && !["session", "session_preparation"].includes(priority.action);
  const showJourneyContinuation = data?.episode && priority.action !== "journey";
  const showLastSessionContinuation = data?.lastSession && priority.action !== "continuity";

  return (
    <div className="portal-area-page space-y-7">
      <header className="space-y-1 animate-fade-in">
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{greeting()}, {firstName}</h1>
        <p className="text-xs font-semibold text-primary">
          {profile?.last_user_message_at ? `Vocês conversaram ${relativeTime(profile.last_user_message_at)}` : "Seu momento de hoje"}
        </p>
        <IntimacyLevel userId={userId} />
      </header>

      <section className="relative overflow-hidden rounded-lg border border-primary/25 bg-primary p-6 text-primary-foreground shadow-card animate-fade-up">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/12" aria-hidden="true">
            <priority.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/70">{priority.eyebrow}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{priority.title}</h2>
            <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-primary-foreground/80">{priority.description}</p>
          </div>
        </div>
        <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={handlePriority}>
          {priority.button}<ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      {!zeroConversation && (showSessionContinuation || showJourneyContinuation || showLastSessionContinuation) && (
        <section className="space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Para continuar</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-foreground">De onde você parou</h2>
          </div>
          <div className="divide-y divide-border rounded-lg border bg-card shadow-sm">
            {showSessionContinuation && (
              <ContinuationRow icon={CalendarDays} title="Próxima sessão" detail={formatScheduledBrt(data.nextSession.scheduled_at)} action="Ver em Sessões" onClick={() => { recordTodayEvent(userId, "continuity_opened", "session"); onNavigateTab("sessoes"); }} />
            )}
            {showJourneyContinuation && (
              <ContinuationRow icon={BookOpen} title={data.episode.stage_title || data.episode.title} detail={`Episódio ${data.episode.episode_number} da sua jornada`} action="Continuar" onClick={() => { recordTodayEvent(userId, "continuity_opened", "journey"); window.location.assign(`/episodio/${data.episode.id}?u=${userId}`); }} />
            )}
            {showLastSessionContinuation && (
              <ContinuationRow icon={Sparkles} title="O que ficou da última sessão" detail={data.lastSession.theme_label || data.lastSession.focus_topic || "Seu encontro mais recente"} action="Rever" onClick={() => { recordTodayEvent(userId, "continuity_opened", "continuity"); onNavigateTab("sessoes"); }} />
            )}
          </div>
        </section>
      )}

      {!zeroConversation && <PerguntaDoDiaCard lastUserMessageAt={profile?.last_user_message_at} onRespond={(message) => { recordTodayEvent(userId, "invitation_opened", "conversation", { source: "daily_question" }); onOpenConversation(message); }} />}

      {data?.insight?.body && (
        <section className="border-l-2 border-primary px-4 py-1 animate-fade-up">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Uma leitura possível</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-foreground">{sanitizePortalText(data.insight.title)}</h2>
          <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">Talvez exista algo para observar aqui: {sanitizePortalText(data.insight.body)}</p>
          <Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => onNavigateTab("insights")}>Ver no meu percurso<ArrowRight className="h-4 w-4" /></Button>
        </section>
      )}

      {!zeroConversation && data?.meditation && (
        <section className="flex items-center gap-3 border-y border-border py-4 animate-fade-up">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Headphones className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{data.meditation.title}</p>
            <p className="text-xs text-muted-foreground">Uma pausa opcional{data.meditation.duration_seconds ? ` · ${Math.max(1, Math.round(data.meditation.duration_seconds / 60))} min` : ""}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Abrir meditação" onClick={() => { recordTodayEvent(userId, "invitation_opened", "practice"); onNavigateTab("meditacoes"); }}><ArrowRight className="h-4 w-4" /></Button>
        </section>
      )}

      {showProfileInvitation && (
        <Button type="button" variant="outline" className="h-auto w-full justify-start gap-3 whitespace-normal p-4 text-left" onClick={() => onNavigateTab("sobre")}>
          <PenLine className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1"><span className="block font-semibold">Quer contar algo direto à AURA?</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Algo importante sobre você pode acompanhar as próximas conversas.</span></span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Button>
      )}
    </div>
  );
}

function ContinuationRow({ icon: Icon, title, detail, action, onClick }: { icon: typeof CalendarDays; title: string; detail: string; action: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left first:rounded-t-lg last:rounded-b-lg" onClick={onClick}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground">{title}</span><span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{detail}</span></span>
      <span className="shrink-0 text-xs font-semibold text-primary">{action}</span>
    </Button>
  );
}