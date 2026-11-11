import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CalendarDays, MessageCircle, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { getNightPrayer, requestPrayerPlayback } from "@/lib/prayers";
import { brtDayKey, homeBarFromHero, homeBarWithSaved, selectTodayHero, type SavedItem } from "@/lib/today-hero";
import { setPercursoFocus } from "@/lib/percurso-focus";
import type { TodayDirectionResponse } from "@/lib/today-direction";

type Props = { userId: string; onNavigate: (tab: "sessoes" | "oracoes" | "insights") => void; onResume: (sessionId: string) => void };

// Hora do encontro em Brasília: "hoje às 19h" / "hoje às 19h30".
function timeBrt(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

// Mesma consulta e mesma regra da aba Hoje; renderiza nada quando o estado não pede ação.
export function HomeMomentBar({ userId, onNavigate, onResume }: Props) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
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
  const { data: saved = null } = useQuery({
    queryKey: ["portal-latest-saved", userId],
    queryFn: async () => {
      const { data: row } = await supabasePortal.from("user_milestones").select("id,created_at").eq("user_id", userId).eq("source", "user_saved").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return (row as SavedItem | null) ?? null;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      void queryClient.invalidateQueries({ queryKey: ["portal-today-direction", userId] });
      void queryClient.invalidateQueries({ queryKey: ["portal-latest-saved", userId] });
    };
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["portal-today-direction", userId] }); void queryClient.invalidateQueries({ queryKey: ["portal-latest-saved", userId] }); void queryClient.invalidateQueries({ queryKey: ["portal-live-journey", userId] }); };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("aura:today-changed", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("aura:today-changed", refresh); };
  }, [queryClient, userId]);

  if (!data) return null;
  let dismissed: string | null = null;
  try { dismissed = localStorage.getItem(`aura-thread-dismissed:${userId}:${brtDayKey(nowMs)}`); } catch { /* sem storage */ }
  const nightPrayer = getNightPrayer(new Date(nowMs));
  const bar = homeBarWithSaved(homeBarFromHero(selectTodayHero({
    nowMs,
    nextSession: data.heroSignals?.nextSession ?? null,
    lastSession: data.heroSignals?.lastSession ?? null,
    nightAudioAvailable: Boolean(nightPrayer),
    dismissedThreadId: dismissed,
  })), saved, nowMs);
  if (!bar || (bar.kind === "night" && !nightPrayer)) return null;

  const content = bar.kind === "session"
    ? { Icon: CalendarDays, text: bar.canEnter || bar.session.status === "in_progress" ? "Seu encontro já está aberto" : `Seu encontro é hoje às ${timeBrt(bar.session.scheduled_at)}`, action: bar.session.status === "in_progress" ? "Continuar encontro" : bar.canEnter ? "Entrar no encontro" : "Preparar encontro", run: () => onNavigate("sessoes") }
    : bar.kind === "night"
      ? { Icon: Moon, text: `Oração da noite · ${Math.max(1, Math.round((nightPrayer!.duration || 0) / 60))} min`, action: "Ouvir agora", run: () => { requestPrayerPlayback(nightPrayer!.id); onNavigate("oracoes"); } }
      : bar.kind === "saved"
        ? { Icon: Bookmark, text: "O que você levou do encontro", action: "Rever", run: () => { setPercursoFocus(bar.itemId); onNavigate("insights"); } }
      : { Icon: MessageCircle, text: "Da nossa última conversa", action: "Retomar com a AURA", run: () => onResume((bar as { sessionId: string }).sessionId) };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm" data-home-moment={bar.kind}>
      <content.Icon className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.7} aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{content.text}</p>
      <Button type="button" size="sm" onClick={content.run} className="h-auto min-h-11 shrink-0 whitespace-normal px-4 py-2 text-[13px] font-semibold">{content.action}</Button>
    </div>
  );
}
