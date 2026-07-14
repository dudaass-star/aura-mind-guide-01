import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Calendar, Star, MessageCircle } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import { auraWhatsAppLink, presentClosure } from "./whatsapp";
import { sanitizePortalText } from "./sanitize";

const PLAN_SESSION_LIMITS: Record<string, number> = {
  essencial: 1,
  direcao: 4,
  transformacao: 8,
};

export function SessoesTab({ userId, profile }: { userId: string; profile: any }) {
  // Histórico de sessões concluídas
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["portal-sessions-history", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("sessions")
        .select(
          "id, scheduled_at, ended_at, status, focus_topic, theme_label, session_summary, reframe_text, closure_type, closure_text",
        )
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });

  // Próxima sessão
  const { data: nextSession } = useQuery({
    queryKey: ["portal-sessions-next", userId],
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

  // Ratings das sessões
  const { data: ratings } = useQuery({
    queryKey: ["portal-session-ratings", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("session_ratings")
        .select("session_id, rating")
        .eq("user_id", userId);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });
  const ratingMap = new Map<string, number>(
    (ratings || []).map((r: any) => [r.session_id, r.rating]),
  );

  if (isLoading) return <PortalLoadingInline />;

  const planKey = (profile?.plan || "").toString().toLowerCase();
  const planLimit = PLAN_SESSION_LIMITS[planKey];
  const used = profile?.sessions_used_this_month ?? 0;

  return (
    <div className="space-y-5">
      <SectionHeader icon={Calendar} title="Sessões" />

      {/* Próxima sessão */}
      {nextSession ? (
        <div className="rounded-3xl bg-[#1B2A4E] p-6 space-y-3 animate-fade-up shadow-lg">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#B8A5D9] font-bold font-['Nunito']">
            Próxima sessão
          </p>
          <p className="font-['Fraunces'] text-2xl font-semibold text-[#F5F0E8] capitalize tracking-tight leading-tight">
            {new Date(nextSession.scheduled_at).toLocaleString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            })}
          </p>
          <a
            href={auraWhatsAppLink("Oi Aura, quero reagendar nossa sessão.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[#B8A5D9] hover:text-[#F5F0E8] font-semibold font-['Nunito'] transition-colors"
          >
            <MessageCircle size={14} /> Reagendar pelo WhatsApp
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#87A878]/30 bg-white/40 p-5 text-center animate-fade-in">
          <p className="text-sm text-[#2A2A2A]/70 font-['Nunito']">
            Nenhuma sessão agendada agora.
          </p>
          <a
            href={auraWhatsAppLink("Oi Aura, quero agendar uma sessão.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-[#1B2A4E] font-bold font-['Nunito'] mt-2 hover:text-[#87A878] transition-colors"
          >
            <MessageCircle size={14} /> Agendar pelo WhatsApp
          </a>
        </div>
      )}

      {/* Contador do mês */}
      {planLimit ? (
        <div className="text-xs text-[#2A2A2A]/60 font-['Nunito']">
          {used} de {planLimit} sessão{planLimit > 1 ? "ões" : ""} no plano deste mês
        </div>
      ) : null}

      {/* Lista de sessões */}
      {(!sessions || sessions.length === 0) && (
        <EmptyState
          icon={Calendar}
          title="Nenhuma sessão concluída ainda"
          description="Quando vocês fizerem a primeira sessão completa, ela aparece aqui com o resumo."
        />
      )}

      {sessions && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((s: any, idx: number) => {
            const rating = ratingMap.get(s.id);
            const date = s.ended_at || s.scheduled_at;
            const closurePres = s.closure_type
              ? presentClosure(s.closure_type, s.closure_text)
              : null;
            return (
              <details
                key={s.id}
                className="rounded-2xl border border-[#87A878]/15 bg-white/60 p-5 shadow-sm animate-fade-up group open:bg-white/80"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-[#87A878] font-bold font-['Nunito']">
                      {date
                        ? new Date(date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })
                        : ""}
                    </p>
                    <p className="font-['Fraunces'] text-lg font-semibold text-[#1B2A4E] mt-0.5 truncate tracking-tight">
                      {s.theme_label || s.focus_topic || "Sessão"}
                    </p>
                    {closurePres && (
                      <span className="inline-block mt-2 px-2.5 py-1 rounded-full bg-[#B8A5D9]/25 text-[#1B2A4E] text-[10px] uppercase tracking-wider font-bold font-['Nunito']">
                        {closurePres.title}
                      </span>
                    )}
                  </div>
                  {rating ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Star size={14} className="text-[#87A878] fill-[#87A878]" />
                      <span className="text-sm font-bold text-[#1B2A4E] font-['Nunito']">
                        {rating}
                      </span>
                    </div>
                  ) : null}
                </summary>
                <div className="mt-4 space-y-3 pt-3 border-t border-[#87A878]/15">
                  {s.session_summary && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#87A878] font-bold font-['Nunito'] mb-1">
                        Resumo
                      </p>
                      <p className="text-sm text-[#2A2A2A] font-['Nunito'] leading-relaxed">
                        {sanitizePortalText(s.session_summary)}
                      </p>
                    </div>
                  )}
                  {s.reframe_text && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#87A878] font-bold font-['Nunito'] mb-1">
                        Reframe
                      </p>
                      <p className="text-sm text-[#2A2A2A] font-['Nunito'] leading-relaxed">
                        {sanitizePortalText(s.reframe_text)}
                      </p>
                    </div>
                  )}
                  {s.closure_text && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#87A878] font-bold font-['Nunito'] mb-1">
                        Fechamento
                      </p>
                      <p className="text-[15px] text-[#1B2A4E] font-['Fraunces'] italic leading-relaxed border-l-[3px] border-[#B8A5D9] pl-3">
                        “{sanitizePortalText(s.closure_text)}”
                      </p>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}