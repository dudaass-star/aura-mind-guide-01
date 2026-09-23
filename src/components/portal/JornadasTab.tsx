import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Check, ChevronDown, Circle, Clock, LockKeyhole, Loader2, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabasePortal } from "@/integrations/supabase/portal-client";

type JornadasTabProps = {
  userId: string;
  profile: {
    current_journey_id?: string | null;
    current_episode?: number | null;
    journeys_completed?: number | null;
    journey_paused?: boolean | null;
    journey_selected_goal?: string | null;
  } | null | undefined;
  onJourneyChanged: () => void;
};

export function JornadasTab({ userId, profile, onJourneyChanged }: JornadasTabProps) {
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [expandedJourneyId, setExpandedJourneyId] = useState<string | null>(null);
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);
  const currentJourneyId = profile?.current_journey_id ?? null;
  const currentEpisode = profile?.current_episode ?? 0;
  const journeyPaused = profile?.journey_paused ?? false;
  const [selectedGoal, setSelectedGoal] = useState(profile?.journey_selected_goal || "");

  const { data: journeys = [], isLoading: loadingJourneys } = useQuery({
    queryKey: ["portal-content-journeys"],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("content_journeys")
        .select("id,title,description,topic,total_episodes,is_active")
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
        .select("journey_id,completed_at,status")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(userId),
  });

  const completedIds = useMemo(() => Array.from(new Set(history.map((item) => item.journey_id))), [history]);

  const { data: episodeProgress = [] } = useQuery({
    queryKey: ["portal-journey-progress", userId, currentJourneyId],
    queryFn: async () => {
      if (!currentJourneyId) return [];
      const { data, error } = await supabasePortal.from("journey_episode_progress")
        .select("episode_id,status,progress_percent,reflection_text")
        .eq("user_id", userId).eq("journey_id", currentJourneyId);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(userId && currentJourneyId),
  });

  const { data: releasedEpisodes = [], isLoading: loadingEpisodes } = useQuery({
    queryKey: ["portal-journey-episodes", currentJourneyId, currentEpisode],
    queryFn: async () => {
      if (!currentJourneyId) return [];
      const { data, error } = await supabasePortal
        .from("journey_episodes")
        .select("id,episode_number,title,stage_title")
        .eq("journey_id", currentJourneyId)
        .lte("episode_number", currentEpisode)
        .order("episode_number");
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(currentJourneyId),
  });

  const { data: completedEpisodes = [], isLoading: loadingCompletedEpisodes } = useQuery({
    queryKey: ["portal-completed-journey-episodes", completedIds],
    queryFn: async () => {
      if (completedIds.length === 0) return [];
      const { data, error } = await supabasePortal
        .from("journey_episodes")
        .select("id,journey_id,episode_number,title,stage_title")
        .in("journey_id", completedIds)
        .order("episode_number");
      if (error) throw error;
      return data ?? [];
    },
    enabled: completedIds.length > 0,
  });

  const currentJourney = journeys.find((journey) => journey.id === currentJourneyId) ?? null;
  const completedSet = useMemo(() => new Set(completedIds), [completedIds]);
  const completedJourneys = completedIds
    .map((journeyId) => {
      const latestCompletion = history.find((item) => item.journey_id === journeyId);
      return { ...latestCompletion, journey_id: journeyId, journey: journeys.find((journey) => journey.id === journeyId) };
    })
    .filter((item) => item.journey);
  const goalTopics: Record<string, string[]> = {
    Ansiedade: ["ansiedade"], Autoconfiança: ["autoestima"], Relações: ["relacionamentos"],
    Trabalho: ["estresse_trabalho", "Procrastinação"], Mudanças: ["medo_mudanca", "luto"], Emoções: ["inteligencia_emocional"],
  };
  const availableJourneys = journeys
    .filter((journey) => journey.is_active && journey.id !== currentJourneyId && !completedSet.has(journey.id))
    .sort((a, b) => Number(goalTopics[selectedGoal]?.includes(b.topic) || false) - Number(goalTopics[selectedGoal]?.includes(a.topic) || false));
  const progress = currentJourney ? Math.min(100, Math.round((currentEpisode / currentJourney.total_episodes) * 100)) : 0;
  const futureEpisodeNumbers = currentJourney
    ? Array.from({ length: Math.max(0, currentJourney.total_episodes - currentEpisode) }, (_, index) => currentEpisode + index + 1)
    : [];

  const chooseJourney = useMutation({
    mutationFn: async (journeyId: string) => {
      setSelectedJourneyId(journeyId);
      const { data, error } = await supabasePortal.functions.invoke("choose-next-journey", {
        body: { journey_id: journeyId, goal: selectedGoal || null },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível começar esta jornada");
    },
    onSuccess: () => {
      setPendingJourneyId(null);
      onJourneyChanged();
    },
    onSettled: () => setSelectedJourneyId(null),
  });

  const pauseJourney = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabasePortal.functions.invoke("manage-portal-journey", { body: { action: journeyPaused ? "resume" : "pause" } });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Não foi possível atualizar a jornada");
    },
    onSuccess: onJourneyChanged,
  });

  const requestJourneyChange = (journeyId: string) => {
    if (currentJourneyId || completedSet.has(journeyId)) {
      setPendingJourneyId(journeyId);
      return;
    }
    chooseJourney.mutate(journeyId);
  };

  if (loadingJourneys || loadingHistory || loadingEpisodes || loadingCompletedEpisodes) {
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
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{journeyPaused ? "Pausada no seu ponto" : "Em andamento"}</p>
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
            <Button variant="ghost" size="sm" className="mt-3" disabled={pauseJourney.isPending} onClick={() => pauseJourney.mutate()}>
              {journeyPaused ? <Play /> : <Pause />} {journeyPaused ? "Retomar jornada" : "Pausar jornada"}
            </Button>
          </>
        ) : (
          <div className="text-center">
            <span className="portal-area-content mx-auto flex h-12 w-12 items-center justify-center rounded-xl"><Sparkles className="h-5 w-5" /></span>
            <h2 className="mt-4 font-display text-xl font-semibold text-foreground">Escolha algo para acompanhar você</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Cada jornada reúne conteúdos curtos, liberados aos poucos, para aprofundar um tema no seu ritmo.</p>
            <div className="mx-auto mt-5 max-w-sm text-left">
              <p className="mb-2 text-xs font-semibold text-foreground">O que você gostaria de cuidar mais neste momento?</p>
              <div className="flex flex-wrap gap-2">
                {["Ansiedade", "Autoconfiança", "Relações", "Trabalho", "Mudanças", "Emoções"].map((goal) => <Button key={goal} type="button" size="sm" variant={selectedGoal === goal ? "default" : "outline"} onClick={() => setSelectedGoal(goal)}>{goal}</Button>)}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Sua escolha orienta as sugestões abaixo. É um ponto de partida, não uma leitura sobre você.</p>
            </div>
          </div>
        )}
      </section>

      {currentJourney && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Seus conteúdos</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-foreground">Sua sequência</h2>
            </div>
            <span className="text-xs text-muted-foreground">{releasedEpisodes.length} disponível(is)</span>
          </div>
          <div className="space-y-2">
            {[...releasedEpisodes].reverse().map((episode, index) => (
              (() => {
                const state = episodeProgress.find((item) => item.episode_id === episode.id);
                const stateLabel = state?.status === "completed" ? "Concluído" : state?.status === "in_progress" ? "Em leitura" : "Novo";
                return (
                <Button key={episode.id} variant="ghost" asChild className="h-auto w-full justify-start gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-sm">
                  <Link to={`/episodio/${episode.id}?u=${userId}`}>
                    <span className="portal-area-content flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold">{episode.episode_number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-foreground">{episode.stage_title || episode.title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{stateLabel}{state?.status === "in_progress" ? ` · ${state.progress_percent}%` : index === 0 && state?.status !== "completed" ? " · mais recente" : ""}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </Button>
                );
              })()
            ))}
            {futureEpisodeNumbers.map((episodeNumber, index) => (
              <div
                key={`future-${episodeNumber}`}
                className={`flex min-h-16 items-center gap-3 rounded-xl border px-3 py-3 ${index === 0 ? "border-primary/35 bg-primary/5" : "border-border/70 bg-muted/35"}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${index === 0 ? "portal-area-content" : "bg-secondary text-muted-foreground"}`}>
                  {episodeNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{index === 0 ? "Próximo episódio" : `Etapa ${episodeNumber}`}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{index === 0 ? "Será liberado ao longo da sua jornada" : "Ainda por vir"}</span>
                </span>
                {index === 0 ? <Clock className="h-4 w-4 text-primary" /> : <LockKeyhole className="h-4 w-4 text-muted-foreground/70" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {completedJourneys.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Sua biblioteca</p>
          <h2 className="mb-3 mt-1 font-display text-xl font-semibold text-foreground">Já concluídas</h2>
          <div className="space-y-2">
            {completedJourneys.map((item) => {
              const journeyEpisodes = completedEpisodes.filter((episode) => episode.journey_id === item.journey_id);
              const isOpen = expandedJourneyId === item.journey_id;
              return (
                <Collapsible key={item.journey_id} open={isOpen} onOpenChange={(open) => setExpandedJourneyId(open ? item.journey_id : null)}>
                  <div className="rounded-xl border bg-card shadow-sm">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="h-auto min-h-16 w-full justify-start gap-3 rounded-xl px-4 py-3 text-left">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-foreground">{item.journey?.title}</span>
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            {item.completed_at ? `Concluída em ${new Date(item.completed_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Jornada concluída"} · Rever episódios
                          </span>
                        </span>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 border-t px-3 pb-3 pt-3">
                        {journeyEpisodes.map((episode) => (
                          <Button key={episode.id} variant="ghost" asChild className="h-auto w-full justify-start gap-3 rounded-lg px-2 py-2 text-left">
                            <Link to={`/episodio/${episode.id}?u=${userId}`}>
                              <span className="portal-area-content flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold">{episode.episode_number}</span>
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{episode.stage_title || episode.title}</span>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </Link>
                          </Button>
                        ))}
                        {currentJourney ? (
                          <p className="px-2 pb-1 pt-2 text-center text-xs text-muted-foreground">Você poderá refazer esta jornada quando concluir a atual.</p>
                        ) : (
                          <Button variant="outline" className="mt-2 w-full" onClick={() => requestJourneyChange(item.journey_id)}>
                            <RotateCcw className="h-4 w-4" />
                            Refazer jornada
                          </Button>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </section>
      )}

      {availableJourneys.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Para descobrir</p>
          <div className="mb-3 mt-1 flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">Outras jornadas</h2>
            <span className="text-xs text-muted-foreground">{availableJourneys.length} disponíveis</span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Novos episódios chegam ao longo de cada jornada. Veja tudo que ainda pode acompanhar você.</p>
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
                {!currentJourney && (
                  <Button className="mt-4 w-full" disabled={chooseJourney.isPending} onClick={() => requestJourneyChange(journey.id)}>
                    {selectedJourneyId === journey.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Começar esta jornada
                  </Button>
                )}
              </div>
            ))}
          </div>
          {chooseJourney.isError && <p className="mt-3 text-center text-sm text-destructive">{chooseJourney.error.message}</p>}
        </section>
      )}

      {!currentJourney && availableJourneys.length === 0 && completedJourneys.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <Circle className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="font-display text-lg font-semibold text-foreground">Novas jornadas estão sendo preparadas</p>
          <p className="mt-1 text-sm">Você verá os próximos conteúdos aqui.</p>
        </div>
      )}

      <AlertDialog open={Boolean(pendingJourneyId)} onOpenChange={(open) => !open && setPendingJourneyId(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{currentJourney ? "Trocar sua jornada atual?" : "Refazer esta jornada?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {currentJourney
                ? `Você está acompanhando “${currentJourney.title}”. Ao trocar, a nova jornada começará do primeiro episódio.`
                : "Ela começará novamente pelo primeiro episódio. A versão concluída continuará registrada no seu histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar como está</AlertDialogCancel>
            <AlertDialogAction
              disabled={chooseJourney.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingJourneyId) chooseJourney.mutate(pendingJourneyId);
              }}
            >
              {chooseJourney.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {currentJourney ? "Trocar jornada" : "Refazer jornada"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}