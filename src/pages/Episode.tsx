import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ArrowRight, CheckCircle2, Heart, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JourneyPageShell } from "@/components/portal/JourneyPageShell";
import { reportPushConversion } from "@/lib/push-notifications";
import { reportTodayDirectionProgress } from "@/lib/today-direction";

type JourneyAction = "open" | "progress" | "reflect" | "discuss" | "complete";

export default function Episode() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const portalToken = searchParams.get("t");
  const userId = searchParams.get("u");
  const [reflection, setReflection] = useState("");
  const [savedReflection, setSavedReflection] = useState(false);
  const [completed, setCompleted] = useState(false);
  const lastProgressSent = useRef(0);
  const progressSaving = useRef(false);

  const backHref = portalToken ? `/meu-espaco?t=${encodeURIComponent(portalToken)}&tab=jornadas` : "/meu-espaco?tab=jornadas";
  const { data: episode, isLoading, error } = useQuery({
    queryKey: ["episode", id],
    queryFn: async () => {
      if (!id) throw new Error("episode_required");
      const { data, error: queryError } = await supabasePortal.from("journey_episodes").select("*, content_journeys(*)").eq("id", id).single();
      if (queryError) throw queryError;
      return data;
    },
    enabled: Boolean(id),
  });

  const { data: progress } = useQuery({
    queryKey: ["journey-episode-progress", userId, id],
    queryFn: async () => {
      if (!id || !userId) return null;
      const { data } = await supabasePortal.from("journey_episode_progress")
        .select("status,progress_percent,reflection_text").eq("user_id", userId).eq("episode_id", id).maybeSingle();
      return data || null;
    },
    enabled: Boolean(id && userId),
  });

  useEffect(() => {
    if (progress?.reflection_text) setReflection(progress.reflection_text);
    if (progress?.status === "completed") setCompleted(true);
    if (progress?.progress_percent) lastProgressSent.current = progress.progress_percent;
  }, [progress]);

  const action = useMutation({
    mutationFn: async ({ type, percent, text }: { type: JourneyAction; percent?: number; text?: string }) => {
      if (!id) throw new Error("episode_required");
      const { data, error: actionError } = await supabasePortal.functions.invoke("manage-portal-journey", {
        body: { action: type, episodeId: id, progressPercent: percent, reflectionText: text, portalToken },
      });
      if (actionError || data?.error) throw new Error(data?.error || actionError?.message || "Não foi possível salvar");
      return { type, result: data?.result };
    },
    onSuccess: ({ type, result }) => {
      if (type === "reflect") setSavedReflection(true);
      if (type === "complete") {
        setCompleted(true);
        if (userId) reportTodayDirectionProgress(userId, "completed", "journey");
      }
      void queryClient.invalidateQueries({ queryKey: ["journey-episode-progress"] });
      if (result?.status === "journey_completed") void queryClient.invalidateQueries({ queryKey: ["portal-profile"] });
    },
  });

  useEffect(() => {
    if (!id) return;
    void supabasePortal.functions.invoke("manage-portal-journey", {
      body: { action: "open", episodeId: id, portalToken },
    }).then(({ error: openError }) => {
      if (openError) console.warn("Não foi possível registrar a abertura do episódio.");
      else void reportPushConversion(`/episodio/${id}`, "first14_journey");
      if (!openError && userId) reportTodayDirectionProgress(userId, "initiated", "journey");
    });
    // A abertura deve ser registrada uma vez por montagem.
  }, [id, portalToken]);

  useEffect(() => {
    let timer: number | undefined;
    const saveProgress = async () => {
      const root = document.documentElement;
      const available = root.scrollHeight - window.innerHeight;
      if (!id) return;
      if (available <= 0) {
        if (lastProgressSent.current >= 90 || progressSaving.current) return;
        progressSaving.current = true;
        const { data, error: progressError } = await supabasePortal.functions.invoke("manage-portal-journey", {
          body: { action: "progress", episodeId: id, progressPercent: 90, portalToken },
        });
        progressSaving.current = false;
        if (!progressError && !data?.error) lastProgressSent.current = 90;
        return;
      }
      const rawPercent = Math.min(99, Math.max(1, Math.round((window.scrollY / available) * 100)));
      const percent = [90, 75, 50, 25].find((mark) => rawPercent >= mark) || 0;
      if (!percent || percent <= lastProgressSent.current || progressSaving.current) return;

      progressSaving.current = true;
      const { data, error: progressError } = await supabasePortal.functions.invoke("manage-portal-journey", {
        body: { action: "progress", episodeId: id, progressPercent: percent, portalToken },
      });
      progressSaving.current = false;

      if (!progressError && !data?.error) {
        lastProgressSent.current = percent;
      } else {
        console.warn("Não foi possível registrar o progresso de leitura.");
      }
    };
    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void saveProgress(), 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    void saveProgress();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [id, portalToken]);

  const journey = episode?.content_journeys;
  const totalEpisodes = journey?.total_episodes || 8;
  const isLastEpisode = Boolean(episode && episode.episode_number === totalEpisodes);
  const paragraphs = useMemo(() => (episode?.essay_content || episode?.content_prompt || "").split(/\n\n+/).filter((p: string) => p.trim()), [episode]);

  if (isLoading) return <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}><div className="portal-app-content mx-auto w-full max-w-2xl flex-1 space-y-5 px-5 py-7"><Skeleton className="h-20 w-full" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-40 w-full" /></div></JourneyPageShell>;
  if (error || !episode) return <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}><div className="flex flex-1 items-center justify-center px-6 text-center"><div><Sparkles className="mx-auto mb-4 h-7 w-7 text-primary" /><h2 className="font-display text-xl font-semibold">Episódio não encontrado</h2><Button asChild variant="outline" className="mt-5"><Link to={backHref}>Voltar para Jornadas</Link></Button></div></div></JourneyPageShell>;

  const title = episode.stage_title || episode.title;
  const talkPath = portalToken ? `/meu-espaco?t=${encodeURIComponent(portalToken)}&tab=conversar&open=1&episode=${episode.id}` : `/meu-espaco?tab=conversar&open=1&episode=${episode.id}`;
  const discussEpisode = () => {
    // A conversa não deve ficar bloqueada se o registro de telemetria falhar.
    void supabasePortal.functions.invoke("manage-portal-journey", {
      body: { action: "discuss", episodeId: episode.id, portalToken },
    }).then(({ error: discussError, data }) => {
      if (discussError || data?.error) console.warn("Não foi possível registrar a conversa sobre o episódio.");
    });
    navigate(talkPath);
  };
  return <>
    <Helmet><title>{`EP ${episode.episode_number} — ${title} | Aura`}</title><meta name="robots" content="noindex, nofollow" /></Helmet>
    <JourneyPageShell eyebrow="Conteúdos para você" title="Jornadas" backHref={backHref}>
      <main className="portal-app-content mx-auto w-full max-w-2xl flex-1 px-5 py-6 pb-12">
        <section className="mb-7 border-b pb-5">
          <div className="flex items-center justify-between gap-3"><p className="truncate font-display text-sm font-semibold">{journey?.title || "Jornada"}</p><span className="text-xs font-semibold text-muted-foreground">{episode.episode_number} de {totalEpisodes}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${(episode.episode_number / totalEpisodes) * 100}%` }} /></div>
        </section>
        <article className="portal-episode-reading">
          <header className="mb-8"><span className="mb-2 inline-block text-xs font-bold uppercase text-primary">Episódio {episode.episode_number}</span><h1 className="font-display text-2xl font-semibold leading-tight md:text-3xl">{title}</h1></header>
          <div className="space-y-5 font-body text-base leading-relaxed text-foreground/90 md:text-lg">{paragraphs.map((paragraph: string, index: number) => <p key={index}>{paragraph}</p>)}</div>

          <section className="mt-12 border-t pt-7">
            <p className="text-xs font-bold uppercase text-primary">O que ficou com você?</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Guarde uma reflexão, se fizer sentido</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A AURA poderá considerar somente o que você escolher registrar aqui, sem transformar isso em diagnóstico.</p>
            <Textarea value={reflection} onChange={(event) => { setReflection(event.target.value); setSavedReflection(false); }} maxLength={2000} placeholder="Uma frase, pergunta ou percepção..." className="mt-4 min-h-28 resize-none rounded-xl" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" disabled={!reflection.trim() || action.isPending} onClick={() => action.mutate({ type: "reflect", text: reflection.trim() })}>{action.isPending ? <Loader2 className="animate-spin" /> : <Heart />} {savedReflection ? "Reflexão guardada" : "Guardar reflexão"}</Button>
              <Button variant="ghost" disabled={action.isPending} onClick={discussEpisode}>
                <MessageCircle /> Conversar sobre este episódio
              </Button>
            </div>
          </section>

          <section className="mt-8 border-t pt-7 text-center">
            {completed ? <><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 font-display text-xl font-semibold">{isLastEpisode ? "Jornada concluída" : "Episódio concluído"}</h2><p className="mt-2 text-sm text-muted-foreground">{isLastEpisode ? "O que você construiu permanece na sua biblioteca." : "O próximo episódio chega no próximo dia de Jornada."}</p><Button asChild className="mt-5"><Link to={backHref}>Voltar para Jornadas <ArrowRight /></Link></Button></>
              : <><h2 className="font-display text-xl font-semibold">Terminou por hoje?</h2><p className="mt-2 text-sm text-muted-foreground">Confirme no seu tempo. Só então este episódio será marcado como concluído.</p><Button className="mt-5" disabled={action.isPending} onClick={() => action.mutate({ type: "complete" })}>{action.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {isLastEpisode ? "Concluir esta jornada" : "Concluir episódio"}</Button></>}
            {action.isError && action.variables?.type === "complete" && <p className="mt-3 text-sm text-destructive">Não foi possível concluir agora. Tente novamente.</p>}
          </section>
          <footer className="mt-12 border-t pt-7 text-center text-sm text-muted-foreground">Conteúdo exclusivo da AURA</footer>
        </article>
      </main>
    </JourneyPageShell>
  </>;
}