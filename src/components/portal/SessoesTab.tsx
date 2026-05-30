import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Calendar, Star, MessageCircle } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import { auraWhatsAppLink, presentClosure } from "./whatsapp";

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
        <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-5 space-y-2 animate-fade-up">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold font-['Nunito']">
            Próxima sessão
          </p>
          <p className="font-['Fraunces'] font-semibold text-foreground capitalize">
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
            className="inline-flex items-center gap-1.5 text-sm text-accent font-semibold font-['Nunito']"
          >
            <MessageCircle size={14} /> Reagendar pelo WhatsApp
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-center animate-fade-in">
          <p className="text-sm text-muted-foreground font-['Nunito']">
            Nenhuma sessão agendada agora.
          </p>
          <a
            href={auraWhatsAppLink("Oi Aura, quero agendar uma sessão.")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent font-semibold font-['Nunito'] mt-2"
          >
            <MessageCircle size={14} /> Agendar pelo WhatsApp
          </a>
        </div>
      )}

      {/* Contador do mês */}
      {planLimit ? (
        <div className="text-xs text-muted-foreground font-['Nunito']">
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
                className="rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-up group"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-['Nunito']">
                      {date
                        ? new Date(date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          })
                        : ""}
                    </p>
                    <p className="font-['Fraunces'] font-semibold text-foreground mt-0.5 truncate">
                      {s.theme_label || s.focus_topic || "Sessão"}
                    </p>
                    {closurePres && (
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] uppercase tracking-wider font-semibold font-['Nunito']">
                        {closurePres.title}
                      </span>
                    )}
                  </div>
                  {rating ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Star size={14} className="text-accent fill-accent" />
                      <span className="text-sm font-semibold text-foreground font-['Nunito']">
                        {rating}
                      </span>
                    </div>
                  ) : null}
                </summary>
                <div className="mt-4 space-y-3 pt-3 border-t border-border/40">
                  {s.session_summary && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito'] mb-1">
                        Resumo
                      </p>
                      <p className="text-sm text-foreground/85 font-['Nunito'] leading-relaxed">
                        {s.session_summary}
                      </p>
                    </div>
                  )}
                  {s.reframe_text && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito'] mb-1">
                        Reframe
                      </p>
                      <p className="text-sm text-foreground/85 font-['Nunito'] leading-relaxed">
                        {s.reframe_text}
                      </p>
                    </div>
                  )}
                  {s.closure_text && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito'] mb-1">
                        Fechamento
                      </p>
                      <p className="text-sm text-foreground font-['Fraunces'] italic leading-relaxed">
                        "{s.closure_text}"
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