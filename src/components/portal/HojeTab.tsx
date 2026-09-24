import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bell, BookOpen, CalendarDays, Headphones, MessageCircle, NotebookPen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import type { Json } from "@/integrations/supabase/types";
import { PortalLoadingInline } from "./shared";
import { rememberTodayDirection, type TodayAction, type TodayDirection, type TodayDirectionResponse } from "@/lib/today-direction";

interface HojeTabProps {
  userId: string;
  firstName: string;
  profile: any;
  onNavigateTab: (tab: string) => void;
  onOpenConversation: (prefilledMessage?: string) => void;
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
    if (direction.action === "continuity") return onOpenConversation(`Quero retomar o que ficou da minha última sessão: ${direction.description}`);
    return onOpenConversation();
  };
  const PriorityIcon = ICONS[priority.action];
  const continuation = data.continuation;
  const ContinuationIcon = continuation ? ICONS[continuation.action] : null;
  const showPushInvitation = !data.pushEnabled && Boolean(profile?.last_user_message_at) && !continuation;

  return (
    <div className="portal-area-page space-y-7">
      <header className="space-y-1 animate-fade-in">
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{greeting()}, {firstName}</h1>
        <p className="text-xs font-semibold text-primary">{profile?.last_user_message_at ? `Vocês conversaram ${relativeTime(profile.last_user_message_at)}` : "Seu momento de hoje"}</p>
      </header>

      <section className="relative overflow-hidden rounded-lg border border-primary/25 bg-primary p-6 text-primary-foreground shadow-card animate-fade-up">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/12" aria-hidden="true"><PriorityIcon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-foreground/70">{priority.eyebrow}</p>
            <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{priority.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">{visibleDescription(priority)}</p>
          </div>
        </div>
        <Button type="button" variant="secondary" className="mt-5 w-full justify-between" onClick={() => openDirection(priority, "priority_opened")}>{priority.button}<ArrowRight className="h-4 w-4" /></Button>
      </section>

      {continuation && ContinuationIcon && (
        <section className="border-t border-border pt-4 animate-fade-up">
          <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 px-0 py-2 text-left" onClick={() => openDirection(continuation, "continuity_opened")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><ContinuationIcon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-muted-foreground">{continuation.eyebrow}</span><span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{visibleDescription(continuation)}</span></span>
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