import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { Waves, Dumbbell, Clock, Heart, Leaf, Bird, RefreshCw, Brain, Sparkles, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/choose-next-journey`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, journey_id: chosenId }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao selecionar jornada");
      }
      return response.json();
    },
    onSuccess: () => setConfirmed(true),
  });

  const hasBackLink = portalToken || userId;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-card border-b border-border/50">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <Skeleton className="h-14 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="bg-accent/8 border-b border-border/30">
          <div className="max-w-2xl mx-auto px-5 py-3 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </div>
        <div className="max-w-2xl mx-auto w-full px-5 py-8 space-y-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    );
  }

  if (error || !episode) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="py-4 px-6 flex justify-center border-b border-border/50">
          <img src={logoOlaAura} alt="Olá AURA" className="h-16 w-auto" />
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <Sparkles size={40} className="text-accent mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-foreground mb-2 font-['Fraunces']">Episódio não encontrado</h1>
            <p className="text-muted-foreground font-['Nunito']">Este link pode ter expirado ou o episódio não existe.</p>
          </div>
        </div>
      </div>
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

      <div className="min-h-screen bg-background flex flex-col">
        {/* Top bar */}
        <div className="bg-card border-b border-border/50">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasBackLink && (
                <button
                  onClick={() => {
                    if (portalToken) {
                      window.location.href = `/meu-espaco?t=${portalToken}&tab=jornadas`;
                    } else {
                      window.history.back();
                    }
                  }}
                  className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors text-sm font-['Nunito']"
                >
                  <ArrowLeft size={16} />
                  <span className="hidden sm:inline">Meu Espaço</span>
                </button>
              )}
              <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
            </div>
            <span className="text-xs uppercase tracking-wider text-accent font-semibold font-['Nunito']">
              Conteúdo exclusivo
            </span>
          </div>
        </div>

        {/* Journey info + progress */}
        <div className="bg-accent/8 border-b border-border/30">
          <div className="max-w-2xl mx-auto px-5 py-3">
            <p className="text-sm font-medium text-foreground font-['Fraunces']">
              {journeyTitle}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(episode.episode_number / totalEpisodes) * 100}%`,
                    background: 'linear-gradient(135deg, hsl(270 35% 70%), hsl(270 40% 80%))',
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground font-['Nunito'] whitespace-nowrap">
                {episode.episode_number}/{totalEpisodes}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <article className="flex-1 max-w-2xl mx-auto w-full px-5 py-8">
          <header className="mb-8">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-accent mb-2 font-['Nunito']">
              Episódio {episode.episode_number}
            </span>
            <h1 className="font-['Fraunces'] text-2xl md:text-3xl font-semibold text-foreground leading-tight">
              {stageTitle}
            </h1>
          </header>

          <div className="space-y-5 text-foreground/90 leading-relaxed text-base md:text-lg font-['Nunito']">
            {paragraphs.map((paragraph: string, i: number) => {
              const formatted = paragraph.replace(
                /\*(.*?)\*/g,
                '<strong class="font-semibold text-foreground">$1</strong>'
              );
              return (
                <p
                  key={i}
                  dangerouslySetInnerHTML={{ __html: formatted }}
                />
              );
            })}
          </div>

          {/* Journey completion section */}
          {isLastEpisode && userId && !confirmed && (
            <div className="mt-16 pt-8 border-t border-border/50 space-y-6">
              <div className="text-center space-y-3">
                <Sparkles size={48} className="text-accent mx-auto" />
                <h2 className="font-['Fraunces'] text-2xl font-semibold text-foreground">
                  Parabéns! Você concluiu a jornada
                </h2>
                <p className="text-accent font-['Fraunces'] text-xl font-medium">
                  {journeyTitle}
                </p>
                <p className="text-muted-foreground font-['Nunito'] text-base max-w-md mx-auto">
                  Foram {totalEpisodes} episódios de reflexão e crescimento.
                  Cada manifesto que você leu plantou uma semente.
                </p>
              </div>

              <div>
                <h3 className="font-['Fraunces'] text-lg font-semibold text-foreground mb-4 text-center">
                  Toque na sua próxima jornada
                </h3>

                <div className="space-y-3">
                  {availableJourneys?.map((journey) => {
                    const Icon = topicIcon[journey.topic] || Sparkles;
                    const isSelecting = chooseMutation.isPending && chosenJourneyId === journey.id;
                    return (
                      <button
                        key={journey.id}
                        onClick={() => chooseMutation.mutate(journey.id)}
                        disabled={chooseMutation.isPending}
                        className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-200 ${
                          isSelecting
                            ? "border-accent bg-accent/10 shadow-md opacity-70"
                            : "border-border bg-card hover:border-accent/40 hover:bg-card/80"
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center mt-0.5 shrink-0">
                            <Icon size={16} className="text-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-['Fraunces'] font-semibold text-foreground text-base">
                              {journey.title}
                            </p>
                            {journey.description && (
                              <p className="text-sm text-muted-foreground font-['Nunito'] mt-1 line-clamp-2">
                                {journey.description}
                              </p>
                            )}
                          </div>
                          {isSelecting && (
                            <span className="text-accent text-sm font-['Nunito']">Salvando...</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {chooseMutation.isError && (
                  <p className="text-destructive text-sm text-center mt-3 font-['Nunito']">
                    {chooseMutation.error?.message || "Erro ao selecionar. Tente novamente."}
                  </p>
                )}

                <p className="text-xs text-muted-foreground font-['Nunito'] text-center mt-6">
                  Se não escolher, a próxima jornada será selecionada automaticamente em 48h.
                </p>
              </div>
            </div>
          )}

          {/* Success state after choosing */}
          {isLastEpisode && confirmed && (
            <div className="mt-16 pt-8 border-t border-border/50 text-center space-y-4">
              <Sparkles size={48} className="text-accent mx-auto" />
              <h2 className="font-['Fraunces'] text-2xl font-semibold text-foreground">Pronto!</h2>
              <p className="text-foreground/80 font-['Nunito'] text-lg">
                Sua próxima jornada será <strong>{availableJourneys?.find(j => j.id === chosenJourneyId)?.title || "a escolhida"}</strong>.
              </p>
              <p className="text-muted-foreground font-['Nunito'] text-sm">
                O primeiro episódio chegará em breve no seu WhatsApp.
              </p>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-border/50 text-center space-y-3">
            <Heart size={20} className="text-accent mx-auto" />
            <p className="text-sm text-muted-foreground font-['Nunito']">
              Conteúdo exclusivo da Aura
            </p>
            <a
              href="https://olaaura.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-accent hover:text-accent/80 transition-colors font-['Nunito'] underline underline-offset-2"
            >
              olaaura.com.br
            </a>
          </footer>
        </article>
      </div>
    </>
  );
};

export default Episode;
