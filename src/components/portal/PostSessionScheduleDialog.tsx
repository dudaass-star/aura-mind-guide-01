import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSlotPills } from "@/components/portal/TimeSlotPills";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import type { Json } from "@/integrations/supabase/types";
import { planSessionLimit, suggestNextSession } from "@/lib/next-session";

// Logo após avaliar o encontro: propõe o próximo no ritmo do plano, confirmável com 1 toque.
const TZ = "America/Sao_Paulo";
const brtDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const brtTime = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const label = (d: Date) => {
  const s = d.toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} às ${brtTime(d)}`;
};
const ERRORS: Record<string, string> = {
  session_time_conflict: "Esse horário fica perto de outro encontro. Escolha outro.",
  monthly_limit_reached: "Os encontros deste mês já estão completos.",
  future_time_required: "Escolha um horário que ainda não passou.",
};

type Props = { userId: string; sessionId: string | null; onClose: () => void };

export function PostSessionScheduleDialog({ userId, sessionId, onClose }: Props) {
  const [suggestion, setSuggestion] = useState<Date | null>(null);
  const [rhythm, setRhythm] = useState("");
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Date | null>(null);

  const track = (event_type: string, metadata: Record<string, unknown> = {}) => {
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "session", event_type, source: "app", metadata: { ...metadata, origin: "post_session", session_id: sessionId } as Json });
  };

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void (async () => {
      const [{ data: profile }, { data: last }, { data: upcoming }] = await Promise.all([
        supabasePortal.from("profiles").select("status, plan, plan_tier").eq("user_id", userId).maybeSingle(),
        supabasePortal.from("sessions").select("scheduled_at").eq("id", sessionId).maybeSingle(),
        supabasePortal.from("sessions").select("id").eq("user_id", userId).in("status", ["scheduled", "in_progress"]).gte("scheduled_at", new Date().toISOString()).limit(1),
      ]);
      if (cancelled || !profile || !last?.scheduled_at) return;
      const status = String(profile.status || "").toLowerCase();
      const plan = String(profile.plan || "").toLowerCase();
      // Degustação tem fluxo próprio; Orações não tem encontros recorrentes; quem já tem agenda não é incomodada.
      if (status !== "active" || plan === "oracoes" || (upcoming?.length ?? 0) > 0) return;
      if (planSessionLimit(plan, profile.plan_tier) < 2) return;
      const next = suggestNextSession(plan, last.scheduled_at);
      setRhythm(plan === "essencial" || plan === "mensal" ? "daqui a duas semanas" : plan === "transformacao" ? "ainda nesta semana" : "na próxima semana");
      setDate(brtDate(next));
      setSuggestion(next);
      track("post_session_schedule_shown", { suggested_at: next.toISOString(), plan });
    })();
    return () => { cancelled = true; };
  }, [sessionId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = brtDate(new Date());
  const times = useMemo(() => {
    const out: string[] = [];
    for (let h = 6; h <= 23; h++) for (const m of [0, 15, 30, 45]) {
      const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      if (date && new Date(`${date}T${v}:00-03:00`).getTime() > Date.now() + 15 * 60_000) out.push(v);
    }
    return out;
  }, [date]);

  const schedule = async (at: Date, kind: "one_tap" | "custom") => {
    setSaving(true); setError(null);
    const { data, error: fnError } = await supabasePortal.functions.invoke("manage-portal-session", {
      body: { action: "schedule", scheduledAt: at.toISOString(), sessionId: null },
    });
    setSaving(false);
    const code = data?.error || (fnError ? "session_update_failed" : null);
    if (code) { setError(ERRORS[code] || "Não consegui marcar agora. Tente outro horário."); return; }
    track("post_session_scheduled", { kind, scheduled_at: at.toISOString() });
    window.dispatchEvent(new Event("aura:today-changed"));
    setDone(at);
  };

  const close = () => {
    if (!done) track("post_session_schedule_skipped");
    setSuggestion(null);
    onClose();
  };

  if (!suggestion) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl">
        {done ? (
          <div className="py-2 text-center">
            <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
            <DialogTitle className="mt-3 font-display text-xl">Combinado</DialogTitle>
            <DialogDescription className="mt-2 text-base text-foreground">Seu próximo encontro é<br /><strong>{label(done)}</strong>.</DialogDescription>
            <p className="mt-2 text-sm text-muted-foreground">A AURA te avisa antes de começar.</p>
            <Button className="mt-5 w-full" onClick={close}>Fechar</Button>
          </div>
        ) : (
          <>
            <DialogHeader className="text-left">
              <CalendarDays className="mb-2 h-6 w-6 text-primary" />
              <DialogTitle className="font-display text-xl">Para não perder o ritmo do que começamos hoje</DialogTitle>
              <DialogDescription>Que tal já guardar o seu próximo encontro {rhythm}, no mesmo horário?</DialogDescription>
            </DialogHeader>
            {!custom ? (
              <div className="grid gap-3">
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Sugestão</p>
                  <p className="mt-1 text-lg font-semibold leading-snug text-foreground">{label(suggestion)}</p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button size="lg" onClick={() => void schedule(suggestion, "one_tap")} disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}Confirmar esse horário
                </Button>
                <Button variant="outline" onClick={() => { setCustom(true); setTime(""); setError(null); }}>Escolher outro dia ou horário</Button>
                <Button variant="ghost" size="sm" onClick={close}>Agora não, escolho depois</Button>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="post-next-date">Dia</Label>
                  <Input id="post-next-date" type="date" value={date} min={today} onChange={(e) => { setDate(e.target.value); setTime(""); }} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Horário</Label>
                  <TimeSlotPills times={times} value={time} onChange={setTime} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button onClick={() => void schedule(new Date(`${date}T${time}:00-03:00`), "custom")} disabled={saving || !time || !date}>
                  {saving && <Loader2 className="animate-spin" />}Marcar encontro
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCustom(false)}>Voltar à sugestão</Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
