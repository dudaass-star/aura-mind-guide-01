import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Calendar, CalendarDays, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { EmptyState, PortalLoadingInline } from "./shared";
import { presentClosure } from "./whatsapp";
import { sanitizePortalText } from "./sanitize";

const PLAN_SESSION_LIMITS: Record<string, number> = { essencial: 1, direcao: 4, transformacao: 8 };
type SessionProfile = { plan?: string | null; plan_tier?: string | null } | null;
const ERROR_MESSAGES: Record<string, string> = {
  access_not_available: "Seu plano não permite agendar uma sessão agora.",
  future_time_required: "Escolha um horário que ainda não passou.",
  invalid_time_interval: "Escolha um horário em intervalos de 15 minutos.",
  session_time_conflict: "Esse horário fica muito perto de outra sessão já agendada.",
  monthly_limit_reached: "Você já usou todas as sessões disponíveis nesse mês.",
  session_not_available: "Essa sessão não está mais disponível para alteração.",
  session_required: "Essa sessão não está mais disponível. Atualize a tela e tente novamente.",
  session_already_started: "O horário dessa sessão já chegou e ela não pode mais ser alterada.",
  auth_required: "Seu acesso expirou. Entre novamente para continuar.",
  invalid_request: "Não foi possível validar os dados escolhidos. Confira e tente novamente.",
  session_update_failed: "Não foi possível atualizar sua sessão. Tente novamente.",
};

function brtParts(date = new Date()) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => values.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, year: get("year"), month: get("month") };
}

function brtIso(date: string, time: string) {
  return `${date}T${time}:00-03:00`;
}

function sessionLimit(profile: SessionProfile) {
  const tier = String(profile?.plan_tier || "").toLowerCase();
  if (tier === "base") return 0;
  if (tier === "lite" || tier === "taster") return 1;
  return PLAN_SESSION_LIMITS[String(profile?.plan || "").toLowerCase()] || 0;
}

type UpcomingSession = { id: string; scheduled_at: string | null; focus_topic: string | null; status: string };

export function SessoesTab({ userId, profile, onChangePlan }: { userId: string; profile: SessionProfile; onChangePlan: (currentLimit: number) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = brtParts().date;
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<UpcomingSession | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["portal-sessions-history", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal.from("sessions")
        .select("id, scheduled_at, ended_at, status, focus_topic, theme_label, session_summary, reframe_text, closure_type, closure_text")
        .eq("user_id", userId).eq("status", "completed").order("ended_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data || []).filter((session) => Boolean(session.scheduled_at));
    }, enabled: !!userId,
  });

  const { data: upcomingSessions = [] } = useQuery({
    queryKey: ["portal-sessions-upcoming", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal.from("sessions")
        .select("id, scheduled_at, focus_topic, status").eq("user_id", userId)
        .in("status", ["scheduled", "in_progress"]).order("scheduled_at", { ascending: true }).limit(12);
      if (error) throw error;
      return data || [];
    }, enabled: !!userId,
  });

  const nowBrt = brtParts();
  const monthStart = `${nowBrt.year}-${nowBrt.month}-01T00:00:00-03:00`;
  const nextMonthDate = new Date(`${monthStart}`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const { data: monthUsed = 0 } = useQuery({
    queryKey: ["portal-sessions-month-used", userId, monthStart],
    queryFn: async () => {
      const { count, error } = await supabasePortal.from("sessions").select("id", { count: "exact", head: true })
        .eq("user_id", userId).in("status", ["scheduled", "in_progress", "completed", "no_show"])
        .gte("scheduled_at", monthStart).lt("scheduled_at", nextMonthDate.toISOString());
      if (error) throw error;
      return count || 0;
    }, enabled: !!userId,
  });

  const { data: ratings } = useQuery({
    queryKey: ["portal-session-ratings", userId],
    queryFn: async () => {
      const { data } = await supabasePortal.from("session_ratings").select("session_id, rating").eq("user_id", userId).limit(100);
      return data || [];
    }, enabled: !!userId,
  });

  const availableTimes = useMemo(() => {
    const result: string[] = [];
    for (let hour = 0; hour <= 23; hour += 1) {
      for (const minute of [0, 15, 30, 45]) {
        const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        if (new Date(brtIso(date, value)).getTime() > Date.now()) result.push(value);
      }
    }
    return result;
  }, [date]);

  const ratingMap = new Map<string, number>((ratings || []).map((rating) => [rating.session_id, rating.rating]));
  const planLimit = sessionLimit(profile);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["portal-sessions-upcoming", userId] }),
      queryClient.invalidateQueries({ queryKey: ["portal-sessions-history", userId] }),
      queryClient.invalidateQueries({ queryKey: ["portal-sessions-month-used", userId] }),
    ]);
  };

  const openScheduler = (session?: UpcomingSession) => {
    const reschedule = Boolean(session);
    setEditing(reschedule);
    setSelectedSession(session || null);
    if (session?.scheduled_at) {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
      const parts = formatter.formatToParts(new Date(session.scheduled_at));
      const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
      setDate(`${get("year")}-${get("month")}-${get("day")}`);
      setTime(`${get("hour")}:${get("minute")}`);
    } else {
      setDate(today);
      setTime("");
    }
    setSchedulerOpen(true);
  };

  const manageSession = async (action: "schedule" | "reschedule" | "cancel") => {
    if (action !== "cancel" && (!date || !time)) return;
    if (action !== "schedule" && !selectedSession?.id) {
      toast({ title: "Sessão indisponível", description: ERROR_MESSAGES.session_required, variant: "destructive" });
      await refresh();
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabasePortal.functions.invoke("manage-portal-session", {
        body: {
          action,
          scheduledAt: action === "cancel" ? null : new Date(brtIso(date, time)).toISOString(),
          sessionId: action === "schedule" ? null : selectedSession?.id,
        },
      });
      const code = data?.error || (error ? "session_update_failed" : null);
      if (code) throw new Error(code);
      setSchedulerOpen(false);
      setCancelOpen(false);
      setSelectedSession(null);
      await refresh();
      toast({
        title: action === "schedule" ? "Sessão agendada" : action === "reschedule" ? "Novo horário confirmado" : "Sessão cancelada",
        description: action === "cancel" ? "Ela não contará no limite do seu plano." : "A AURA vai lembrar você antes do encontro.",
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "session_update_failed";
      toast({ title: "Não foi possível concluir", description: ERROR_MESSAGES[code] || ERROR_MESSAGES.session_update_failed, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <PortalLoadingInline />;

  return (
    <div className="portal-area-page space-y-6">
      {upcomingSessions.length === 0 ? (
        <section className="border-y border-border py-6 text-center animate-fade-in">
          <CalendarDays className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma sessão agendada agora.</p>
          <Button type="button" className="mt-4" onClick={() => openScheduler()} disabled={planLimit === 0}>
            <Calendar /> Agendar sessão
          </Button>
        </section>
      ) : (
        <section className="space-y-3 animate-fade-up">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Próximas sessões</h2>
            <Button type="button" size="sm" onClick={() => openScheduler()}><Plus /> Agendar</Button>
          </div>
          {upcomingSessions.map((session, index) => (
            <article key={session.id} className={index === 0 ? "rounded-lg bg-foreground p-5 text-background shadow-card" : "rounded-lg border border-border bg-card p-4 shadow-sm"}>
              <p className={`text-xs font-bold uppercase ${index === 0 ? "text-accent" : "text-primary"}`}>{index === 0 ? "Próxima sessão" : "Sessão agendada"}</p>
              <p className={`mt-2 font-semibold capitalize leading-snug ${index === 0 ? "text-xl" : "text-base text-foreground"}`}>
                {session.scheduled_at ? new Date(session.scheduled_at).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "Horário indisponível"}
              </p>
              {session.status === "scheduled" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant={index === 0 ? "secondary" : "outline"} size="sm" onClick={() => openScheduler(session)}><Pencil /> Reagendar</Button>
                  <Button type="button" variant="ghost" size="sm" className={index === 0 ? "text-background hover:text-foreground" : "text-muted-foreground"} onClick={() => { setSelectedSession(session); setCancelOpen(true); }}><Trash2 /> Cancelar</Button>
                </div>
              ) : <p className={`mt-3 text-sm ${index === 0 ? "text-background/75" : "text-muted-foreground"}`}>Sua sessão está em andamento.</p>}
            </article>
          ))}
        </section>
      )}

      {planLimit > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{monthUsed} de {planLimit} {planLimit > 1 ? "sessões" : "sessão"} neste mês</span>
            <span>{Math.max(0, planLimit - monthUsed)} {planLimit - monthUsed === 1 ? "disponível" : "disponíveis"}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (monthUsed / planLimit) * 100)}%` }} /></div>
        </div>
      ) : null}

      {planLimit > 0 && monthUsed >= planLimit ? (
        <section className="border-y border-border py-5">
          <p className="text-sm font-semibold text-foreground">Sua agenda deste mês está completa.</p>
          <p className="mt-1 text-sm text-muted-foreground">Você ainda pode organizar sessões dos próximos meses.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => openScheduler()}><CalendarDays /> Agendar em outro mês</Button>
            {planLimit < 8 && <Button type="button" onClick={() => onChangePlan(planLimit)}><ArrowUpRight /> Quero mais sessões</Button>}
          </div>
        </section>
      ) : null}

      {(!sessions || sessions.length === 0) && <EmptyState icon={Calendar} title="Nenhuma sessão concluída ainda" description="Depois do primeiro encontro, seu resumo fica guardado aqui." />}

      {sessions && sessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Encontros anteriores</h2>
          {sessions.map((session, index) => {
            const rating = ratingMap.get(session.id);
            const sessionDate = session.ended_at || session.scheduled_at;
            const closure = session.closure_type ? presentClosure(session.closure_type, session.closure_text) : null;
            return (
              <details key={session.id} className="group rounded-lg border border-border bg-card p-4 shadow-sm animate-fade-up" style={{ animationDelay: `${index * 60}ms` }}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-primary">{sessionDate ? new Date(sessionDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : ""}</p>
                    <p className="mt-1 truncate text-lg font-semibold text-foreground">{session.theme_label || session.focus_topic || "Sessão"}</p>
                    {closure && <span className="mt-2 inline-block rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">{closure.title}</span>}
                  </div>
                  {rating ? <div className="flex shrink-0 items-center gap-1"><Star className="fill-primary text-primary" size={14} /><span className="text-sm font-bold">{rating}</span></div> : null}
                </summary>
                <div className="mt-4 space-y-3 border-t border-border pt-3">
                  {session.session_summary && <div><p className="mb-1 text-xs font-bold uppercase text-primary">Resumo</p><p className="text-sm leading-relaxed">{sanitizePortalText(session.session_summary)}</p></div>}
                  {session.reframe_text && <div><p className="mb-1 text-xs font-bold uppercase text-primary">Nova leitura</p><p className="text-sm leading-relaxed">{sanitizePortalText(session.reframe_text)}</p></div>}
                  {session.closure_text && <div><p className="mb-1 text-xs font-bold uppercase text-primary">Fechamento</p><p className="border-l-2 border-accent pl-3 text-sm italic leading-relaxed">“{sanitizePortalText(session.closure_text)}”</p></div>}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <Dialog open={schedulerOpen} onOpenChange={(open) => !saving && setSchedulerOpen(open)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
          <DialogHeader className="text-left">
            <DialogTitle>{editing ? "Escolher um novo horário" : "Agendar sessão"}</DialogTitle>
            <DialogDescription>Horários de Brasília. Você pode alterar até a hora marcada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block text-sm font-medium">Dia<Input className="mt-1.5" type="date" min={today} value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} /></label>
            <label className="block text-sm font-medium">Horário
              <select className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm" value={time} onChange={(event) => setTime(event.target.value)}>
                <option value="">Selecione</option>
                {availableTimes.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </label>
            {availableTimes.length === 0 && <p className="text-sm text-muted-foreground">Não há mais horários disponíveis neste dia.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSchedulerOpen(false)} disabled={saving}>Voltar</Button>
            <Button type="button" onClick={() => void manageSession(editing ? "reschedule" : "schedule")} disabled={!date || !time || saving}>{saving ? "Confirmando..." : "Confirmar horário"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={(open) => !saving && setCancelOpen(open)}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
          <AlertDialogHeader><AlertDialogTitle>Cancelar esta sessão?</AlertDialogTitle><AlertDialogDescription>Ela deixa de ocupar uma sessão do seu mês e você poderá escolher outro horário depois.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Manter sessão</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void manageSession("cancel"); }} disabled={saving}>{saving ? "Cancelando..." : "Cancelar sessão"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}