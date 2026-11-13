import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, Moon, Play, BookOpen, CalendarDays, Headphones, MessageCircle, NotebookPen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import type { Json } from "@/integrations/supabase/types";
import { PortalLoadingInline } from "./shared";
import { PrayerEntranceCard } from "./PrayerEntranceCard";
import { getNightPrayer, requestPrayerPlayback } from "@/lib/prayers";
import { brtDayKey, selectTodayHero } from "@/lib/today-hero";
import { rememberTodayDirection, type TodayAction, type TodayDirection, type TodayDirectionResponse } from "@/lib/today-direction";

interface HojeTabProps {
  userId: string;
  firstName: string;
  profile: any;
  onNavigateTab: (tab: string) => void;
  onOpenConversation: (prefilledMessage?: string, options?: { resumeSessionId?: string; resumeLabel?: string }) => void;
  onOpenNotifications: () => void;
}

const ICONS: Record<TodayAction, typeof MessageCircle> = {
  conversation: MessageCircle, session: CalendarDays, session_preparation: NotebookPen,
  journey: BookOpen, continuity: Sparkles, practice: Headphones, progress: Sparkles,
};

function brtHour() {
  return Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(new Date()));
}

function greeting() {
  const hour = brtHour();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function dayKeyBrt() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
}

function relativeTime(iso: string | null | undefined) {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
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
  const label = new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function visibleDescription(direction: TodayDirection) {
  return direction.reason.startsWith("session_") || direction.reason === "upcoming_session"
    ? formatScheduledBrt(direction.description)
    : direction.description;
}

function recordTodayEvent(userId: string, eventType: string, direction: TodayDirection) {
  void supabasePortal.from("portal_value_events").insert({
    user_id: userId, feature: "today", event_type: eventType, source: "app",
    metadata: { action: direction.action, reason: direction.reason, milestone: direction.milestone ?? null } as Json,
  }).then(({ error }) => {
    if (error) console.warn("Não foi possível registrar a interação em Hoje", error.message);
  });
}

export function HojeTab({ userId, firstName, profile, onNavigateTab, onOpenConversation, onOpenNotifications }: HojeTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-today-direction", userId],
    queryFn: async () => {
      const { data: response, error } = await supabasePortal.functions.invoke("today-direction", { body: {} });
      if (error || !response?.reliable || !response?.direction) throw error || new Error("direction_unavailable");
      return response as TodayDirectionResponse;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["portal-today-direction", userId] });
    window.addEventListener("aura:today-changed", refresh);
    return () => window.removeEventListener("aura:today-changed", refresh);
  }, [queryClient, userId]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      void queryClient.invalidateQueries({ queryKey: ["portal-today-direction", userId] });
    };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [queryClient, userId]);
  const dismissKey = `aura-thread-dismissed:${userId}:${brtDayKey(nowMs)}`;
  const [dismissedThreadId, setDismissedThreadId] = useState<string | null>(null);
  useEffect(() => { try { setDismissedThreadId(localStorage.getItem(dismissKey)); } catch { setDismissedThreadId(null); } }, [dismissKey]);

  const priority = data?.direction;
  useEffect(() => {
    if (!priority) return;
    const areaKey = `aura-today-opened:${userId}:${dayKeyBrt()}`;
    if (!sessionStorage.getItem(areaKey)) {
      sessionStorage.setItem(areaKey, "true");
      recordTodayEvent(userId, "area_opened", priority);
    }
    const key = `aura-today-presented:${userId}:${dayKeyBrt()}:${priority.reason}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "true");
    recordTodayEvent(userId, "priority_presented", priority);
  }, [priority, userId]);

  if (isLoading) return <PortalLoadingInline />;
  if (isError || !priority) return (
    <div className="portal-area-page space-y-6">
      <header><h1 className="font-display text-3xl font-semibold text-foreground">{greeting()}, {firstName}</h1></header>
      <section className="border-l-2 border-primary px-4 py-2">
        <p className="font-display text-xl font-semibold text-foreground">Seu espaço continua aqui</p>
        <p className="mt-2 text-sm text-muted-foreground">Não conseguimos atualizar sua direção agora. Você pode conversar com a AURA normalmente.</p>
        <Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => onOpenConversation()}>Conversar com a AURA<ArrowRight className="h-4 w-4" /></Button>
      </section>
    </div>
  );

  const openDirection = (direction: TodayDirection, eventType: "priority_opened" | "continuity_opened") => {
    recordTodayEvent(userId, eventType, direction);
    if (eventType === "priority_opened") rememberTodayDirection(direction);
    if (direction.target === "sessoes") return onNavigateTab("sessoes");
    if (direction.target === "jornadas") return onNavigateTab("jornadas");
    if (direction.target === "meditacoes") return onNavigateTab("meditacoes");
    if (direction.target === "insights") return onNavigateTab("insights");
    if (direction.target === "episode" && direction.targetId) return navigate(`/episodio/${direction.targetId}?u=${userId}`);
    if (direction.action === "continuity") return onOpenConversation(undefined, { resumeSessionId: data.heroSignals?.lastSession?.id });
    return onOpenConversation();
  };
  const nightPrayer = getNightPrayer(new Date(nowMs));
  const hero = selectTodayHero({
    nowMs,
    nextSession: data.heroSignals?.nextSession ?? null,
    lastSession: data.heroSignals?.lastSession ?? null,
    nightAudioAvailable: Boolean(nightPrayer),
    dismissedThreadId,
  });
  // Na rotina, o backend sugere descobertas; estados de encontro/fio já foram decididos acima.
  const routine = ["session", "session_preparation", "continuity"].includes(priority.action)
    ? { action: "conversation" as TodayAction, eyebrow: "Seu momento agora", title: "O que merece atenção hoje?", description: "Você não precisa chegar com tudo organizado. Comece pelo que estiver mais vivo.", button: "Conversar com a AURA", target: "conversation" as const, reason: "open_conversation" }
    : priority;
  const RoutineIcon = ICONS[routine.action];
  const heroEvent = (eventType: string) => recordTodayEvent(userId, eventType, { ...routine, action: hero.kind === "routine" ? routine.action : (hero.kind === "night" ? "practice" : hero.kind === "thread" ? "continuity" : hero.kind === "prepare" ? "session_preparation" : "session"), reason: `hero_${hero.kind}` });
  const secondary = hero.kind === "night" || hero.kind === "routine" ? hero.secondarySession : null;
  const showPushInvitation = !data.pushEnabled && Boolean(profile?.last_user_message_at) && hero.kind === "routine" && !secondary;
  const card = "relative overflow-hidden rounded-lg border border-primary/25 bg-primary p-6 text-primary-foreground shadow-card animate-fade-up";
  const eyebrow = "text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/70";

  return (
    <div className="portal-area-page space-y-7">
      <header className="space-y-1 animate-fade-in">
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{greeting()}, {firstName}</h1>
        <p className="text-xs font-semibold text-primary">{hero.kind === "night" ? "Hora de desacelerar" : profile?.last_user_message_at ? `Vocês conversaram ${relativeTime(profile.last_user_message_at)}` : "Seu momento de hoje"}</p>
      </header>

      {hero.kind === "session" && (
        <section className={card}>
          <p className={eyebrow}>{hero.session.status === "in_progress" ? "Seu encontro está acontecendo" : "Seu encontro de hoje"}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{hero.session.status === "in_progress" ? "Continue de onde parou" : formatScheduledBrt(hero.session.scheduled_at)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">{hero.canEnter ? "O acesso já está aberto. A AURA te espera." : hero.session.preparation_note ? "Sua anotação está guardada para a hora do encontro." : "Se algo estiver vivo, você pode deixar anotado para não esquecer."}</p>
          {hero.canEnter
            ? <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={() => { heroEvent("priority_opened"); onNavigateTab("sessoes"); }}>{hero.session.status === "in_progress" ? "Continuar encontro" : "Entrar no encontro"}<ArrowRight className="h-4 w-4" /></Button>
            : <>
                <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={() => { heroEvent("priority_opened"); onNavigateTab("sessoes"); }}>{hero.session.preparation_note ? "Editar anotação" : "Deixar uma anotação"}<NotebookPen className="h-4 w-4" /></Button>
                <Button type="button" variant="link" className="mt-2 h-auto p-0 text-primary-foreground/80" onClick={() => onNavigateTab("sessoes")}>Precisa mudar? Reagendar</Button>
              </>}
        </section>
      )}

      {hero.kind === "night" && nightPrayer && (
        <section className="relative isolate overflow-hidden rounded-xl shadow-card animate-fade-up">
          <img src={nightPrayer.image} alt={nightPrayer.imageAlt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 portal-prayer-veil" aria-hidden="true" />
          <button type="button" onClick={() => { heroEvent("priority_opened"); requestPrayerPlayback(nightPrayer.id); onNavigateTab("oracoes"); }} className="portal-prayer-text relative flex min-h-[15rem] w-full flex-col justify-end gap-2 p-5 text-left" aria-label={`Ouvir oração: ${nightPrayer.title}`}>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"><Moon className="h-3.5 w-3.5" />Oração da noite · {Math.max(1, Math.round(nightPrayer.duration / 60))} min</span>
            <span className="block max-w-[18rem] font-display text-2xl font-semibold leading-tight">{nightPrayer.title}</span>
            <span className="block max-w-[20rem] text-sm leading-relaxed">Você não precisa resolver mais nada hoje.</span>
            <span className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm [text-shadow:none]"><Play className="h-3.5 w-3.5" fill="currentColor" />Ouvir agora</span>
          </button>
        </section>
      )}

      {hero.kind === "prepare" && (
        <section className={card}>
          <p className={eyebrow}>Seu próximo encontro</p>
          <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{formatScheduledBrt(hero.session.scheduled_at)}</h2>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">{hero.session.preparation_note ? "Sua anotação está guardada. Pode ajustar quando quiser." : "Se tiver algo que não queira esquecer, pode deixar guardado para a hora."}</p>
          <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={() => { heroEvent("priority_opened"); rememberTodayDirection({ ...routine, action: "session_preparation", reason: "hero_prepare" }); onNavigateTab("sessoes"); }}>{hero.session.preparation_note ? "Editar anotação" : "Deixar uma anotação"}<NotebookPen className="h-4 w-4" /></Button>
          <Button type="button" variant="link" className="mt-2 h-auto p-0 text-primary-foreground/80" onClick={() => onNavigateTab("sessoes")}>Precisa mudar de dia? Reagendar</Button>
        </section>
      )}

      {hero.kind === "thread" && (
        <section className={card}>
          <p className={eyebrow}>Da nossa última conversa{hero.session.theme_label ? ` · ${hero.session.theme_label}` : ""}</p>
          <p className="mt-2 font-display text-xl font-semibold leading-snug">“{hero.text}”</p>
          <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={() => { heroEvent("priority_opened"); onOpenConversation(undefined, { resumeSessionId: hero.session.id, resumeLabel: hero.session.theme_label || hero.text }); }}>Retomar com a AURA<MessageCircle className="h-4 w-4" /></Button>
          <Button type="button" variant="link" className="mt-2 h-auto p-0 text-primary-foreground/80" onClick={() => { try { localStorage.setItem(dismissKey, hero.session.id); } catch { /* sem armazenamento */ } setDismissedThreadId(hero.session.id); heroEvent("thread_dismissed"); }}>Agora não</Button>
        </section>
      )}

      {hero.kind === "routine" && (
        <>
          <section className={card}>
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/12" aria-hidden="true"><RoutineIcon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className={eyebrow}>{routine.eyebrow}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{routine.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">{visibleDescription(routine)}</p>
              </div>
            </div>
            <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={() => openDirection(routine, "priority_opened")}>{routine.button}<ArrowRight className="h-4 w-4" /></Button>
          </section>
          <PrayerEntranceCard userId={userId} onOpen={() => onNavigateTab("oracoes")} onEvent={(eventType) => { void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "today", event_type: eventType, source: "app", metadata: { origin: "today_prayer" } as Json }).then(() => undefined); }} />
        </>
      )}

      {secondary && (
        <section className="border-t border-border pt-4 animate-fade-up">
          <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 px-0 py-2 text-left" onClick={() => onNavigateTab("sessoes")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><CalendarDays className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-muted-foreground">Seu próximo encontro</span><span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{formatScheduledBrt(secondary.scheduled_at)}</span></span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          </Button>
        </section>
      )}

      {showPushInvitation && (
        <section className="flex items-center gap-3 border-t border-border pt-4 animate-fade-up">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Bell className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">Continue mesmo longe do app</p><p className="text-xs leading-relaxed text-muted-foreground">Receba somente direções e lembretes importantes.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={onOpenNotifications}>Ativar</Button>
        </section>
      )}
    </div>
  );
}