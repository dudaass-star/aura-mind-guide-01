import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, Circle, Clock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabasePortal } from "@/integrations/supabase/portal-client";

type JornadasTabProps = {
  userId: string;
  profile: {
    current_journey_id?: string | null;
    current_episode?: number | null;
    journeys_completed?: number | null;
  } | null | undefined;
  onJourneyChanged: () => void;
};

export function JornadasTab({ userId, profile, onJourneyChanged }: JornadasTabProps) {
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const currentJourneyId = profile?.current_journey_id ?? null;
  const currentEpisode = profile?.current_episode ?? 0;

  const { data: journeys = [], isLoading: loadingJourneys } = useQuery({
    queryKey: ["portal-content-journeys"],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("content_journeys")
        .select("id,title,description,topic,total_episodes")
        .eq("is_active", true)
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["portal-journey-history", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_journey_history")
        .select("journey_id,completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(userId),
  });

  const { data: episodes = [], isLoading: loadingEpisodes } = useQuery({
    queryKey: ["portal-journey-episodes", currentJourneyId],
    queryFn: async () => {
      if (!currentJourneyId) return [];
      const { data, error } = await supabasePortal
        .from("journey_episodes")
        .select("id,episode_number,title,stage_title")
        .eq("journey_id", currentJourneyId)
        .order("episode_number");
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(currentJourneyId),
  });

  const currentJourney = journeys.find((journey) => journey.id === currentJourneyId) ?? null;
  const completedIds = useMemo(() => new Set(history.map((item) => item.journey_id)), [history]);
  const completedJourneys = history
    .map((item) => ({ ...item, journey: journeys.find((journey) => journey.id === item.journey_id) }))
    .filter((item) => item.journey);
  const availableJourneys = journeys.filter((journey) => journey.id !== currentJourneyId && !completedIds.has(journey.id));
  const releasedEpisodes = episodes.filter((episode) => episode.episode_number <= currentEpisode);
  const progress = currentJourney ? Math.min(100, Math.round((currentEpisode / currentJourney.total_episodes) * 100)) : 0;

  const chooseJourney = useMutation({
    mutationFn: async (journeyId: string) => {
      setSelectedJourneyId(journeyId);
      const { data, error } = await supabasePortal.functions.invoke("choose-next-journey", {
        body: { journey_id: journeyId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível começar esta jornada");
    },
    onSuccess: () => onJourneyChanged(),
    onSettled: () => setSelectedJourneyId(null),
  });

  if (loadingJourneys || loadingHistory || loadingEpisodes) {
    return <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="portal-area-page space-y-7">
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        {currentJourney ? (
          <>
            <div className="flex items-start gap-4">
              <span className="portal-area-content flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Em andamento</p>
                <h2 className="mt-1 font-display text-xl font-semibold leading-tight text-foreground">{currentJourney.title}</h2>
                {currentJourney.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{currentJourney.description}</p>}
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>{currentEpisode} de {currentJourney.total_episodes} episódios</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-secondary" />
            </div>
          </>
        ) : (
          <div className="text-center">
            <span className="portal-area-content mx-auto flex h-12 w-12 items-center justify-center rounded-xl"><Sparkles className="h-5 w-5" /></span>
            <h2 className="mt-4 font-display text-xl font-semibold text-foreground">Escolha algo para acompanhar você</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Cada jornada reúne conteúdos curtos, liberados aos poucos, para aprofundar um tema no seu ritmo.</p>
          </div>
        )}
      </section>

      {currentJourney && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Seus conteúdos</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-foreground">Episódios liberados</h2>
            </div>
            <span className="text-xs text-muted-foreground">{releasedEpisodes.length} disponível(is)</span>
          </div>
          {releasedEpisodes.length > 0 ? (
            <div className="space-y-2">
              {[...releasedEpisodes].reverse().map((episode, index) => (
                <Button key={episode.id} variant="ghost" asChild className="h-auto w-full justify-start gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-sm">
                  <a href={`/episodio/${episode.id}?u=${userId}`}>
                    <span className="portal-area-content flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold">{episode.episode_number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-foreground">{episode.stage_title || episode.title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{index === 0 ? "Mais recente" : `Episódio ${episode.episode_number}`}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              <Clock className="h-5 w-5 shrink-0 text-primary" />
              O primeiro episódio será liberado em breve.
            </div>
          )}
        </section>
      )}

      {!currentJourney && availableJourneys.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Biblioteca</p>
          <h2 className="mb-3 mt-1 font-display text-xl font-semibold text-foreground">Jornadas disponíveis</h2>
          <div className="space-y-3">
            {availableJourneys.map((journey) => (
              <div key={journey.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="portal-area-content flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"><BookOpen className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-base font-semibold text-foreground">{journey.title}</h3>
                    {journey.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{journey.description}</p>}
                    <p className="mt-2 text-xs font-semibold text-primary">{journey.total_episodes} episódios</p>
                  </div>
                </div>
                <Button className="mt-4 w-full" disabled={chooseJourney.isPending} onClick={() => chooseJourney.mutate(journey.id)}>
                  {selectedJourneyId === journey.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Começar esta jornada
                </Button>
              </div>
            ))}
          </div>
          {chooseJourney.isError && <p className="mt-3 text-center text-sm text-destructive">{chooseJourney.error.message}</p>}
        </section>
      )}

      {completedJourneys.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Sua biblioteca</p>
          <h2 className="mb-3 mt-1 font-display text-xl font-semibold text-foreground">Jornadas concluídas</h2>
          <div className="space-y-2">
            {completedJourneys.map((item) => (
              <div key={`${item.journey_id}-${item.completed_at}`} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{item.journey?.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Concluída em {new Date(item.completed_at).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!currentJourney && availableJourneys.length === 0 && completedJourneys.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <Circle className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="font-display text-lg font-semibold text-foreground">Novas jornadas estão sendo preparadas</p>
          <p className="mt-1 text-sm">Você verá os próximos conteúdos aqui.</p>
        </div>
      )}
    </div>
  );
}