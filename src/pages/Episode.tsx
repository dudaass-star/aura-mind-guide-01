import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";

const Episode = () => {
  const { id } = useParams<{ id: string }>();

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error || !episode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-4xl mb-4">🌿</p>
          <h1 className="text-xl font-semibold text-foreground mb-2">Episódio não encontrado</h1>
          <p className="text-muted-foreground">Este link pode ter expirado ou o episódio não existe.</p>
        </div>
      </div>
    );
  }

  const journeyTitle = episode.content_journeys?.title || "Jornada";
  const totalEpisodes = episode.content_journeys?.total_episodes || 8;
  const stageTitle = episode.stage_title || episode.title;
  const essayContent = episode.essay_content || episode.content_prompt || "";

  // Split essay into paragraphs
  const paragraphs = essayContent.split(/\n\n+/).filter((p: string) => p.trim());

  return (
    <>
      <Helmet>
        <title>{`EP ${episode.episode_number} — ${stageTitle} | Aura`}</title>
        <meta name="description" content={`${journeyTitle} — Episódio ${episode.episode_number}: ${stageTitle}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header bar */}
        <div className="bg-accent/10 border-b border-border">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <p className="text-xs uppercase tracking-wider text-accent font-medium">
              {journeyTitle}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Episódio {episode.episode_number} de {totalEpisodes}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-6 pt-4">
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${(episode.episode_number / totalEpisodes) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <article className="max-w-2xl mx-auto px-6 py-10">
          <header className="mb-10">
            <h1 className="font-['Fraunces'] text-2xl md:text-3xl font-semibold text-foreground leading-tight">
              {stageTitle}
            </h1>
          </header>

          <div className="space-y-5 text-foreground/90 leading-relaxed text-base md:text-lg font-['Nunito']">
            {paragraphs.map((paragraph: string, i: number) => {
              // Handle bold markdown-style text
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

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-border text-center">
            <p className="text-accent text-lg">💜</p>
            <p className="text-sm text-muted-foreground mt-2">
              Conteúdo exclusivo da Aura
            </p>
          </footer>
        </article>
      </div>
    </>
  );
};

export default Episode;
