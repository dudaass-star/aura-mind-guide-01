import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import {
  Calendar,
  Clock,
  Sparkles,
  Headphones,
  ArrowRight,
  MessageCircle,
  Quote,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PortalLoadingInline } from "./shared";
import { IntimacyLevel } from "./IntimacyLevel";
import { auraWhatsAppLink, presentClosure } from "./whatsapp";

interface HojeTabProps {
  userId: string;
  firstName: string;
  profile: any;
  onNavigateTab: (tab: string) => void;
}

// Saudação pelo horário BRT
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora há pouco";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatScheduledBRT(iso: string): { label: string; countdown: string } {
  const date = new Date(iso);
  const label = date.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const diffMs = date.getTime() - Date.now();
  let countdown = "";
  if (diffMs > 0) {
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours < 1) countdown = "em menos de 1h";
    else if (hours < 24) countdown = `em ${hours}h`;
    else countdown = `em ${Math.floor(hours / 24)} dia(s)`;
  } else {
    countdown = "agora";
  }
  return { label, countdown };
}

export function HojeTab({ userId, firstName, profile, onNavigateTab }: HojeTabProps) {
  // Última sessão concluída
  const { data: lastSession, isLoading: loadingLast } = useQuery({
    queryKey: ["portal-hoje-last-session", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("sessions")
        .select("id, ended_at, focus_topic, session_summary, closure_type, closure_text, theme_label")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Próxima sessão agendada
  const { data: nextSession } = useQuery({
    queryKey: ["portal-hoje-next-session", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("sessions")
        .select("id, scheduled_at, focus_topic")
        .eq("user_id", userId)
        .in("status", ["scheduled", "in_progress"])
        .gte("scheduled_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!userId,
  });

  // Meditação sugerida — escolha simples: 1 aleatória entre as ativas com áudio
  const { data: suggestedMeditation } = useQuery({
    queryKey: ["portal-hoje-suggested-meditation"],
    queryFn: async () => {
      const { data: meds, error } = await supabase
        .from("meditations")
        .select("id, title, category, duration_seconds, description")
        .eq("is_active", true)
        .limit(20);
      if (error || !meds || meds.length === 0) return null;
      const { data: audios } = await supabase
        .from("meditation_audios")
        .select("meditation_id")
        .in("meditation_id", meds.map((m: any) => m.id));
      const withAudio = meds.filter((m: any) =>
        (audios || []).some((a: any) => a.meditation_id === m.id),
      );
      if (withAudio.length === 0) return null;
      // Seleção determinística por dia (mesma sugestão durante o dia)
      const dayKey = Math.floor(Date.now() / 86_400_000);
      return withAudio[dayKey % withAudio.length];
    },
  });

  // Último insight: prefere profiles.pending_insight; fallback monthly_reports.analysis_text
  const lastInsightText: string | null =
    profile?.pending_insight && typeof profile.pending_insight === "string"
      ? profile.pending_insight
      : null;

  const hasAnything =
    !!lastSession || !!nextSession || !!suggestedMeditation || !!lastInsightText;

  if (loadingLast) return <PortalLoadingInline />;

  return (
    <div className="space-y-5">
      {/* Saudação */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-2">
          <h2 className="font-['Fraunces'] text-2xl font-semibold text-foreground">
            {greeting()}, {firstName}
          </h2>
          <Sparkles size={18} className="text-accent animate-pulse-soft" />
        </div>
        {profile?.last_user_message_at && (
          <p className="text-sm text-muted-foreground font-['Nunito'] mt-1">
            Vocês conversaram {relativeTime(profile.last_user_message_at)}.
          </p>
        )}
      </div>

      {/* Empty state global p/ usuária ainda sem nada */}
      {!hasAnything && (
        <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-6 text-center space-y-3 animate-fade-up">
          <div className="bg-accent/10 rounded-full p-3 w-14 h-14 mx-auto flex items-center justify-center">
            <Sparkles size={24} className="text-accent" />
          </div>
          <p className="font-['Fraunces'] font-semibold text-foreground">
            Sua jornada está começando
          </p>
          <p className="text-sm text-muted-foreground font-['Nunito']">
            Quando vocês começarem a conversar, esse espaço ganha vida.
          </p>
          <a
            href={auraWhatsAppLink("Oi Aura, quero começar.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold font-['Nunito'] hover:scale-105 transition-all"
          >
            <MessageCircle size={16} />
            Falar com a Aura
          </a>
        </div>
      )}

      {/* Card: O que ficou da última sessão */}
      {lastSession && (lastSession.closure_text || lastSession.session_summary) && (
        <ClosureCard session={lastSession} />
      )}

      {/* Card: Próxima sessão */}
      {nextSession && <NextSessionCard session={nextSession} />}

      {/* Card: Último insight da Aura */}
      {lastInsightText && (
        <InsightPreviewCard text={lastInsightText} onSeeAll={() => onNavigateTab("insights")} />
      )}

      {/* Card: Meditação sugerida */}
      {suggestedMeditation && (
        <SuggestedMeditationCard
          meditation={suggestedMeditation}
          onOpen={() => onNavigateTab("meditacoes")}
        />
      )}
    </div>
  );
}

// ============ Cards ============
function ClosureCard({ session }: { session: any }) {
  const { title, buttonLabel, prefilledMessage } = presentClosure(
    session.closure_type,
    session.closure_text,
  );
  const body = session.closure_text || session.session_summary || "";
  const ended = session.ended_at
    ? new Date(session.ended_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
      })
    : null;

  return (
    <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-5 space-y-3 shadow-sm animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold font-['Nunito']">
            {title}
          </p>
          {ended && (
            <p className="text-xs text-muted-foreground font-['Nunito'] mt-0.5">
              da sessão de {ended}
            </p>
          )}
        </div>
        <div className="bg-accent/10 rounded-full p-2 shrink-0">
          <Quote size={18} className="text-accent" />
        </div>
      </div>
      <p className="text-foreground font-['Fraunces'] text-base leading-relaxed">
        {body}
      </p>
      <a
        href={auraWhatsAppLink(prefilledMessage)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 font-['Nunito'] transition-colors"
      >
        {buttonLabel}
        <ArrowRight size={14} />
      </a>
    </div>
  );
}

function NextSessionCard({ session }: { session: any }) {
  const { label, countdown } = formatScheduledBRT(session.scheduled_at);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
            Próxima sessão
          </p>
          <p className="font-['Fraunces'] font-semibold text-foreground mt-1 capitalize">
            {label}
          </p>
        </div>
        <div className="bg-accent/10 rounded-full p-2 shrink-0">
          <Calendar size={18} className="text-accent" />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-['Nunito']">
        <Clock size={12} />
        <span>{countdown}</span>
      </div>
      <a
        href={auraWhatsAppLink("Oi Aura, quero reagendar nossa sessão.")}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 font-['Nunito'] transition-colors"
      >
        Reagendar pelo WhatsApp
        <ArrowRight size={14} />
      </a>
    </div>
  );
}

function InsightPreviewCard({
  text,
  onSeeAll,
}: {
  text: string;
  onSeeAll: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
          Último insight da Aura
        </p>
        <div className="bg-primary/10 rounded-full p-2 shrink-0">
          <Sparkles size={18} className="text-primary" />
        </div>
      </div>
      <p className="text-foreground font-['Fraunces'] italic leading-relaxed line-clamp-4">
        "{text}"
      </p>
      <button
        onClick={onSeeAll}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 font-['Nunito'] transition-colors"
      >
        Ver todos os insights
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

function SuggestedMeditationCard({
  meditation,
  onOpen,
}: {
  meditation: any;
  onOpen: () => void;
}) {
  const mins = Math.round((meditation.duration_seconds || 0) / 60);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
            Meditação sugerida
          </p>
          <p className="font-['Fraunces'] font-semibold text-foreground mt-1 truncate">
            {meditation.title}
          </p>
          {mins > 0 && (
            <p className="text-xs text-muted-foreground font-['Nunito'] mt-0.5">
              {mins} min
            </p>
          )}
        </div>
        <div className="bg-accent/10 rounded-full p-2 shrink-0">
          <Headphones size={18} className="text-accent" />
        </div>
      </div>
      {meditation.description && (
        <p className="text-sm text-foreground/80 font-['Nunito'] line-clamp-2">
          {meditation.description}
        </p>
      )}
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 font-['Nunito'] transition-colors"
      >
        Ouvir agora
        <ArrowRight size={14} />
      </button>
    </div>
  );
}