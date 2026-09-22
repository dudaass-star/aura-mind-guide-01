import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { BookOpen, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JourneyPageShell } from "@/components/portal/JourneyPageShell";

const JourneyComplete = () => {
  const { journeyId, userId } = useParams<{ journeyId: string; userId: string }>();
  const [searchParams] = useSearchParams();
  const portalToken = searchParams.get("t");
  const [confirmed, setConfirmed] = useState(false);
  const [chosenJourneyId, setChosenJourneyId] = useState<string | null>(null);
  const hasPlaceholderParams = journeyId?.startsWith(":") || userId?.startsWith(":");

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
    enabled: !!journeyId && !hasPlaceholderParams,
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
    enabled: !!journeyId && !hasPlaceholderParams,
  });

  const chooseMutation = useMutation({
    mutationFn: async (chosenId: string) => {
      setChosenJourneyId(chosenId);
      const { data, error } = await supabasePortal.functions.invoke("choose-next-journey", {
        body: { journey_id: chosenId, portal_token: portalToken },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Erro ao selecionar jornada");
      return data;
    },
    onSuccess: () => setConfirmed(true),
  });

  const isLoading = loadingJourney || loadingAll;
  const backHref = portalToken
    ? `/meu-espaco?t=${encodeURIComponent(portalToken)}&tab=jornadas`
    : "/meu-espaco?tab=jornadas";

  if (hasPlaceholderParams) {
    return <Navigate to="/meu-espaco" replace />;
  }

  if (isLoading) {
    return (
      <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}>
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </JourneyPageShell>
    );
  }

  if (!completedJourney) {
    return (
      <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="text-center max-w-md">
            <span className="portal-area-content mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl"><BookOpen className="h-6 w-6" /></span>
            <h2 className="mb-2 font-display text-xl font-semibold text-foreground">Jornada não encontrada</h2>
            <p className="text-muted-foreground">Este conteúdo não está disponível neste link.</p>
            <Button asChild variant="outline" className="mt-5"><a href={backHref}>Voltar para Jornadas</a></Button>
          </div>
        </div>
      </JourneyPageShell>
    );
  }

  if (confirmed) {
    const chosen = availableJourneys?.find(j => j.id === chosenJourneyId);
    return (
      <JourneyPageShell eyebrow="Jornada concluída" title="Jornadas" backHref={backHref}>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-md space-y-4">
            <span className="portal-area-content mx-auto flex h-14 w-14 items-center justify-center rounded-xl"><CheckCircle2 className="h-6 w-6" /></span>
            <h2 className="font-display text-2xl font-semibold text-foreground">Pronto!</h2>
            <p className="text-lg text-foreground/80">
              Sua próxima jornada será <strong>{chosen?.title || "a escolhida"}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              O primeiro episódio aparecerá em breve nas suas Jornadas.
            </p>
            <Button asChild className="mt-2"><a href={backHref}>Ver minhas Jornadas</a></Button>
          </div>
        </div>
      </JourneyPageShell>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`Jornada concluída — ${completedJourney.title} | Aura`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <JourneyPageShell eyebrow="Jornada concluída" title="Jornadas" backHref={backHref}>
        <main className="portal-app-content mx-auto w-full max-w-2xl flex-1 px-5 py-7 pb-12">
        <div className="space-y-4 text-center">
          <span className="portal-area-content mx-auto flex h-14 w-14 items-center justify-center rounded-xl"><CheckCircle2 className="h-6 w-6" /></span>
          <h1 className="font-display text-2xl font-semibold leading-tight text-foreground md:text-3xl">
            Parabéns! Você concluiu a jornada
          </h1>
          <p className="font-display text-xl font-medium text-primary">
            {completedJourney.title}
          </p>
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            Foram {completedJourney.total_episodes} episódios de reflexão e crescimento.
            Cada conteúdo que você leu passa a fazer parte da sua biblioteca.
          </p>
        </div>

        <div className="mt-9 w-full">
          <h2 className="mb-4 text-center font-display text-lg font-semibold text-foreground">
            Toque na sua próxima jornada
          </h2>

          <div className="space-y-3">
            {availableJourneys?.map((journey) => {
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
                    <span className="portal-area-content mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"><BookOpen className="h-4 w-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-base font-semibold text-foreground">
                        {journey.title}
                      </p>
                      {journey.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
        <div className="mt-9 text-center"><Button asChild variant="outline"><a href={backHref}>Voltar para minhas Jornadas</a></Button></div>
        </main>
      </JourneyPageShell>
    </>
  );
};

export default JourneyComplete;
