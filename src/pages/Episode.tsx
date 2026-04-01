import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import logoOlaAura from "@/assets/logo-ola-aura.png";

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
        <div className="animate-pulse text-muted-foreground font-['Nunito']">Carregando...</div>
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
            <p className="text-4xl mb-4">🌿</p>
            <h1 className="text-xl font-semibold text-foreground mb-2 font-['Fraunces']">Episódio não encontrado</h1>
            <p className="text-muted-foreground font-['Nunito']">Este link pode ter expirado ou o episódio não existe.</p>
          </div>
        </div>
      </div>
    );
  }

  const journeyTitle = episode.content_journeys?.title || "Jornada";
  const totalEpisodes = episode.content_journeys?.total_episodes || 8;
  const stageTitle = episode.stage_title || episode.title;
  const essayContent = episode.essay_content || episode.content_prompt || "";

  const paragraphs = essayContent.split(/\n\n+/).filter((p: string) => p.trim());

  return (
    <>
      <Helmet>
        <title>{`EP ${episode.episode_number} — ${stageTitle} | Aura`}</title>
        <meta name="description" content={`${journeyTitle} — Episódio ${episode.episode_number}: ${stageTitle}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Top bar with logo */}
        <div className="bg-card border-b border-border/50">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
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

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-border/50 text-center space-y-3">
            <p className="text-accent text-lg">💜</p>
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
