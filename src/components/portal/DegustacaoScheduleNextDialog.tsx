import { useMemo, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import type { Json } from "@/integrations/supabase/types";

// Pós-encontro de cortesia: primeiro marca o 2º encontro, depois mostra os planos.
const brtToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
};

export function DegustacaoScheduleNextDialog({ open, userId, onDone }: {
  open: boolean;
  userId: string;
  onDone: (scheduled: boolean, scheduledAt?: string) => void;
}) {
  const today = brtToday();
  const [date, setDate] = useState(addDays(today, 7));
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const times = useMemo(() => {
    const out: string[] = [];
    for (let h = 6; h <= 23; h++) for (const m of [0, 15, 30, 45]) {
      const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      if (new Date(`${date}T${v}:00-03:00`).getTime() > Date.now() + 15 * 60_000) out.push(v);
    }
    return out;
  }, [date]);

  const track = (event_type: string, metadata: Record<string, unknown> = {}) => {
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "session", event_type, source: "degustacao_post_session", metadata: metadata as Json });
  };

  const confirm = async () => {
    if (!date || !time) { setError("Escolha o dia e o horário."); return; }
    setSaving(true); setError(null);
    const { data, error: fnError } = await supabasePortal.functions.invoke("manage-portal-session", {
      body: { action: "schedule", scheduledAt: new Date(`${date}T${time}:00-03:00`).toISOString(), sessionId: null },
    });
    setSaving(false);
    const code = data?.error || (fnError ? "session_update_failed" : null);
    if (code && code !== "degustacao_next_session_exists") {
      setError(code === "session_time_conflict" ? "Esse horário fica perto de outro encontro. Escolha outro." : "Não consegui marcar agora. Tente outro horário.");
      return;
    }
    track("degustacao_next_scheduled", { date, time });
    onDone(true, new Date(`${date}T${time}:00-03:00`).toISOString());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { track("degustacao_next_skipped"); onDone(false); } }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
        <DialogHeader className="text-left">
          <CalendarDays className="mb-2 h-6 w-6 text-primary" />
          <DialogTitle className="font-display text-xl">Quando vai ser o seu próximo encontro?</DialogTitle>
          <DialogDescription>O que começou hoje continua no próximo. Escolha um dia e horário para seguir com a AURA.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="next-date">Dia</Label>
            <Input id="next-date" type="date" value={date} min={today} max={addDays(today, 30)} onChange={(e) => { setDate(e.target.value); setTime(""); }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="next-time">Horário</Label>
            <select id="next-time" value={time} onChange={(e) => setTime(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-base text-foreground">
              <option value="">Escolha um horário</option>
              {times.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => void confirm()} disabled={saving || !time}>
            {saving && <Loader2 className="animate-spin" />}Confirmar dia e horário
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { track("degustacao_next_skipped"); onDone(false); }}>Escolher depois</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
