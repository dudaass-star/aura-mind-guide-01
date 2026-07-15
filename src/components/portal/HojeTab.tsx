import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import {
  Calendar,
  Headphones,
  ArrowRight,
  MessageCircle,
  PenLine,
} from "lucide-react";
import { PortalLoadingInline } from "./shared";
import { IntimacyLevel } from "./IntimacyLevel";
import { auraWhatsAppLink, presentClosure } from "./whatsapp";
import { PerguntaDoDiaCard } from "./PerguntaDoDiaCard";
import { sanitizePortalText } from "./sanitize";

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

  // Insight curado: snapshot temático mais recente; fallback = resumo mensal.
  // NUNCA usar profiles.pending_insight — é buffer técnico de entrega no WhatsApp.
  const { data: curatedInsight } = useQuery({
    queryKey: ["portal-hoje-curated-insight", userId],
    queryFn: async () => {
      // 1) Snapshot temático mais recente com confiança válida
      const { data: snap } = await supabasePortal
        .from("thematic_snapshots")
        .select("theme, snapshot_change, snapshot_before, evidence_quote, period_end, confidence")
        .eq("user_id", userId)
        .neq("confidence", "insufficient")
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snap) {
        const period = snap.period_end
          ? new Date(snap.period_end).toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
              timeZone: "America/Sao_Paulo",
            })
          : null;
        return {
          title: snap.theme || "Um movimento seu",
          body: snap.snapshot_change || snap.snapshot_before || snap.evidence_quote || "",
          meta: period,
        };
      }
      // 2) Fallback: último resumo mensal
      const { data: report } = await supabasePortal
        .from("monthly_reports")
        .select("analysis_text, created_at")
        .eq("user_id", userId)
        .not("analysis_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (report?.analysis_text) {
        const when = report.created_at
          ? new Date(report.created_at).toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
              timeZone: "America/Sao_Paulo",
            })
          : null;
        return {
          title: when ? `Resumo de ${when}` : "Resumo recente",
          body: report.analysis_text,
          meta: null,
        };
      }
      return null;
    },
    enabled: !!userId,
  });

  const hasAnything =
    !!lastSession || !!nextSession || !!suggestedMeditation || !!curatedInsight;

  // Usuário que nunca conversou com a Aura: portal precisa focar num único CTA.
  const zeroConversa = !profile?.last_user_message_at;

  // Convite pra contribuir na aba Sobre: conta >7d, sem itens user_added ainda.
  const { data: userAddedCount } = useQuery({
    queryKey: ["portal-hoje-user-added-count", userId],
    queryFn: async () => {
      const { count } = await supabasePortal
        .from("user_insights")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("category", "user_added");
      return count ?? 0;
    },
    enabled: !!userId && !zeroConversa,
  });
  const contaCriadaEmMs = profile?.created_at
    ? new Date(profile.created_at).getTime()
    : null;
  const contaMaduraSemUserAdded =
    !zeroConversa &&
    userAddedCount === 0 &&
    !!contaCriadaEmMs &&
    Date.now() - contaCriadaEmMs > 7 * 86_400_000;

  if (loadingLast) return <PortalLoadingInline />;

  return (
    <div className="space-y-6">
      {/* Saudação — Deep Navy Anchor */}
      <header className="space-y-1 animate-fade-in">
        <h1
          className="text-3xl sm:text-4xl text-[#1B2A4E] font-['Fraunces']"
          style={{ fontWeight: 600 }}
        >
          {greeting()}, {firstName}
        </h1>
        <p className="text-[#87A878] font-semibold uppercase tracking-[0.15em] text-[10px] sm:text-xs font-['Nunito']">
          {profile?.last_user_message_at
            ? `Vocês conversaram ${relativeTime(profile.last_user_message_at)}`
            : "Seu refúgio de hoje"}
        </p>
        <IntimacyLevel userId={userId} />
      </header>

      {/* Zero-conversa: card único de primeiro contato, sem ruído. */}
      {zeroConversa && (
        <div className="rounded-2xl bg-white/60 border border-[#87A878]/20 p-6 text-center space-y-3 animate-fade-up">
          <div className="bg-[#87A878]/15 rounded-full p-3 w-14 h-14 mx-auto flex items-center justify-center">
            <MessageCircle size={24} className="text-[#87A878]" />
          </div>
          <p className="font-['Fraunces'] font-semibold text-[#1B2A4E]">
            Fala com a Aura pela primeira vez
          </p>
          <p className="text-sm text-[#2A2A2A]/70 font-['Nunito']">
            Manda a primeira mensagem — depois esse espaço começa a ganhar vida.
          </p>
          <a
            href={auraWhatsAppLink("Oi Aura, quero começar.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#1B2A4E] text-white px-5 py-2.5 text-sm font-bold font-['Nunito'] hover:bg-[#1B2A4E]/90 transition-all"
          >
            <MessageCircle size={16} />
            Abrir WhatsApp
          </a>
        </div>
      )}

      {/* Sessões: Última + Próxima em grid 2 colunas (Última bege, Próxima navy) */}
      {!zeroConversa && (
        <SessionsRow
          lastSession={lastSession}
          nextSession={nextSession}
        />
      )}

      {/* Empty state global (já conversou mas nada foi materializado ainda) */}
      {!zeroConversa && !hasAnything && (
        <div className="rounded-2xl bg-white/60 border border-[#87A878]/20 p-6 text-center space-y-3 animate-fade-up">
          <p className="font-['Fraunces'] font-semibold text-[#1B2A4E]">
            Sua jornada está começando
          </p>
          <p className="text-sm text-[#2A2A2A]/70 font-['Nunito']">
            Quando vocês começarem a conversar, esse espaço ganha vida.
          </p>
          <a
            href={auraWhatsAppLink("Oi Aura, quero começar.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#1B2A4E] text-white px-5 py-2.5 text-sm font-bold font-['Nunito'] hover:bg-[#1B2A4E]/90 transition-all"
          >
            <MessageCircle size={16} />
            Falar com a Aura
          </a>
        </div>
      )}

      {/* Card: Insight curado (snapshot temático ou resumo mensal) — HERO em lavender */}
      {curatedInsight && (
        <InsightPreviewCard
          title={curatedInsight.title}
          meta={curatedInsight.meta}
          text={curatedInsight.body}
          onSeeAll={() => onNavigateTab("insights")}
        />
      )}

      {/* Card: O que ficou da última sessão (bloco de continuidade da conversa) */}
      {lastSession && (lastSession.closure_text || lastSession.session_summary) && (
        <ClosureCard session={lastSession} />
      )}

      {/* Pergunta do dia — sage bg + navy CTA */}
      {!zeroConversa && (
        <PerguntaDoDiaCard lastUserMessageAt={profile?.last_user_message_at} />
      )}

      {/* Card: Meditação sugerida (não mostrar pra zero-conversa) */}
      {!zeroConversa && suggestedMeditation && (
        <SuggestedMeditationCard
          meditation={suggestedMeditation}
          onOpen={() => onNavigateTab("meditacoes")}
        />
      )}

      {/* Convite discreto pra contribuir com o que a Aura sabe */}
      {contaMaduraSemUserAdded && (
        <button
          onClick={() => onNavigateTab("sobre")}
          className="w-full text-left rounded-2xl border-2 border-dashed border-[#87A878]/40 bg-[#87A878]/8 p-4 flex items-center gap-3 hover:bg-[#87A878]/12 hover:border-[#87A878]/60 transition-colors animate-fade-up"
        >
          <div className="shrink-0 rounded-xl bg-[#B8A5D9]/25 p-2">
            <PenLine size={16} className="text-[#1B2A4E]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#1B2A4E] font-['Nunito'] leading-tight">
              Quer me contar algo direto?
            </p>
            <p className="text-xs text-[#2A2A2A]/65 font-['Nunito'] mt-0.5">
              Medos, objetivos, valores — eu levo pras conversas.
            </p>
          </div>
          <ArrowRight size={16} className="text-[#1B2A4E]/60 shrink-0" />
        </button>
      )}
    </div>
  );
}

// ============ Cards ============

function SessionsRow({
  lastSession,
  nextSession,
}: {
  lastSession: any;
  nextSession: any;
}) {
  const lastLabel = lastSession?.ended_at ? relativeTime(lastSession.ended_at) : null;
  const lastTheme =
    lastSession?.theme_label || lastSession?.focus_topic || "Autoconhecimento";
  const REAGENDAR = [7, 14, 30];

  return (
    <div className="grid grid-cols-2 gap-4 animate-fade-up">
      {/* Última sessão — bege claro */}
      <div className="bg-white/60 p-5 rounded-2xl border border-[#87A878]/15">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#87A878] font-bold font-['Nunito'] mb-2">
          Última sessão
        </p>
        {lastSession ? (
          <p className="text-[#2A2A2A] text-sm leading-snug font-['Nunito']">
            {lastLabel ? `${lastLabel} · ` : ""}
            <span className="font-bold text-[#1B2A4E] capitalize">{lastTheme}</span>
          </p>
        ) : (
          <p className="text-[#2A2A2A]/60 text-sm font-['Nunito']">
            Ainda sem sessões concluídas
          </p>
        )}
      </div>

      {/* Próxima sessão — navy com chips 7/14/30d */}
      <div className="bg-[#1B2A4E] p-5 rounded-2xl text-[#F5F0E8] shadow-lg shadow-[#1B2A4E]/20">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#B8A5D9] font-bold font-['Nunito'] mb-2">
          Próxima sessão
        </p>
        {nextSession ? (
          <p className="text-sm mb-3 font-['Nunito'] capitalize">
            {formatScheduledBRT(nextSession.scheduled_at).label}
          </p>
        ) : (
          <p className="text-sm mb-3 font-['Nunito'] text-[#F5F0E8]/70">
            Nenhuma agendada
          </p>
        )}
        <p className="text-[10px] uppercase tracking-widest text-[#B8A5D9]/70 font-['Nunito'] mb-1.5">
          Reagendar em
        </p>
        <div className="flex gap-1">
          {REAGENDAR.map((d) => (
            <a
              key={d}
              href={auraWhatsAppLink(
                `Oi Aura, quero remarcar minha próxima sessão para daqui a ${d} dias.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-[#F5F0E8]/10 hover:bg-[#87A878] rounded text-[10px] font-bold border border-[#F5F0E8]/20 transition-colors font-['Nunito']"
            >
              {d}d
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClosureCard({ session }: { session: any }) {
  const { title, buttonLabel, prefilledMessage } = presentClosure(
    session.closure_type,
    session.closure_text,
  );
  const body = sanitizePortalText(session.closure_text || session.session_summary || "");
  const ended = session.ended_at
    ? new Date(session.ended_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
      })
    : null;

  return (
    <div className="rounded-2xl bg-white/60 border border-[#87A878]/15 p-6 space-y-3 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#87A878] font-bold font-['Nunito']">
            {title}
          </p>
          {ended && (
            <p className="text-xs text-[#2A2A2A]/50 font-['Nunito'] mt-0.5">
              da sessão de {ended}
            </p>
          )}
        </div>
      </div>
      <p className="text-[#1B2A4E] font-['Fraunces'] text-base leading-relaxed italic">
        “{body}”
      </p>
      <a
        href={auraWhatsAppLink(prefilledMessage)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1B2A4E] hover:text-[#87A878] font-['Nunito'] transition-colors"
      >
        {buttonLabel}
        <ArrowRight size={14} />
      </a>
    </div>
  );
}

function InsightPreviewCard({
  title,
  meta,
  text,
  onSeeAll,
}: {
  title?: string;
  meta?: string | null;
  text: string;
  onSeeAll: () => void;
}) {
  const clean = sanitizePortalText(text);
  return (
    <div className="bg-[#B8A5D9]/15 border-2 border-[#B8A5D9] p-6 sm:p-7 rounded-3xl relative overflow-hidden animate-fade-up">
      <div className="absolute -top-6 -right-6 w-32 h-32 bg-[#B8A5D9]/25 rounded-full blur-2xl pointer-events-none" />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#1B2A4E]/60 font-bold font-['Nunito'] mb-3">
          Insight da Aura
        </p>
        <blockquote
          className="text-lg sm:text-xl text-[#1B2A4E] leading-relaxed font-['Fraunces'] italic mb-4"
          style={{ fontWeight: 400 }}
        >
          {clean}
        </blockquote>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            {title && (
              <p className="text-sm font-['Fraunces'] font-semibold text-[#1B2A4E] capitalize">
                {title}
              </p>
            )}
            {meta && (
              <p className="text-[11px] text-[#2A2A2A]/50 font-['Nunito'] capitalize">
                {meta}
              </p>
            )}
          </div>
          <button
            onClick={onSeeAll}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B2A4E] hover:text-[#87A878] font-['Nunito'] uppercase tracking-wider transition-colors"
          >
            Ver percurso
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
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
    <div className="rounded-2xl bg-white/60 border border-[#87A878]/15 p-5 space-y-3 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#87A878] font-bold font-['Nunito']">
            Meditação sugerida
          </p>
          <p className="font-['Fraunces'] font-semibold text-[#1B2A4E] mt-1 truncate">
            {meditation.title}
          </p>
          {mins > 0 && (
            <p className="text-xs text-[#2A2A2A]/50 font-['Nunito'] mt-0.5">
              {mins} min
            </p>
          )}
        </div>
        <div className="bg-[#87A878]/15 rounded-full p-2 shrink-0">
          <Headphones size={18} className="text-[#87A878]" />
        </div>
      </div>
      {meditation.description && (
        <p className="text-sm text-[#2A2A2A]/80 font-['Nunito'] line-clamp-2">
          {meditation.description}
        </p>
      )}
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1B2A4E] hover:text-[#87A878] font-['Nunito'] transition-colors"
      >
        Ouvir agora
        <ArrowRight size={14} />
      </button>
    </div>
  );
}