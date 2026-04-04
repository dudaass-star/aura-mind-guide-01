import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

type TabId = "jornadas" | "resumos" | "meditacoes" | "capsulas";

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: "jornadas", label: "Jornadas", emoji: "🎯" },
  { id: "resumos", label: "Resumos", emoji: "📊" },
  { id: "meditacoes", label: "Meditações", emoji: "🧘" },
  { id: "capsulas", label: "Cápsulas", emoji: "💜" },
];

const UserPortal = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const initialTab = (searchParams.get("tab") as TabId) || "jornadas";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Resolve token to user_id
  const { data: portalToken, isLoading: tokenLoading, error: tokenError } = useQuery({
    queryKey: ["portal-token", token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_portal_tokens")
        .select("user_id")
        .eq("token", token!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });

  const userId = portalToken?.user_id;

  // Fetch profile
  const { data: profile } = useQuery({
    queryKey: ["portal-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("name, current_journey_id, current_episode, journeys_completed, plan")
        .eq("user_id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (!token) {
    return <PortalError message="Link inválido. Verifique o link que você recebeu." />;
  }

  if (tokenLoading) {
    return <PortalLoading />;
  }

  if (tokenError || !portalToken) {
    return <PortalError message="Token não encontrado. Este link pode ter expirado." />;
  }

  const firstName = profile?.name?.split(" ")[0] || "você";

  return (
    <>
      <Helmet>
        <title>Meu Espaço | Aura</title>
        <meta name="description" content="Seu painel pessoal da Aura" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border/50">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
            <span className="text-xs uppercase tracking-wider text-accent font-semibold font-['Nunito']">
              Meu Espaço
            </span>
          </div>
        </div>

        {/* Greeting */}
        <div className="bg-accent/8 border-b border-border/30">
          <div className="max-w-2xl mx-auto px-5 py-4">
            <p className="text-lg font-medium text-foreground font-['Fraunces']">
              Oi, {firstName}! 💜
            </p>
            <p className="text-sm text-muted-foreground font-['Nunito'] mt-1">
              Aqui está tudo que construímos juntas.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border/30 overflow-x-auto">
          <div className="max-w-2xl mx-auto px-5 flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-['Nunito'] font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6">
          {activeTab === "jornadas" && <JornadasTab userId={userId!} profile={profile} />}
          {activeTab === "resumos" && <ResumosTab userId={userId!} />}
          {activeTab === "meditacoes" && <MeditacoesTab userId={userId!} />}
          {activeTab === "capsulas" && <CapsulasTab userId={userId!} />}
        </div>

        {/* Footer */}
        <footer className="border-t border-border/50 py-6 text-center">
          <p className="text-sm text-muted-foreground font-['Nunito']">
            Conteúdo exclusivo da Aura 💜
          </p>
          <a
            href="https://olaaura.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-accent hover:text-accent/80 transition-colors font-['Nunito'] underline underline-offset-2 mt-1"
          >
            olaaura.com.br
          </a>
        </footer>
      </div>
    </>
  );
};

// ==================== TAB COMPONENTS ====================

function JornadasTab({ userId, profile }: { userId: string; profile: any }) {
  const { data: journeys } = useQuery({
    queryKey: ["portal-journeys", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_journeys")
        .select("id, title, description, topic, total_episodes")
        .eq("is_active", true)
        .order("id");
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const currentJourneyId = profile?.current_journey_id;
  const currentEpisode = profile?.current_episode || 0;

  return (
    <div className="space-y-4">
      <h2 className="font-['Fraunces'] text-xl font-semibold text-foreground">Suas Jornadas</h2>

      {currentJourneyId && (
        <div className="rounded-xl border-2 border-accent/30 bg-accent/5 p-4">
          <p className="text-xs uppercase tracking-wider text-accent font-semibold font-['Nunito'] mb-2">
            Jornada Atual
          </p>
          <p className="font-['Fraunces'] font-semibold text-foreground">
            {journeys?.find((j) => j.id === currentJourneyId)?.title || "Carregando..."}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(currentEpisode / 8) * 100}%`,
                  background: "linear-gradient(135deg, hsl(270 35% 70%), hsl(270 40% 80%))",
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-['Nunito']">
              {currentEpisode}/8
            </span>
          </div>
        </div>
      )}

      {(profile?.journeys_completed || 0) > 0 && (
        <p className="text-sm text-muted-foreground font-['Nunito']">
          ✅ {profile.journeys_completed} jornada{profile.journeys_completed > 1 ? "s" : ""} completada{profile.journeys_completed > 1 ? "s" : ""}
        </p>
      )}

      <div className="space-y-3">
        {journeys?.map((journey) => {
          const isCurrent = journey.id === currentJourneyId;
          return (
            <div
              key={journey.id}
              className={`rounded-xl border p-4 ${
                isCurrent ? "border-accent/30 bg-accent/5" : "border-border bg-card"
              }`}
            >
              <p className="font-['Fraunces'] font-semibold text-foreground">{journey.title}</p>
              {journey.description && (
                <p className="text-sm text-muted-foreground font-['Nunito'] mt-1 line-clamp-2">
                  {journey.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResumosTab({ userId }: { userId: string }) {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["portal-reports", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("*")
        .eq("user_id", userId)
        .order("report_month", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (isLoading) return <p className="text-muted-foreground font-['Nunito']">Carregando...</p>;

  if (!reports || reports.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-4xl">📊</p>
        <p className="text-foreground font-['Fraunces'] text-lg font-semibold">Nenhum resumo ainda</p>
        <p className="text-muted-foreground font-['Nunito'] text-sm">
          Seu primeiro resumo mensal aparecerá aqui em breve!
        </p>
      </div>
    );
  }

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-['Fraunces'] text-xl font-semibold text-foreground">Resumos Mensais</h2>
      {reports.map((report: any) => {
        const reportDate = new Date(report.report_month + "T12:00:00");
        const monthLabel = `${monthNames[reportDate.getMonth()]} ${reportDate.getFullYear()}`;
        const metrics = report.metrics_json || {};

        return (
          <div key={report.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-['Fraunces'] font-semibold text-foreground text-lg">{monthLabel}</h3>
              <span className="text-accent text-lg">📊</span>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-3">
              {metrics.totalMessages != null && (
                <MetricCard emoji="💬" label="Mensagens" value={metrics.totalMessages} />
              )}
              {metrics.insightsCount != null && (
                <MetricCard emoji="🧠" label="Insights" value={metrics.insightsCount} />
              )}
              {metrics.sessionsCount != null && (
                <MetricCard emoji="📅" label="Sessões" value={metrics.sessionsCount} />
              )}
              {metrics.journeysCompleted != null && (
                <MetricCard emoji="✅" label="Jornadas" value={metrics.journeysCompleted} />
              )}
            </div>

            {/* Journey progress */}
            {metrics.journeyTitle && (
              <div className="bg-accent/5 rounded-lg p-3">
                <p className="text-xs text-accent font-semibold font-['Nunito'] mb-1">Jornada</p>
                <p className="text-sm text-foreground font-['Nunito']">{metrics.journeyTitle}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${((metrics.currentEpisode || 0) / 8) * 100}%`,
                        background: "linear-gradient(135deg, hsl(270 35% 70%), hsl(270 40% 80%))",
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-['Nunito']">
                    {metrics.currentEpisode || 0}/8
                  </span>
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {report.analysis_text && (
              <div>
                <p className="text-xs text-accent font-semibold font-['Nunito'] mb-1">🌱 Sua Evolução</p>
                <p className="text-sm text-foreground/90 font-['Nunito'] leading-relaxed">
                  {report.analysis_text}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MeditacoesTab({ userId }: { userId: string }) {
  const { data: history } = useQuery({
    queryKey: ["portal-meditation-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_meditation_history")
        .select("meditation_id, sent_at, meditations(title, category, duration_seconds, description)")
        .eq("user_id", userId)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: audios } = useQuery({
    queryKey: ["portal-meditation-audios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meditation_audios")
        .select("meditation_id, public_url, duration_seconds");
      if (error) throw error;
      return data;
    },
  });

  const audioMap = new Map(audios?.map((a: any) => [a.meditation_id, a.public_url]) || []);

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-4xl">🧘</p>
        <p className="text-foreground font-['Fraunces'] text-lg font-semibold">Nenhuma meditação ainda</p>
        <p className="text-muted-foreground font-['Nunito'] text-sm">
          Peça uma meditação à Aura no WhatsApp e ela aparecerá aqui!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-['Fraunces'] text-xl font-semibold text-foreground">Suas Meditações</h2>
      {history.map((item: any, i: number) => {
        const meditation = item.meditations;
        if (!meditation) return null;
        const audioUrl = audioMap.get(item.meditation_id);
        const sentDate = new Date(item.sent_at);

        return (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div>
              <p className="font-['Fraunces'] font-semibold text-foreground">{meditation.title}</p>
              <p className="text-xs text-muted-foreground font-['Nunito'] mt-0.5">
                {meditation.category} · {Math.round(meditation.duration_seconds / 60)} min ·{" "}
                {sentDate.toLocaleDateString("pt-BR")}
              </p>
            </div>
            {meditation.description && (
              <p className="text-sm text-foreground/80 font-['Nunito']">{meditation.description}</p>
            )}
            {audioUrl && (
              <audio controls className="w-full h-10" preload="none">
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CapsulasTab({ userId }: { userId: string }) {
  const { data: capsules, isLoading } = useQuery({
    queryKey: ["portal-capsules", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_capsules")
        .select("*")
        .eq("user_id", userId)
        .eq("delivered", true)
        .order("delivered_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (isLoading) return <p className="text-muted-foreground font-['Nunito']">Carregando...</p>;

  if (!capsules || capsules.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-4xl">💜</p>
        <p className="text-foreground font-['Fraunces'] text-lg font-semibold">Nenhuma cápsula ainda</p>
        <p className="text-muted-foreground font-['Nunito'] text-sm">
          Grave uma cápsula do tempo com a Aura e ela aparecerá aqui quando chegar a hora!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-['Fraunces'] text-xl font-semibold text-foreground">Cápsulas do Tempo</h2>
      {capsules.map((capsule: any) => {
        const deliveredDate = capsule.delivered_at
          ? new Date(capsule.delivered_at).toLocaleDateString("pt-BR")
          : "";
        const createdDate = new Date(capsule.created_at).toLocaleDateString("pt-BR");

        return (
          <div key={capsule.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-['Fraunces'] font-semibold text-foreground">
                  Cápsula de {createdDate}
                </p>
                <p className="text-xs text-muted-foreground font-['Nunito']">
                  Entregue em {deliveredDate}
                </p>
              </div>
              <span className="text-2xl">💌</span>
            </div>

            {capsule.context_message && (
              <p className="text-sm text-foreground/80 font-['Nunito'] italic">
                "{capsule.context_message}"
              </p>
            )}

            {capsule.audio_url && (
              <audio controls className="w-full h-10" preload="none">
                <source src={capsule.audio_url} type="audio/ogg" />
                <source src={capsule.audio_url} type="audio/mpeg" />
              </audio>
            )}

            {capsule.transcription && (
              <details className="text-sm">
                <summary className="text-accent font-['Nunito'] cursor-pointer font-medium">
                  Ver transcrição
                </summary>
                <p className="mt-2 text-foreground/80 font-['Nunito'] leading-relaxed">
                  {capsule.transcription}
                </p>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==================== SHARED COMPONENTS ====================

function MetricCard({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 text-center">
      <p className="text-lg">{emoji}</p>
      <p className="text-xl font-semibold text-foreground font-['Fraunces']">{value}</p>
      <p className="text-xs text-muted-foreground font-['Nunito']">{label}</p>
    </div>
  );
}

function PortalLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground font-['Nunito']">Carregando...</div>
    </div>
  );
}

function PortalError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="py-4 px-6 flex justify-center border-b border-border/50">
        <img src={logoOlaAura} alt="Olá AURA" className="h-16 w-auto" />
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-4xl mb-4">🔒</p>
          <h1 className="text-xl font-semibold text-foreground mb-2 font-['Fraunces']">
            Acesso não autorizado
          </h1>
          <p className="text-muted-foreground font-['Nunito']">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default UserPortal;
