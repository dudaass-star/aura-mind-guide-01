import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { Waves, Dumbbell, Clock, Heart, Leaf, Bird, RefreshCw, Brain, Sparkles, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { JourneyPageShell } from "@/components/portal/JourneyPageShell";

const topicIcon: Record<string, React.ElementType> = {
  ansiedade: Waves,
  autoconfianca: Dumbbell,
  procrastinacao: Clock,
  relacionamentos: Heart,
  estresse: Leaf,
  luto: Bird,
  medo_mudanca: RefreshCw,
  inteligencia_emocional: Brain,
};

const Episode = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("u");
  const portalToken = searchParams.get("t");

  const [confirmed, setConfirmed] = useState(false);
  const [chosenJourneyId, setChosenJourneyId] = useState<string | null>(null);

  const effectivePortalToken = portalToken || null;

  const { data: episode, isLoading, error } = useQuery({
    queryKey: ["episode", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_episodes")
        .select("*, content_journeys(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const journeyTitle = episode?.content_journeys?.title || "Jornada";
  const totalEpisodes = episode?.content_journeys?.total_episodes || 8;
  const isLastEpisode = episode ? episode.episode_number === totalEpisodes : false;
  const journeyId = episode?.content_journeys?.id;

  const { data: availableJourneys } = useQuery({
    queryKey: ["journeys-available-ep", journeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_journeys")
        .select("id, title, description, topic")
        .eq("is_active", true)
        .neq("id", journeyId!)
        .order("id");
      if (error) throw error;
      return data;
    },
    enabled: isLastEpisode && !!journeyId && !!userId,
  });

  const chooseMutation = useMutation({
    mutationFn: async (chosenId: string) => {
      setChosenJourneyId(chosenId);
      const { data, error } = await supabasePortal.functions.invoke("choose-next-journey", {
        body: { journey_id: chosenId, portal_token: effectivePortalToken },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Erro ao selecionar jornada");
      return data;
    },
    onSuccess: () => setConfirmed(true),
  });

  const backHref = effectivePortalToken
    ? `/meu-espaco?t=${encodeURIComponent(effectivePortalToken)}&tab=jornadas`
    : "/meu-espaco?tab=jornadas";

  if (isLoading) {
    return (
      <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}>
        <div className="portal-app-content mx-auto w-full max-w-2xl flex-1 space-y-5 px-5 py-7">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </JourneyPageShell>
    );
  }

  if (error || !episode) {
    return (
      <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-md text-center">
            <span className="portal-area-content mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl"><Sparkles className="h-6 w-6" /></span>
            <h2 className="mb-2 font-display text-xl font-semibold text-foreground">Episódio não encontrado</h2>
            <p className="font-body text-muted-foreground">Este conteúdo não está disponível neste link.</p>
            <Button asChild variant="outline" className="mt-5"><a href={backHref}>Voltar para Jornadas</a></Button>
          </div>
        </div>
      </JourneyPageShell>
    );
  }

  const stageTitle = episode.stage_title || episode.title;
  const essayContent = episode.essay_content || episode.content_prompt || "";
  const paragraphs = essayContent.split(/\n\n+/).filter((p: string) => p.trim());
  const topic = episode.content_journeys?.topic || "";

  return (
    <>
      <Helmet>
        <title>{`EP ${episode.episode_number} — ${stageTitle} | Aura`}</title>
        <meta name="description" content={`${journeyTitle} — Episódio ${episode.episode_number}: ${stageTitle}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}>
        <main className="portal-app-content mx-auto w-full max-w-2xl flex-1 px-5 py-6 pb-12">
          <section className="mb-7 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate font-display text-sm font-semibold text-foreground">{journeyTitle}</p>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{episode.episode_number} de {totalEpisodes}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={episode.episode_number} aria-valuemin={0} aria-valuemax={totalEpisodes}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(episode.episode_number / totalEpisodes) * 100}%` }} />
            </div>
          </section>

          <article className="portal-episode-reading">
          <header className="mb-8">
            <span className="mb-2 inline-block text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Episódio {episode.episode_number}
            </span>
            <h1 className="font-display text-2xl font-semibold leading-tight text-foreground md:text-3xl">
              {stageTitle}
            </h1>
          </header>

          <div className="space-y-5 font-body text-base leading-relaxed text-foreground/90 md:text-lg">
            {paragraphs.map((paragraph: string, i: number) => {
              const parts = paragraph.split(/(\*[^*]+\*)/g);
              return <p key={i}>{parts.map((part, partIndex) => part.startsWith("*") && part.endsWith("*")
                ? <strong key={partIndex} className="font-semibold text-foreground">{part.slice(1, -1)}</strong>
                : part)}</p>;
            })}
          </div>

          {/* Journey completion section */}
          {isLastEpisode && userId && !confirmed && (
            <div className="mt-14 space-y-6 border-t border-border/60 pt-8">
              <div className="text-center space-y-3">
                <span className="portal-area-content mx-auto flex h-14 w-14 items-center justify-center rounded-xl"><CheckCircle2 className="h-6 w-6" /></span>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  Parabéns! Você concluiu a jornada
                </h2>
                <p className="font-display text-xl font-medium text-primary">
                  {journeyTitle}
                </p>
                <p className="mx-auto max-w-md font-body text-base text-muted-foreground">
                  Foram {totalEpisodes} episódios de reflexão e crescimento.
                  Cada manifesto que você leu plantou uma semente.
                </p>
              </div>

              <div>
                <h3 className="mb-4 text-center font-display text-lg font-semibold text-foreground">
                  Toque na sua próxima jornada
                </h3>

                <div className="space-y-3">
                  {availableJourneys?.map((journey) => {
                    const Icon = topicIcon[journey.topic] || Sparkles;
                    const isSelecting = chooseMutation.isPending && chosenJourneyId === journey.id;
                    return (
                      <Button
                        key={journey.id}
                        variant="ghost"
                        onClick={() => chooseMutation.mutate(journey.id)}
                        disabled={chooseMutation.isPending}
                        className={`h-auto w-full justify-start rounded-xl border p-4 text-left transition-colors ${
                          isSelecting
                            ? "border-primary/40 bg-primary/10 opacity-70"
                            : "border-border bg-card hover:border-primary/35 hover:bg-card"
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="portal-area-content mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                            <Icon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-base font-semibold text-foreground">
                              {journey.title}
                            </p>
                            {journey.description && (
                              <p className="mt-1 line-clamp-2 font-body text-sm text-muted-foreground">
                                {journey.description}
                              </p>
                            )}
                          </div>
                          {isSelecting && (
                            <span className="text-sm text-primary">Salvando...</span>
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>

                {chooseMutation.isError && (
                  <p className="text-destructive text-sm text-center mt-3 font-['Nunito']">
                    {chooseMutation.error?.message || "Erro ao selecionar. Tente novamente."}
                  </p>
                )}

                 <p className="mt-6 text-center text-xs text-muted-foreground">
                  Se não escolher, a próxima jornada será selecionada automaticamente em 48h.
                </p>
              </div>
            </div>
          )}

          {/* Success state after choosing */}
          {isLastEpisode && confirmed && (
            <div className="mt-14 space-y-4 border-t border-border/60 pt-8 text-center">
              <span className="portal-area-content mx-auto flex h-14 w-14 items-center justify-center rounded-xl"><Sparkles className="h-6 w-6" /></span>
              <h2 className="font-display text-2xl font-semibold text-foreground">Pronto!</h2>
              <p className="text-lg text-foreground/80">
                Sua próxima jornada será <strong>{availableJourneys?.find(j => j.id === chosenJourneyId)?.title || "a escolhida"}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                O primeiro episódio aparecerá em breve nas suas Jornadas.
              </p>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-14 space-y-2 border-t border-border/60 pt-7 text-center">
            <Heart className="mx-auto h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">Conteúdo exclusivo da AURA</p>
          </footer>
          </article>
        </main>
      </JourneyPageShell>
    </>
  );
};

export default Episode;
