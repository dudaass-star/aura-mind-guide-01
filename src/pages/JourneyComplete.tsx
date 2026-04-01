import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const JourneyComplete = () => {
  const { journeyId, userId } = useParams<{ journeyId: string; userId: string }>();
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: completedJourney, isLoading: loadingJourney } = useQuery({
    queryKey: ["journey", journeyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_journeys")
        .select("*")
        .eq("id", journeyId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!journeyId,
  });

  const { data: availableJourneys, isLoading: loadingAll } = useQuery({
    queryKey: ["journeys-available", journeyId],
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
    enabled: !!journeyId,
  });

  const chooseMutation = useMutation({
    mutationFn: async (chosenJourneyId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/choose-next-journey`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, journey_id: chosenJourneyId }),
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

  const topicEmoji: Record<string, string> = {
    ansiedade: "🌊",
    autoconfianca: "💪",
    procrastinacao: "⏳",
    relacionamentos: "💞",
    estresse: "🧘",
    luto: "🕊️",
    medo_mudanca: "🦋",
    inteligencia_emocional: "🧠",
  };

  const isLoading = loadingJourney || loadingAll;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-['Nunito']">Carregando...</div>
      </div>
    );
  }

  if (!completedJourney) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="py-4 px-6 flex justify-center border-b border-border/50">
          <img src={logoOlaAura} alt="Olá AURA" className="h-16 w-auto" />
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md">
            <p className="text-4xl mb-4">🌿</p>
            <h1 className="text-xl font-semibold text-foreground mb-2 font-['Fraunces']">Jornada não encontrada</h1>
            <p className="text-muted-foreground font-['Nunito']">Este link pode ter expirado.</p>
          </div>
        </div>
      </div>
    );
  }

  if (confirmed) {
    const chosen = availableJourneys?.find(j => j.id === selectedJourney);
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-card border-b border-border/50">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md space-y-4">
            <p className="text-5xl">🎯</p>
            <h1 className="font-['Fraunces'] text-2xl font-semibold text-foreground">
              Pronto!
            </h1>
            <p className="text-foreground/80 font-['Nunito'] text-lg">
              Sua próxima jornada será <strong>{chosen?.title || "a escolhida"}</strong>.
            </p>
            <p className="text-muted-foreground font-['Nunito'] text-sm">
              O primeiro episódio chegará em breve no seu WhatsApp. 💜
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Jornada concluída — ${completedJourney.title} | Aura`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Top bar */}
        <div className="bg-card border-b border-border/50">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
            <span className="text-xs uppercase tracking-wider text-accent font-semibold font-['Nunito']">
              Jornada concluída
            </span>
          </div>
        </div>

        {/* Congratulations */}
        <div className="max-w-2xl mx-auto w-full px-5 py-8 text-center space-y-4">
          <p className="text-5xl">🎉</p>
          <h1 className="font-['Fraunces'] text-2xl md:text-3xl font-semibold text-foreground leading-tight">
            Parabéns! Você concluiu a jornada
          </h1>
          <p className="text-accent font-['Fraunces'] text-xl font-medium">
            {completedJourney.title}
          </p>
          <p className="text-muted-foreground font-['Nunito'] text-base max-w-md mx-auto">
            Foram {completedJourney.total_episodes} episódios de reflexão e crescimento.
            Cada manifesto que você leu plantou uma semente. 💜
          </p>
        </div>

        {/* Journey selection */}
        <div className="max-w-2xl mx-auto w-full px-5 pb-8">
          <h2 className="font-['Fraunces'] text-lg font-semibold text-foreground mb-4 text-center">
            Escolha sua próxima jornada
          </h2>

          <div className="space-y-3">
            {availableJourneys?.map((journey) => {
              const emoji = topicEmoji[journey.topic] || "✨";
              const isSelected = selectedJourney === journey.id;
              return (
                <button
                  key={journey.id}
                  onClick={() => setSelectedJourney(journey.id)}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-200 ${
                    isSelected
                      ? "border-accent bg-accent/10 shadow-md"
                      : "border-border bg-card hover:border-accent/40 hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{emoji}</span>
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
                    {isSelected && (
                      <span className="text-accent text-xl">✓</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Confirm button */}
          {selectedJourney && (
            <button
              onClick={() => chooseMutation.mutate(selectedJourney)}
              disabled={chooseMutation.isPending}
              className="mt-6 w-full rounded-xl py-4 bg-accent text-accent-foreground font-['Nunito'] font-semibold text-lg transition-all hover:opacity-90 disabled:opacity-50"
            >
              {chooseMutation.isPending ? "Salvando..." : "Começar esta jornada →"}
            </button>
          )}

          {chooseMutation.isError && (
            <p className="text-destructive text-sm text-center mt-3 font-['Nunito']">
              {chooseMutation.error?.message || "Erro ao selecionar. Tente novamente."}
            </p>
          )}

          <p className="text-xs text-muted-foreground font-['Nunito'] text-center mt-6">
            Se não escolher, a próxima jornada será selecionada automaticamente em 48h.
          </p>
        </div>

        {/* Footer */}
        <footer className="mt-auto py-6 border-t border-border/50 text-center space-y-2">
          <p className="text-accent text-lg">💜</p>
          <a
            href="https://olaaura.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-accent hover:text-accent/80 transition-colors font-['Nunito'] underline underline-offset-2"
          >
            olaaura.com.br
          </a>
        </footer>
      </div>
    </>
  );
};

export default JourneyComplete;
