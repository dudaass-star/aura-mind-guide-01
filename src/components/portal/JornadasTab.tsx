import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target, CheckCircle2, Lock, Play } from "lucide-react";
import { SectionHeader, EmptyState } from "./shared";

interface JornadasTabProps {
  userId: string;
  profile: any;
  portalToken?: string;
}

export function JornadasTab({ userId, profile, portalToken }: JornadasTabProps) {
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-['Nunito'] animate-fade-in">
          <CheckCircle2 size={16} className="text-accent" />
          <span>
            {profile.journeys_completed} jornada{profile.journeys_completed > 1 ? "s" : ""} completada{profile.journeys_completed > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {sortedJourneys.map((journey: any, idx: number) => {
        const isCurrent = journey.id === currentJourneyId;
        const isCompleted = completedJourneyIds.has(journey.id);
        const isExpanded = expandedJourney === journey.id;
        const episodes = episodesByJourney[journey.id] || [];
        const totalEpisodes = journey.total_episodes || 8;
        const completedEps = isCurrent ? currentEpisode : totalEpisodes;
        const progressPercent = (completedEps / totalEpisodes) * 100;

        return (
          <div key={journey.id} className={`space-y-2 animate-fade-up`} style={{ animationDelay: `${idx * 100}ms` }}>
            <div
              className={`rounded-2xl border p-5 cursor-pointer transition-all hover:shadow-card ${
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
                  <p className="font-['Fraunces'] font-semibold text-foreground text-lg mt-1">{journey.title}</p>
                </div>
                <div className={`rounded-full p-2 ${isCurrent ? "bg-accent/10" : "bg-muted"}`}>
                  {isCurrent ? <Target size={20} className="text-accent" /> : <CheckCircle2 size={20} className="text-accent" />}
                </div>
              </div>
              {journey.description && (
                <p className="text-sm text-muted-foreground font-['Nunito'] mb-3">{journey.description}</p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-700"
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
                {episodes.map((ep: any, epIdx: number) => {
                  const isUnlocked = isCompleted || (isCurrent && ep.episode_number <= currentEpisode);
                  return (
                    <div
                      key={ep.id}
                      className={`rounded-xl border p-4 flex items-center gap-3 transition-all animate-fade-up ${
                        isUnlocked
                          ? "border-border bg-card hover:shadow-sm hover:scale-[1.01] cursor-pointer"
                          : "border-border/50 bg-muted/30 opacity-60"
                      }`}
                      style={{ animationDelay: `${epIdx * 50}ms` }}
                      onClick={() => {
                        if (!isUnlocked) return;
                        const params = new URLSearchParams({ u: userId });
                        if (portalToken) params.set("t", portalToken);
                        window.open(`/episodio/${ep.id}?${params.toString()}`, "_blank");
                      }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUnlocked ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
                        {isUnlocked ? <CheckCircle2 size={16} /> : <Lock size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground font-['Nunito'] truncate">
                          {ep.episode_number}. {ep.title}
                        </p>
                        {ep.stage_title && (
                          <p className="text-xs text-muted-foreground font-['Nunito']">{ep.stage_title}</p>
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
