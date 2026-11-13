import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CalendarDays, ChevronRight, MessageCircle, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { getNightPrayer, requestPrayerPlayback } from "@/lib/prayers";
import { brtDayKey, homeBarFromHero, homeBarWithSaved, selectTodayHero, type SavedItem } from "@/lib/today-hero";
import { setPercursoFocus } from "@/lib/percurso-focus";
import type { TodayDirectionResponse } from "@/lib/today-direction";

type Props = { userId: string; onNavigate: (tab: "sessoes" | "oracoes" | "insights") => void; onResume: (sessionId: string, label?: string) => void; fallback: ReactNode };

// Hora do encontro em Brasília: "hoje às 19h" / "hoje às 19h30".
function timeBrt(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

// Mesma consulta e mesma regra da aba Hoje; renderiza nada quando o estado não pede ação.
export function HomeMomentBar({ userId, onNavigate, onResume, fallback }: Props) {
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

  if (!data) return <>{fallback}</>;
  let dismissed: string | null = null;
  try { dismissed = localStorage.getItem(`aura-thread-dismissed:${userId}:${brtDayKey(nowMs)}`); } catch { /* sem storage */ }
  const nightPrayer = getNightPrayer(new Date(nowMs));
  const hero = selectTodayHero({
    nowMs,
    nextSession: data.heroSignals?.nextSession ?? null,
    lastSession: data.heroSignals?.lastSession ?? null,
    nightAudioAvailable: Boolean(nightPrayer),
    dismissedThreadId: dismissed,
  });
  const bar = homeBarWithSaved(homeBarFromHero(hero), saved, nowMs);
  if (!bar || (bar.kind === "night" && !nightPrayer)) return <>{fallback}</>;
  const threadQuote = hero.kind === "thread" ? hero.text : null;

  const content: { Icon: typeof CalendarDays; eyebrow: string; text: string; action: string; run: () => void } = bar.kind === "session"
    ? { Icon: CalendarDays, eyebrow: "Seu encontro", text: bar.canEnter || bar.session.status === "in_progress" ? "Seu encontro já está aberto" : `Seu encontro é hoje às ${timeBrt(bar.session.scheduled_at)}`, action: bar.session.status === "in_progress" ? "Continuar encontro" : bar.canEnter ? "Entrar no encontro" : "Preparar encontro", run: () => onNavigate("sessoes") }
    : bar.kind === "night"
      ? { Icon: Moon, eyebrow: "Para desacelerar", text: `Oração da noite · ${Math.max(1, Math.round((nightPrayer!.duration || 0) / 60))} min`, action: "Ouvir agora", run: () => { requestPrayerPlayback(nightPrayer!.id); onNavigate("oracoes"); } }
      : bar.kind === "saved"
        ? { Icon: Bookmark, eyebrow: "Guardado por você", text: "O que você levou do encontro", action: "Rever", run: () => { setPercursoFocus(bar.itemId); onNavigate("insights"); } }
      : { Icon: MessageCircle, eyebrow: "Da nossa última conversa", text: threadQuote || "Um assunto ficou em aberto", action: "Retomar com a AURA", run: () => onResume((bar as { sessionId: string }).sessionId, threadQuote || undefined) };

  // Card principal da tela inicial: assume o momento; a conversa aberta continua um toque abaixo.
  return (
    <div className="space-y-2">
      <button type="button" onClick={content.run} data-home-moment={bar.kind}
        className="portal-moment-card group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-transform active:scale-[0.99]">
        <span className="portal-moment-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <content.Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="portal-moment-eyebrow block text-[11px] font-semibold uppercase tracking-wider">{content.eyebrow}</span>
          <span className={`portal-moment-title mt-0.5 block text-[15px] font-bold leading-snug ${threadQuote && bar.kind === "thread" ? "line-clamp-2" : ""}`}>{content.text}</span>
          <span className="portal-moment-action mt-1 inline-flex items-center gap-1 text-sm font-semibold">{content.action}<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
        </span>
      </button>
      {fallback}
    </div>
  );
}
