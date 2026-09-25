import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Bell, Calendar, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, MessageCircle, NotebookPen, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { EmptyState, PortalLoadingInline } from "./shared";
import { presentClosure } from "./whatsapp";
import { sanitizePortalText } from "./sanitize";
import type { Json } from "@/integrations/supabase/types";
import { reportPushConversion } from "@/lib/push-notifications";
import { reportTodayDirectionProgress } from "@/lib/today-direction";

const PLAN_SESSION_LIMITS: Record<string, number> = { essencial: 1, direcao: 4, transformacao: 8 };
type SessionProfile = { plan?: string | null; plan_tier?: string | null; status?: string | null } | null;
type PortalSession = {
  id: string;
  scheduled_at: string;
  ended_at?: string | null;
  focus_topic?: string | null;
  status: string;
  theme_label?: string | null;
  session_summary?: string | null;
  reframe_text?: string | null;
  closure_type?: string | null;
  closure_text?: string | null;
  preparation_note?: string | null;
  reframe_feedback?: string | null;
  reframe_feedback_text?: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  access_not_available: "Seu plano não permite agendar uma sessão agora.",
  future_time_required: "Escolha um horário que ainda não passou.",
  invalid_time_interval: "Escolha um horário em intervalos de 15 minutos.",
  session_time_conflict: "Esse horário fica muito perto de outra sessão já agendada.",
  monthly_limit_reached: "Você já usou todas as sessões disponíveis nesse mês.",
  session_not_available: "Essa sessão não está mais disponível para alteração.",
  session_required: "Essa sessão não está mais disponível. Atualize a tela e tente novamente.",
  session_already_started: "O horário dessa sessão já chegou e ela não pode mais ser alterada.",
  session_start_unavailable: "A entrada fica disponível 15 minutos antes do horário.",
  invalid_rating: "Escolha uma nota de 1 a 5.",
  correction_required: "Conte brevemente o que você gostaria de ajustar.",
  auth_required: "Seu acesso expirou. Entre novamente para continuar.",
  invalid_request: "Não foi possível validar os dados escolhidos. Confira e tente novamente.",
  session_update_failed: "Não foi possível atualizar sua sessão. Tente novamente.",
};

function brtParts(date = new Date()) {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => values.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, year: get("year"), month: get("month") };
}

function brtIso(date: string, time: string) {
  return `${date}T${time}:00-03:00`;
}

function monthKeyFromDate(date: Date) {
  const parts = brtParts(date);
  return `${parts.year}-${parts.month}`;
}

function addMonths(key: string, amount: number) {
  const [year, month] = key.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1 + amount, 15, 12));
  return monthKeyFromDate(result);
}

function monthBounds(key: string) {
  return {
    start: `${key}-01T00:00:00-03:00`,
    end: `${addMonths(key, 1)}-01T00:00:00-03:00`,
  };
}

function monthLabel(key: string) {
  const label = new Date(`${key}-15T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sessionLimit(profile: SessionProfile) {
  const tier = String(profile?.plan_tier || "").toLowerCase();
  if (tier === "base") return 0;
  if (tier === "lite" || tier === "taster") return 1;
  return PLAN_SESSION_LIMITS[String(profile?.plan || "").toLowerCase()] || 0;
}

function formatSessionDate(value: string) {
  const label = new Date(value).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function countdown(value: string) {
  const minutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "Horário iniciado";
  if (minutes < 60) return `Começa em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Começa em ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Começa em ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function SessoesTab({
  userId,
  profile,
  onChangePlan,
  onOpenConversation,
  onOpenNotifications,
}: {
  userId: string;
  profile: SessionProfile;
  onChangePlan: (currentLimit: number) => void;
  onOpenConversation: (prefilledMessage?: string) => void;
  onOpenNotifications: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = brtParts().date;
  const currentMonth = monthKeyFromDate(new Date());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<PortalSession | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [preparation, setPreparation] = useState("");
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem("aura-push-enabled") === "true");
  const trackedViews = useRef(new Set<string>());

  const { data: allSessions = [], isLoading } = useQuery({
    queryKey: ["portal-sessions", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal.from("sessions")
        .select("id, scheduled_at, ended_at, status, focus_topic, theme_label, session_summary, reframe_text, closure_type, closure_text, preparation_note, reframe_feedback, reframe_feedback_text")
        .eq("user_id", userId).order("scheduled_at", { ascending: false }).limit(150);
      if (error) throw error;
      return (data || []) as PortalSession[];
    },
    enabled: Boolean(userId),
  });

  const { data: ratings = [] } = useQuery({
    queryKey: ["portal-session-ratings", userId],
    queryFn: async () => {
      const { data } = await supabasePortal.from("session_ratings").select("session_id, rating").eq("user_id", userId).limit(150);
      return data || [];
    },
    enabled: Boolean(userId),
  });

  const monthSessions = useMemo(() => allSessions.filter((session) => monthKeyFromDate(new Date(session.scheduled_at)) === selectedMonth), [allSessions, selectedMonth]);
  const upcomingSessions = monthSessions.filter((session) => ["scheduled", "in_progress"].includes(session.status)).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const completedSessions = allSessions.filter((session) => session.status === "completed").sort((a, b) => new Date(b.ended_at || b.scheduled_at).getTime() - new Date(a.ended_at || a.scheduled_at).getTime());
  const monthUsed = monthSessions.filter((session) => ["scheduled", "in_progress", "completed", "no_show"].includes(session.status)).length;
  const activeSessions = allSessions.filter((session) => ["scheduled", "in_progress"].includes(session.status));
  const ratingMap = new Map(ratings.map((rating) => [rating.session_id, rating.rating]));
  const planLimit = sessionLimit(profile);
  const bounds = monthBounds(selectedMonth);

  const minDate = selectedMonth === currentMonth ? today : `${selectedMonth}-01`;
  const maxDate = new Date(new Date(bounds.end).getTime() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const availableTimes = useMemo(() => {
    const result: string[] = [];
    for (let hour = 0; hour <= 23; hour += 1) {
      for (const minute of [0, 15, 30, 45]) {
        const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        const candidate = new Date(brtIso(date, value)).getTime();
        if (candidate <= Date.now()) continue;
        const conflicts = activeSessions.some((session) => session.id !== selectedSession?.id && Math.abs(new Date(session.scheduled_at).getTime() - candidate) < 45 * 60_000);
        if (!conflicts) result.push(value);
      }
    }
    return result;
  }, [activeSessions, date, selectedSession?.id]);

  const track = (eventType: string, metadata: Record<string, unknown> = {}) => {
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "session", event_type: eventType, source: "app", metadata: metadata as Json });
  };

  useEffect(() => {
    if (isLoading || trackedViews.current.has("area_opened")) return;
    trackedViews.current.add("area_opened");
    track("area_opened", { month: selectedMonth });
  }, [isLoading, selectedMonth]);

  useEffect(() => {
    const nextSession = upcomingSessions[0];
    if (!nextSession) return;
    const key = `next_session_viewed:${nextSession.id}`;
    if (trackedViews.current.has(key)) return;
    trackedViews.current.add(key);
    track("next_session_viewed", { session_id: nextSession.id, status: nextSession.status });
  }, [upcomingSessions]);

  useEffect(() => {
    if (planLimit <= 0 || monthUsed < planLimit) return;
    const key = `quota_reached:${selectedMonth}:${planLimit}`;
    if (trackedViews.current.has(key)) return;
    trackedViews.current.add(key);
    track("quota_reached", { month: selectedMonth, limit: planLimit, used: monthUsed });
  }, [monthUsed, planLimit, selectedMonth]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["portal-sessions", userId] }),
      queryClient.invalidateQueries({ queryKey: ["portal-session-ratings", userId] }),
      queryClient.invalidateQueries({ queryKey: ["portal-hoje-next-session", userId] }),
      queryClient.invalidateQueries({ queryKey: ["portal-hoje-last-session", userId] }),
    ]);
  };

  const openScheduler = (session?: PortalSession) => {
    setEditing(Boolean(session));
    setSelectedSession(session || null);
    if (session) {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(session.scheduled_at));
      const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
      setDate(`${get("year")}-${get("month")}-${get("day")}`);
      setTime(`${get("hour")}:${get("minute")}`);
    } else {
      setDate(minDate);
      setTime("");
      track("scheduling_started", { month: selectedMonth });
    }
    setSchedulerOpen(true);
  };

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabasePortal.functions.invoke("manage-portal-session", { body });
    const code = data?.error || (error ? "session_update_failed" : null);
    if (code) throw new Error(code);
    return data;
  };

  const manageSession = async (action: "schedule" | "reschedule" | "cancel") => {
    if (action !== "cancel" && (!date || !time)) return;
    if (action !== "schedule" && !selectedSession?.id) return;
    setSaving(true);
    try {
      await invoke({ action, scheduledAt: action === "cancel" ? null : new Date(brtIso(date, time)).toISOString(), sessionId: action === "schedule" ? null : selectedSession?.id });
      setSchedulerOpen(false);
      setCancelOpen(false);
      setSelectedSession(null);
      await refresh();
      track(action === "schedule" ? "scheduled" : action === "reschedule" ? "rescheduled" : "cancelled", { month: selectedMonth });
      if (action === "schedule") void reportPushConversion("/meu-espaco?tab=sessoes", "first14_session");
      if (action === "schedule") reportTodayDirectionProgress(userId, "completed", "session");
      if (action === "schedule" && completedSessions.length > 0) {
        track("repeat_session_scheduled", { month: selectedMonth, previous_completed_count: completedSessions.length });
      }
      toast({
        title: action === "schedule" ? "Sessão agendada" : action === "reschedule" ? "Novo horário confirmado" : "Sessão cancelada",
        description: action === "cancel" ? "Ela não contará no limite do seu plano." : "A AURA vai lembrar você 24 horas e 5 minutos antes.",
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "session_update_failed";
      track("action_failed", { action, code });
      toast({ title: "Não foi possível concluir", description: ERROR_MESSAGES[code] || ERROR_MESSAGES.session_update_failed, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const enterSession = async (session: PortalSession) => {
    setSaving(true);
    try {
      if (session.status === "scheduled") await invoke({ action: "start", sessionId: session.id });
      track("entered", { session_id: session.id });
      await refresh();
      onOpenConversation("Vamos começar nossa sessão.");
    } catch (error) {
      const code = error instanceof Error ? error.message : "session_update_failed";
      toast({ title: "Ainda não foi possível entrar", description: ERROR_MESSAGES[code] || ERROR_MESSAGES.session_update_failed, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveExperience = async (action: "save_preparation" | "rate" | "confirm_reframe" | "correct_reframe", session: PortalSession, value?: string, rating?: number) => {
    setSaving(true);
    try {
      await invoke({ action, sessionId: session.id, value: value || null, rating: rating || null });
      await refresh();
      track(action, { session_id: session.id, rating });
      if (action === "save_preparation") void reportPushConversion("/meu-espaco?tab=sessoes", "first14_session");
      if (action === "save_preparation") reportTodayDirectionProgress(userId, "completed", "session_preparation");
      setPreparationOpen(false);
      setCorrectionOpen(false);
      toast({ title: action === "rate" ? "Obrigado pela avaliação" : action === "confirm_reframe" ? "Leitura confirmada" : action === "correct_reframe" ? "Ajuste guardado" : "Preparação guardada" });
    } catch (error) {
      const code = error instanceof Error ? error.message : "session_update_failed";
      toast({ title: "Não foi possível guardar", description: ERROR_MESSAGES[code] || ERROR_MESSAGES.session_update_failed, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <PortalLoadingInline />;

  return (
    <div className="portal-area-page space-y-6">
      <section className="flex items-center justify-between border-b border-border pb-4">
        <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))} disabled={selectedMonth === currentMonth} aria-label="Mês anterior"><ChevronLeft /></Button>
        <div className="text-center"><p className="text-[10px] font-bold uppercase text-muted-foreground">Sua agenda</p><h2 className="mt-1 font-display text-lg font-semibold">{monthLabel(selectedMonth)}</h2></div>
        <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} aria-label="Próximo mês"><ChevronRight /></Button>
      </section>

      {upcomingSessions.length === 0 ? (
        <section className="border-y border-border py-6 text-center animate-fade-in">
          <CalendarDays className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma sessão marcada em {monthLabel(selectedMonth)}.</p>
          <Button type="button" className="mt-4" onClick={() => openScheduler()} disabled={planLimit === 0 || monthUsed >= planLimit}><Calendar /> Agendar sessão</Button>
        </section>
      ) : (
        <section className="space-y-3 animate-fade-up">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Sessões marcadas</h2>{monthUsed < planLimit && <Button type="button" size="sm" onClick={() => openScheduler()}><Plus /> Agendar</Button>}</div>
          {upcomingSessions.map((session, index) => {
            const diff = new Date(session.scheduled_at).getTime() - Date.now();
            const canEnter = session.status === "in_progress" || (diff <= 15 * 60_000 && diff >= -60 * 60_000);
            return (
              <article key={session.id} className={index === 0 ? "rounded-lg bg-foreground p-5 text-background shadow-card" : "rounded-lg border border-border bg-card p-4 shadow-sm"}>
                <div className="flex items-center justify-between gap-3"><p className={`text-xs font-bold uppercase ${index === 0 ? "text-accent" : "text-primary"}`}>{session.status === "in_progress" ? "Sessão em andamento" : index === 0 ? "Próxima sessão" : "Sessão agendada"}</p><span className={`text-xs ${index === 0 ? "text-background/70" : "text-muted-foreground"}`}>{countdown(session.scheduled_at)}</span></div>
                <p className={`mt-2 font-semibold leading-snug ${index === 0 ? "text-xl" : "text-base"}`}>{formatSessionDate(session.scheduled_at)}</p>
                {canEnter ? (
                  <Button type="button" className="mt-4 w-full" variant={index === 0 ? "secondary" : "default"} onClick={() => void enterSession(session)} disabled={saving}><MessageCircle />{session.status === "in_progress" ? "Continuar sessão" : "Entrar na sessão"}</Button>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant={index === 0 ? "secondary" : "outline"} size="sm" onClick={() => openScheduler(session)}><Pencil /> Reagendar</Button>
                    <Button type="button" variant="ghost" size="sm" className={index === 0 ? "text-background hover:text-foreground" : "text-muted-foreground"} onClick={() => { setSelectedSession(session); setCancelOpen(true); }}><Trash2 /> Cancelar</Button>
                  </div>
                )}
                {session.status === "scheduled" && (
                  <div className={`mt-4 border-t pt-4 ${index === 0 ? "border-background/20" : "border-border"}`}>
                    <div className="flex items-start gap-3">
                      <NotebookPen className={`mt-0.5 h-5 w-5 shrink-0 ${index === 0 ? "text-accent" : "text-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{session.preparation_note ? "Encontro preparado" : "Tem algo que você quer trazer?"}</p>
                        <p className={`mt-1 text-xs leading-relaxed ${index === 0 ? "text-background/70" : "text-muted-foreground"}`}>
                          {session.preparation_note ? "A AURA vai considerar sua anotação quando a sessão começar." : "Conte à AURA o que você quer conversar ou não quer esquecer."}
                        </p>
                        <Button type="button" variant={index === 0 ? "secondary" : "outline"} size="sm" className="mt-3" onClick={() => { setSelectedSession(session); setPreparation(session.preparation_note || ""); setPreparationOpen(true); }}>
                          {session.preparation_note ? <Pencil /> : <NotebookPen />}{session.preparation_note ? "Editar preparação" : "Preparar este encontro"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {planLimit > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{monthUsed} de {planLimit} {planLimit > 1 ? "sessões" : "sessão"} em {monthLabel(selectedMonth)}</span><span>{Math.max(0, planLimit - monthUsed)} {planLimit - monthUsed === 1 ? "disponível" : "disponíveis"}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (monthUsed / planLimit) * 100)}%` }} /></div>
        </section>
      )}

      <section className="flex items-center gap-3 border-y border-border py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary"><Bell /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Lembretes 24h e 5 min antes</p><p className="text-xs text-muted-foreground">{pushEnabled ? "Ativados neste aparelho." : "Ative para receber mesmo com o app fechado."}</p></div>
        {!pushEnabled && <Button type="button" variant="outline" size="sm" onClick={() => { onOpenNotifications(); setTimeout(() => setPushEnabled(localStorage.getItem("aura-push-enabled") === "true"), 1500); }}>Ativar</Button>}
      </section>

      {profile?.status !== "demo" && monthUsed >= planLimit && planLimit > 0 && planLimit < 8 && (
        <section className="border-y border-border py-5"><p className="text-sm font-semibold">Sua agenda de {monthLabel(selectedMonth)} está completa.</p><p className="mt-1 text-sm text-muted-foreground">Se quiser uma frequência maior, veja apenas os planos que liberam mais encontros.</p><Button type="button" className="mt-4" onClick={() => { track("upgrade_opened", { current_limit: planLimit }); onChangePlan(planLimit); }}><ArrowUpRight /> Quero mais sessões</Button></section>
      )}

      {completedSessions.length === 0 ? <EmptyState icon={Calendar} title="Nenhuma sessão concluída ainda" description="Depois do primeiro encontro, seu resumo e o que ficou dele aparecem aqui." /> : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">O que ficou dos encontros</h2>
          {completedSessions.map((session, index) => {
            const rating = ratingMap.get(session.id);
            const closure = session.closure_type ? presentClosure(session.closure_type, session.closure_text) : null;
            return (
              <details key={session.id} className="group rounded-lg border border-border bg-card p-4 shadow-sm animate-fade-up" style={{ animationDelay: `${index * 40}ms` }} onToggle={(event) => event.currentTarget.open && track("summary_opened", { session_id: session.id })}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-xs font-bold uppercase text-primary">{new Date(session.ended_at || session.scheduled_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p><p className="mt-1 truncate text-lg font-semibold">{session.theme_label || session.focus_topic || "Sessão"}</p>{closure && <span className="mt-2 inline-block rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">{closure.title}</span>}</div>
                  {rating ? <div className="flex shrink-0 items-center gap-1"><Star className="fill-primary text-primary" size={14} /><span className="text-sm font-bold">{rating}</span></div> : null}
                </summary>
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {session.session_summary && <div><p className="mb-1 text-xs font-bold uppercase text-primary">Resumo</p><p className="text-sm leading-relaxed">{sanitizePortalText(session.session_summary)}</p></div>}
                  {session.reframe_text && <div className="rounded-lg bg-secondary/50 p-3"><p className="mb-1 text-xs font-bold uppercase text-primary">Uma leitura possível</p><p className="text-sm leading-relaxed">{sanitizePortalText(session.reframe_text)}</p><p className="mt-2 text-xs text-muted-foreground">Veja se isso faz sentido para você.</p>{!session.reframe_feedback ? <div className="mt-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void saveExperience("confirm_reframe", session)}><Check /> Faz sentido</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedSession(session); setCorrection(""); setCorrectionOpen(true); }}>Quero ajustar</Button></div> : <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary"><Check size={14} />{session.reframe_feedback === "confirmed" ? "Você confirmou esta leitura." : "Seu ajuste foi guardado."}</p>}</div>}
                  {session.closure_text && <div><p className="mb-1 text-xs font-bold uppercase text-primary">Fechamento</p><p className="border-l-2 border-accent pl-3 text-sm italic leading-relaxed">“{sanitizePortalText(session.closure_text)}”</p></div>}
                  {!rating && <div><p className="mb-2 text-xs font-bold uppercase text-primary">Como foi este encontro?</p><div className="flex gap-1">{[1, 2, 3, 4, 5].map((value) => <Button key={value} type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => void saveExperience("rate", session, undefined, value)} aria-label={`Dar nota ${value}`}><Star className="text-primary" /></Button>)}</div></div>}
                  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => onOpenConversation(`Quero retomar um ponto da sessão de ${new Date(session.scheduled_at).toLocaleDateString("pt-BR")}: ${session.closure_text || session.reframe_text || session.session_summary || "o que conversamos"}`)}><MessageCircle /> Retomar com a AURA</Button><Button type="button" variant="outline" size="sm" onClick={() => onOpenConversation(`Quero levar este ponto para minha próxima sessão: ${session.closure_text || session.reframe_text || session.session_summary || "o que conversamos"}`)}>Levar para a próxima <ArrowRight /></Button></div>
                </div>
              </details>
            );
          })}
        </section>
      )}

      <Dialog open={schedulerOpen} onOpenChange={(open) => { if (saving) return; if (!open && schedulerOpen) track("scheduling_abandoned", { month: selectedMonth, action: editing ? "reschedule" : "schedule", date_selected: Boolean(date), time_selected: Boolean(time) }); setSchedulerOpen(open); }}><DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg bg-card"><DialogHeader className="text-left"><DialogTitle>{editing ? "Escolher um novo horário" : "Agendar sessão"}</DialogTitle><DialogDescription>Horários de Brasília em {monthLabel(selectedMonth)}. Opções próximas de outra sessão já ficam ocultas.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><label className="block text-sm font-medium">Dia<Input className="mt-1.5" type="date" min={minDate} max={maxDate} value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} /></label><label className="block text-sm font-medium">Horário<select className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" value={time} onChange={(event) => setTime(event.target.value)}><option value="">Selecione</option>{availableTimes.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label>{availableTimes.length === 0 && <p className="text-sm text-muted-foreground">Não há horários disponíveis neste dia.</p>}</div><DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setSchedulerOpen(false)} disabled={saving}>Voltar</Button><Button type="button" onClick={() => void manageSession(editing ? "reschedule" : "schedule")} disabled={!date || !time || saving}>{saving ? "Confirmando..." : "Confirmar horário"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={preparationOpen} onOpenChange={(open) => !saving && setPreparationOpen(open)}><DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg bg-card"><DialogHeader className="text-left"><DialogTitle>Preparar este encontro</DialogTitle><DialogDescription>Opcional. O que você não quer esquecer de levar para esta sessão?</DialogDescription></DialogHeader><Textarea className="bg-background" value={preparation} onChange={(event) => setPreparation(event.target.value)} maxLength={500} rows={5} placeholder="Pode ser uma situação, dúvida ou algo que ficou da última conversa." /><p className="text-right text-xs text-muted-foreground">{preparation.length}/500</p><DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setPreparationOpen(false)}>Voltar</Button><Button type="button" disabled={saving || !selectedSession} onClick={() => selectedSession && void saveExperience("save_preparation", selectedSession, preparation)}>{saving ? "Guardando..." : "Guardar preparação"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={correctionOpen} onOpenChange={(open) => !saving && setCorrectionOpen(open)}><DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg bg-card"><DialogHeader className="text-left"><DialogTitle>Ajustar esta leitura</DialogTitle><DialogDescription>Conte o que não representa bem o que você viveu. A AURA usa seu ajuste nas próximas conversas.</DialogDescription></DialogHeader><Textarea className="bg-background" value={correction} onChange={(event) => setCorrection(event.target.value)} maxLength={800} rows={5} placeholder="O que seria mais fiel para você?" /><p className="text-right text-xs text-muted-foreground">{correction.length}/800</p><DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => setCorrectionOpen(false)}>Voltar</Button><Button type="button" disabled={saving || !selectedSession || !correction.trim()} onClick={() => selectedSession && void saveExperience("correct_reframe", selectedSession, correction)}>{saving ? "Guardando..." : "Guardar ajuste"}</Button></DialogFooter></DialogContent></Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={(open) => !saving && setCancelOpen(open)}><AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg"><AlertDialogHeader><AlertDialogTitle>Cancelar esta sessão?</AlertDialogTitle><AlertDialogDescription>Ela deixa de ocupar uma sessão do mês e você poderá escolher outro horário depois.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Manter sessão</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void manageSession("cancel"); }} disabled={saving}>{saving ? "Cancelando..." : "Cancelar sessão"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}