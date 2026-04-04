import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import {
  Target,
  BarChart3,
  Headphones,
  Heart,
  Lock,
  CheckCircle2,
  Clock,
  MessageCircle,
  Brain,
  Calendar,
  Play,
  Mail,
  TrendingUp,
  Sparkles,
} from "lucide-react";

type TabId = "jornadas" | "resumos" | "meditacoes" | "capsulas";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "jornadas", label: "Jornadas", icon: Target },
  { id: "resumos", label: "Resumos", icon: BarChart3 },
  { id: "meditacoes", label: "Meditações", icon: Headphones },
  { id: "capsulas", label: "Cápsulas", icon: Heart },
];

const UserPortal = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const initialTab = (searchParams.get("tab") as TabId) || "jornadas";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

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

  if (!token) return <PortalError message="Link inválido. Verifique o link que você recebeu." />;
  if (tokenLoading) return <PortalLoading />;
  if (tokenError || !portalToken) return <PortalError message="Token não encontrado. Este link pode ter expirado." />;

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
        <div className="bg-card border-b border-border/40 shadow-sm">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-12 w-auto" />
            <span className="text-xs uppercase tracking-widest text-accent font-semibold font-['Nunito']">
              Meu Espaço
            </span>
          </div>
        </div>

        {/* Greeting */}
        <div className="border-b border-border/20">
          <div className="max-w-2xl mx-auto px-5 py-5">
            <p className="text-xl font-medium text-foreground font-['Fraunces']">
              Olá, {firstName}
            </p>
            <p className="text-sm text-muted-foreground font-['Nunito'] mt-1">
              Aqui está tudo que construímos juntas.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border/30 bg-card/50">
          <div className="max-w-2xl mx-auto px-5 flex gap-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-['Nunito'] font-medium whitespace-nowrap border-b-2 transition-all ${
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6">
          {activeTab === "jornadas" && <JornadasTab userId={userId!} profile={profile} />}
          {activeTab === "resumos" && <ResumosTab userId={userId!} />}
          {activeTab === "meditacoes" && <MeditacoesTab />}
          {activeTab === "capsulas" && <CapsulasTab userId={userId!} />}
        </div>

        {/* Footer */}
        <footer className="border-t border-border/40 py-6 text-center">
          <p className="text-sm text-muted-foreground font-['Nunito']">
            Conteúdo exclusivo da Aura
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
  const currentJourneyId = profile?.current_journey_id;
  const currentEpisode = profile?.current_episode || 0;
  const [expandedJourney, setExpandedJourney] = useState<string | null>(currentJourneyId || null);

  const { data: journeyHistory } = useQuery({
    queryKey: ["portal-journey-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_journey_history")
        .select("journey_id, completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: allJourneys } = useQuery({
    queryKey: ["portal-all-journeys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_journeys")
        .select("id, title, description, topic, total_episodes")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: allEpisodes } = useQuery({
    queryKey: ["portal-all-episodes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_episodes")
        .select("id, episode_number, title, stage_title, journey_id")
        .order("episode_number");
      if (error) throw error;
      return data;
    },
  });

  const completedJourneyIds = new Set((journeyHistory || []).map((h: any) => h.journey_id));

  const episodesByJourney = (allEpisodes || []).reduce((acc: Record<string, any[]>, ep: any) => {
    if (!acc[ep.journey_id]) acc[ep.journey_id] = [];
    acc[ep.journey_id].push(ep);
    return acc;
  }, {});

  const visibleJourneys = (allJourneys || []).filter(
    (j: any) => j.id === currentJourneyId || completedJourneyIds.has(j.id)
  );

  if (visibleJourneys.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="Nenhuma jornada disponível"
        description="Sua jornada será iniciada em breve. Continue conversando com a Aura!"
      />
    );
  }

  const sortedJourneys = visibleJourneys.sort((a: any, b: any) => {
    if (a.id === currentJourneyId) return -1;
    if (b.id === currentJourneyId) return 1;
    return 0;
  });

  return (
    <div className="space-y-5">
      <SectionHeader icon={Target} title="Suas Jornadas" />

      {(profile?.journeys_completed || 0) > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-['Nunito']">
          <CheckCircle2 size={16} className="text-accent" />
          <span>
            {profile.journeys_completed} jornada{profile.journeys_completed > 1 ? "s" : ""} completada{profile.journeys_completed > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {sortedJourneys.map((journey: any) => {
        const isCurrent = journey.id === currentJourneyId;
        const isCompleted = completedJourneyIds.has(journey.id);
        const isExpanded = expandedJourney === journey.id;
        const episodes = episodesByJourney[journey.id] || [];
        const totalEpisodes = journey.total_episodes || 8;
        const completedEps = isCurrent ? currentEpisode : totalEpisodes;
        const progressPercent = (completedEps / totalEpisodes) * 100;

        return (
          <div key={journey.id} className="space-y-2">
            <div
              className={`rounded-2xl border p-5 cursor-pointer transition-all ${
                isCurrent
                  ? "border-accent/20 bg-gradient-to-br from-accent/5 to-transparent"
                  : "border-border bg-card hover:shadow-sm"
              }`}
              onClick={() => setExpandedJourney(isExpanded ? null : journey.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-xs uppercase tracking-wider font-semibold font-['Nunito'] ${isCurrent ? "text-accent" : "text-muted-foreground"}`}>
                    {isCurrent ? "Jornada Atual" : "Jornada Completada"}
                  </p>
                  <p className="font-['Fraunces'] font-semibold text-foreground text-lg mt-1">
                    {journey.title}
                  </p>
                </div>
                <div className={`rounded-full p-2 ${isCurrent ? "bg-accent/10" : "bg-muted"}`}>
                  {isCurrent ? <Target size={20} className="text-accent" /> : <CheckCircle2 size={20} className="text-accent" />}
                </div>
              </div>
              {journey.description && (
                <p className="text-sm text-muted-foreground font-['Nunito'] mb-3">
                  {journey.description}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-['Nunito'] font-medium">
                  {completedEps}/{totalEpisodes}
                </span>
              </div>
            </div>

            {isExpanded && episodes.length > 0 && (
              <div className="space-y-2 pl-2">
                <p className="text-sm font-semibold text-foreground font-['Nunito']">Episódios</p>
                {episodes.map((ep: any) => {
                  const isUnlocked = isCompleted || (isCurrent && ep.episode_number <= currentEpisode);
                  return (
                    <div
                      key={ep.id}
                      className={`rounded-xl border p-4 flex items-center gap-3 transition-all ${
                        isUnlocked
                          ? "border-border bg-card hover:shadow-sm cursor-pointer"
                          : "border-border/50 bg-muted/30 opacity-60"
                      }`}
                      onClick={() => {
                        if (isUnlocked) {
                          window.open(`/episodio/${ep.id}?u=${userId}`, "_blank");
                        }
                      }}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isUnlocked ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isUnlocked ? <CheckCircle2 size={16} /> : <Lock size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground font-['Nunito'] truncate">
                          {ep.episode_number}. {ep.title}
                        </p>
                        {ep.stage_title && (
                          <p className="text-xs text-muted-foreground font-['Nunito']">
                            {ep.stage_title}
                          </p>
                        )}
                      </div>
                      {isUnlocked && <Play size={14} className="text-accent shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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

  if (isLoading) return <PortalLoadingInline />;

  if (!reports || reports.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nenhum resumo ainda"
        description="Seu primeiro resumo mensal aparecerá aqui em breve!"
      />
    );
  }

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  return (
    <div className="space-y-5">
      <SectionHeader icon={BarChart3} title="Resumos Mensais" />
      {reports.map((report: any) => {
        const reportDate = new Date(report.report_month + "T12:00:00");
        const monthLabel = `${monthNames[reportDate.getMonth()]} ${reportDate.getFullYear()}`;
        const metrics = report.metrics_json || {};

        return (
          <div key={report.id} className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-['Fraunces'] font-semibold text-foreground text-lg">{monthLabel}</h3>
              <Calendar size={18} className="text-accent" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {metrics.totalMessages != null && (
                <MetricCard icon={MessageCircle} label="Mensagens" value={metrics.totalMessages} />
              )}
              {metrics.insightsCount != null && (
                <MetricCard icon={Brain} label="Insights" value={metrics.insightsCount} />
              )}
              {metrics.sessionsCount != null && (
                <MetricCard icon={Calendar} label="Sessões" value={metrics.sessionsCount} />
              )}
              {metrics.journeysCompleted != null && (
                <MetricCard icon={CheckCircle2} label="Jornadas" value={metrics.journeysCompleted} />
              )}
            </div>

            {metrics.journeyTitle && (
              <div className="bg-accent/5 rounded-xl p-3">
                <p className="text-xs text-accent font-semibold font-['Nunito'] mb-1">Jornada</p>
                <p className="text-sm text-foreground font-['Nunito']">{metrics.journeyTitle}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${((metrics.currentEpisode || 0) / 8) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-['Nunito']">
                    {metrics.currentEpisode || 0}/8
                  </span>
                </div>
              </div>
            )}

            {report.analysis_text && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={14} className="text-accent" />
                  <p className="text-xs text-accent font-semibold font-['Nunito']">Sua Evolução</p>
                </div>
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

function MeditacoesTab() {
  const { data: meditations, isLoading } = useQuery({
    queryKey: ["portal-all-meditations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meditations")
        .select("id, title, category, duration_seconds, description")
        .eq("is_active", true)
        .order("category");
      if (error) throw error;
      return data;
    },
  });

  const { data: audios } = useQuery({
    queryKey: ["portal-meditation-audios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meditation_audios")
        .select("meditation_id, public_url");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <PortalLoadingInline />;

  const audioMap = new Map(audios?.map((a: any) => [a.meditation_id, a.public_url]) || []);

  // Only show meditations that have audio
  const withAudio = meditations?.filter((m: any) => audioMap.has(m.id)) || [];

  if (withAudio.length === 0) {
    return (
      <EmptyState
        icon={Headphones}
        title="Nenhuma meditação disponível"
        description="As meditações estarão disponíveis em breve!"
      />
    );
  }

  // Group by category
  const grouped = withAudio.reduce((acc: Record<string, any[]>, m: any) => {
    const cat = m.category || "Geral";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    ansiedade: "Ansiedade",
    sono: "Sono",
    foco: "Foco",
    estresse: "Estresse",
    autocompaixao: "Autocompaixão",
    geral: "Geral",
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Headphones} title="Meditações" />
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-3">
          <p className="text-sm font-semibold text-foreground font-['Nunito'] capitalize">
            {categoryLabels[category.toLowerCase()] || category}
          </p>
          {(items as any[]).map((meditation: any) => {
            const audioUrl = audioMap.get(meditation.id);
            return (
              <div
                key={meditation.id}
                className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="bg-accent/10 rounded-full p-2 mt-0.5 shrink-0">
                    <Headphones size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-['Fraunces'] font-semibold text-foreground">{meditation.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock size={12} className="text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-['Nunito']">
                        {Math.round(meditation.duration_seconds / 60)} min
                      </p>
                    </div>
                  </div>
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
      ))}
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

  if (isLoading) return <PortalLoadingInline />;

  if (!capsules || capsules.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Nenhuma cápsula ainda"
        description="Grave uma cápsula do tempo com a Aura e ela aparecerá aqui quando chegar a hora!"
      />
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader icon={Heart} title="Cápsulas do Tempo" />
      {capsules.map((capsule: any) => {
        const deliveredDate = capsule.delivered_at
          ? new Date(capsule.delivered_at).toLocaleDateString("pt-BR")
          : "";
        const createdDate = new Date(capsule.created_at).toLocaleDateString("pt-BR");

        return (
          <div key={capsule.id} className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-['Fraunces'] font-semibold text-foreground">
                  Cápsula de {createdDate}
                </p>
                <p className="text-xs text-muted-foreground font-['Nunito']">
                  Entregue em {deliveredDate}
                </p>
              </div>
              <div className="bg-accent/10 rounded-full p-2">
                <Mail size={18} className="text-accent" />
              </div>
            </div>

            {capsule.context_message && (
              <p className="text-sm text-foreground/80 font-['Nunito'] italic border-l-2 border-accent/30 pl-3">
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

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={20} className="text-accent" />
      <h2 className="font-['Fraunces'] text-xl font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-xl p-3 text-center">
      <Icon size={18} className="text-accent mx-auto mb-1" />
      <p className="text-xl font-semibold text-foreground font-['Fraunces']">{value}</p>
      <p className="text-xs text-muted-foreground font-['Nunito']">{label}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="text-center py-16 space-y-4">
      <div className="bg-accent/10 rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center">
        <Icon size={28} className="text-accent" />
      </div>
      <p className="text-foreground font-['Fraunces'] text-lg font-semibold">{title}</p>
      <p className="text-muted-foreground font-['Nunito'] text-sm max-w-xs mx-auto">
        {description}
      </p>
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

function PortalLoadingInline() {
  return <p className="text-muted-foreground font-['Nunito'] animate-pulse py-8 text-center">Carregando...</p>;
}

function PortalError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="py-4 px-6 flex justify-center border-b border-border/50">
        <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="bg-muted rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <Lock size={28} className="text-muted-foreground" />
          </div>
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
