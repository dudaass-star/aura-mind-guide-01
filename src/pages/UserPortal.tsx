import { useSearchParams, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { ArrowLeft, BookOpen, Sparkles, Headphones, Lock, Sun, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/contexts/PortalAuthContext";

import { PortalLoading, PortalLoadingInline } from "@/components/portal/shared";
import { PhoneLinkPrompt } from "@/components/portal/PhoneLinkPrompt";
import { ConversarTab } from "@/components/portal/ConversarTab";
import { toast } from "@/hooks/use-toast";
import { ChangePlanDialog } from "@/components/portal/ChangePlanDialog";
import { rememberPushAttribution, reportPushPresence } from "@/lib/push-notifications";
import { readPortalCache, writePortalCache } from "@/lib/portal-cache";

type TabId = "conversar" | "hoje" | "sessoes" | "jornadas" | "insights" | "sobre" | "meditacoes";

const loadHoje = () => import("@/components/portal/HojeTab");
const loadSessoes = () => import("@/components/portal/SessoesTab");
const loadJornadas = () => import("@/components/portal/JornadasTab");
const loadInsights = () => import("@/components/portal/InsightsTab");
const loadMeditacoes = () => import("@/components/portal/MeditacoesTab");
const loadSobre = () => import("@/components/portal/SobreVoceTab");
const HojeTab = lazy(() => loadHoje().then((module) => ({ default: module.HojeTab })));
const SessoesTab = lazy(() => loadSessoes().then((module) => ({ default: module.SessoesTab })));
const JornadasTab = lazy(() => loadJornadas().then((module) => ({ default: module.JornadasTab })));
const InsightsTab = lazy(() => loadInsights().then((module) => ({ default: module.InsightsTab })));
const MeditacoesTab = lazy(() => loadMeditacoes().then((module) => ({ default: module.MeditacoesTab })));
const SobreVoceTab = lazy(() => loadSobre().then((module) => ({ default: module.SobreVoceTab })));

const AREA_LOADERS: Record<Exclude<TabId, "conversar">, () => Promise<unknown>> = {
  hoje: loadHoje,
  sessoes: loadSessoes,
  jornadas: loadJornadas,
  insights: loadInsights,
  meditacoes: loadMeditacoes,
  sobre: loadSobre,
};

const APP_AREA_META: Record<Exclude<TabId, "conversar">, { label: string; eyebrow: string; icon: React.ElementType; tone: string }> = {
  hoje: { label: "Hoje", eyebrow: "Seu momento", icon: Sun, tone: "portal-area-today" },
  sessoes: { label: "Sessões", eyebrow: "Seus encontros", icon: Calendar, tone: "portal-area-sessions" },
  jornadas: { label: "Jornadas", eyebrow: "Conteúdos para você", icon: BookOpen, tone: "portal-area-content" },
  insights: { label: "Percurso", eyebrow: "Sua evolução", icon: Sparkles, tone: "portal-area-journey" },
  meditacoes: { label: "Meditações", eyebrow: "Sua pausa", icon: Headphones, tone: "portal-area-audio" },
  sobre: { label: "Sobre você", eyebrow: "Sua história", icon: User, tone: "portal-area-profile" },
};

const UserPortal = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as TabId | "memoria" | "percurso" | null;
  // Legacy: aba "memoria" foi absorvida em "sobre".
  const initialTab: TabId = rawTab === "memoria"
    ? "sobre"
    : rawTab === "percurso"
      ? "insights"
      : rawTab && ["conversar", "hoje", "sessoes", "jornadas", "insights", "sobre", "meditacoes"].includes(rawTab)
        ? rawTab as TabId
        : "conversar";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(["conversar", initialTab]));
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [minimumSessionLimit, setMinimumSessionLimit] = useState<number | undefined>();
  const [conversationDraftRequest, setConversationDraftRequest] = useState<string>();
  const { session, loading: authLoading, signOut, linkStatus } = usePortalAuth();

  const userId = session?.user?.id;
  const profileCache = useMemo(
    () => userId ? readPortalCache<any>(`aura-portal-profile:${userId}`, 7 * 24 * 60 * 60 * 1000) : null,
    [userId],
  );
  const discussionEpisodeId = searchParams.get("episode");
  const shouldOpenConversation = searchParams.get("open") === "1"
    || searchParams.get("onboarding") === "new"
    || searchParams.get("migracao") === "whatsapp"
    || Boolean(discussionEpisodeId)
    || (searchParams.get("push") === "open" && searchParams.get("type") === "new_reply");

  useEffect(() => {
    if (!userId || searchParams.get("migracao") !== "whatsapp") return;
    void supabasePortal.from("portal_value_events").insert({
      user_id: userId,
      feature: initialTab === "sessoes" ? "session" : "conversation",
      event_type: "whatsapp_migration_opened",
      source: "whatsapp",
      metadata: { destination: initialTab },
    });
  }, [initialTab, searchParams, userId]);

  useEffect(() => {
    if (activeTab === initialTab) return;
    setVisitedTabs((current) => current.has(initialTab) ? current : new Set(current).add(initialTab));
    setActiveTab(initialTab);
  }, [initialTab]);

  const { data: discussionEpisode } = useQuery({
    queryKey: ["portal-discussion-episode", userId, discussionEpisodeId],
    queryFn: async () => {
      if (!userId || !discussionEpisodeId) return null;
      const { data: released, error: progressError } = await supabasePortal
        .from("journey_episode_progress")
        .select("episode_id")
        .eq("user_id", userId)
        .eq("episode_id", discussionEpisodeId)
        .maybeSingle();
      if (progressError || !released) return null;
      const { data, error } = await supabasePortal
        .from("journey_episodes")
        .select("id,episode_number,title,stage_title")
        .eq("id", discussionEpisodeId)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: Boolean(userId && discussionEpisodeId && linkStatus === "linked"),
  });
  const discussionPrompt = discussionEpisode
    ? `Quero conversar sobre o episódio ${discussionEpisode.episode_number}, “${discussionEpisode.stage_title || discussionEpisode.title}”.`
    : undefined;

  useEffect(() => {
    if (!userId || searchParams.get("push") !== "open") return;
    const deliveryId = searchParams.get("delivery") || undefined;
    void supabasePortal.functions.invoke("register-push-device", {
      body: {
        action: "event",
        eventType: "opened",
        notificationType: searchParams.get("type") || undefined,
        deliveryId,
        path: window.location.pathname,
      },
    }).then(({ error }) => {
      if (!error && deliveryId) {
        const notificationType = searchParams.get("type") || undefined;
        rememberPushAttribution(deliveryId, notificationType);
        const featureByType: Record<string, "conversation" | "session" | "journey" | "practice" | "progress"> = {
          first14_conversation: "conversation",
          first14_session: "session",
          first14_journey: "journey",
          first14_practice: "practice",
          first14_progress: "progress",
        };
        const feature = notificationType ? featureByType[notificationType] : undefined;
        if (feature) {
          void supabasePortal.from("portal_value_events").insert({
            user_id: userId,
            feature,
            event_type: "first14_push_opened",
            source: "push",
            metadata: { delivery_id: deliveryId },
          });
        }
      }
    });
  }, [searchParams, userId]);

  useEffect(() => {
    if (!userId || linkStatus !== "linked") return;
    const report = () => reportPushPresence(document.visibilityState === "visible");
    report();
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    window.addEventListener("blur", report);
    return () => {
      reportPushPresence(false);
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
      window.removeEventListener("blur", report);
    };
  }, [linkStatus, userId]);
  const handleTabClick = (id: TabId) => {
    setVisitedTabs((current) => current.has(id) ? current : new Set(current).add(id));
    setActiveTab(id);
    if (id === "hoje" && userId) void queryClient.invalidateQueries({ queryKey: ["portal-today-direction", userId] });
    const valueFeature = id === "sessoes"
      ? "session"
      : id === "jornadas"
        ? "journey"
      : id === "insights"
        ? "progress"
        : id === "meditacoes"
          ? "practice"
          : id === "sobre"
            ? "profile"
            : id === "conversar"
              ? "conversation"
              : null;
    if (valueFeature && userId) {
      void supabasePortal.from("portal_value_events").insert({
        user_id: userId,
        feature: valueFeature,
        event_type: "opened",
        source: "app",
      }).then(({ error }) => {
        if (error && error.code !== "23505") console.warn("Não foi possível registrar a descoberta da área");
      });
    }
  };

  const prefetchArea = (id: TabId) => {
    if (id === "conversar") return;
    void AREA_LOADERS[id]();
    setVisitedTabs((current) => current.has(id) ? current : new Set(current).add(id));
  };

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 800));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const task = schedule(() => {
      void Promise.all(Object.values(AREA_LOADERS).map((load) => load()));
    });
    return () => cancel(task);
  }, []);

  const handleOpenConversation = (prefilledMessage?: string) => {
    if (!userId) return;
    if (prefilledMessage?.trim()) {
      const nextDraft = prefilledMessage.trim();
      localStorage.setItem(`aura-chat-draft:${userId}`, nextDraft);
      setConversationDraftRequest(nextDraft);
    }
    localStorage.setItem(`aura-chat-open:${userId}`, "true");
    handleTabClick("conversar");
    window.setTimeout(() => window.dispatchEvent(new Event("aura:open-chat")), 0);
  };

  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ["portal-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabasePortal
        .from("profiles")
        .select(
          "name, status, payment_failed_at, current_journey_id, current_episode, journeys_completed, journey_paused, journey_selected_goal, plan, plan_tier, billing_cycle, asaas_customer_id, card_gateway, last_user_message_at, last_proactive_insight_at, sessions_used_this_month, messages_used_this_month, messages_reset_month, created_at, converted_at, trial_started_at",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (data) writePortalCache(`aura-portal-profile:${userId}`, data);
      return data;
    },
    enabled: !!userId && linkStatus === "linked",
    initialData: profileCache?.value,
    initialDataUpdatedAt: profileCache?.savedAt,
  });

  // Volta do Billing Portal: o webhook cobra a fatura aberta na hora, então aqui
  // a gente só confirma o resultado em vez de deixar a tela igual.
  const billingReturn = searchParams.get("billing") === "return";
  useEffect(() => {
    if (!billingReturn || !userId || linkStatus !== "linked") return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      attempts++;
      const { data } = await refetchProfile();
      if (cancelled) return;
      const p: any = data;
      const resolved = p && !p.payment_failed_at && !["past_due", "payment_failed"].includes(p.status);
      if (resolved) {
        toast({
          title: "Pagamento confirmado",
          description: "Sua assinatura está em dia. Obrigado!",
        });
        return;
      }
      if (attempts >= 4) {
        toast({
          title: "Cartão atualizado",
          description:
            "Ainda não conseguimos confirmar a cobrança. Se ela não entrar em alguns minutos, tente outro cartão ou fale com o suporte.",
        });
        return;
      }
      setTimeout(check, 4000);
    };
    const timer = setTimeout(check, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingReturn, userId, linkStatus]);

  // Detecta PIX Asaas recorrente: tem asaas_customer_id E pelo menos uma payment
  // com asaas_subscription_id ativo (status corrente).
  // Match por asaas_customer_id (FK histórica de user_id aponta pra profiles.id, não auth.uid()).
  const { data: isAsaasPix } = useQuery({
    queryKey: ["portal-asaas-active", userId],
    queryFn: async () => {
      if (!profile?.asaas_customer_id) return false;
      const { data, error } = await supabasePortal
        .from("asaas_payments")
        .select("asaas_subscription_id")
        .eq("asaas_customer_id", profile.asaas_customer_id)
        .not("asaas_subscription_id", "is", null)
        .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "RECEIVED_IN_CASH", "OVERDUE"])
        .limit(1);
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!userId && !!profile?.asaas_customer_id,
  });

  if (authLoading) return <PortalLoading />;
  if (!session) return <Navigate to="/meu-espaco/entrar" replace />;

  // Aguardando vinculação ao profile legado
  if (linkStatus === "idle" || linkStatus === "linking") return <PortalLoading />;

  // Não achou profile por email → pede telefone
  if (linkStatus === "needs_phone" || linkStatus === "phone_taken" || linkStatus === "error") {
    return <PhoneLinkPrompt />;
  }

  if (profileLoading) return <PortalLoading />;

  const firstName = profile?.name?.split(" ")[0] || "você";
  const isDemo = profile?.status === "demo";
  const areaMeta = activeTab === "conversar" ? null : APP_AREA_META[activeTab];
  // Trilho PIX Automático Bacen pelo Banco Inter (sem cartão, mandato Bacen).
  const isInterPix = (profile as any)?.card_gateway === "inter";
  // Trilho PIX Automático pela Woovi (jornada composta, mandato Bacen).
  const isWooviPix = (profile as any)?.card_gateway === "woovi";

  // PIX Automático (Woovi) → cartão. O período já pago é respeitado: a primeira
  // cobrança no cartão só acontece na renovação, e o débito PIX é encerrado
  // apenas depois que o cartão é confirmado.
  const handleSwitchToCard = async () => {
    if (portalLoading) return;
    setPortalLoading(true);
    toast({
      title: "Abrindo o pagamento no cartão…",
      description: "Nada é cobrado agora: seu período já pago continua valendo.",
    });
    try {
      const { data, error } = await supabasePortal.functions.invoke("switch-to-card", {
        body: { userId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Link não recebido");
      window.location.href = data.url;
    } catch (err: any) {
      const msg =
        err?.context?.error || err?.message || "Não foi possível abrir agora. Tente novamente em instantes.";
      toast({
        title: "Ops",
        description: typeof msg === "string" ? msg : "Não foi possível abrir agora.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (portalLoading) return;
    // PIX Automático Bacen (Inter): não existe cartão para atualizar. O que
    // resolve, quando a renovação para, é reautorizar o débito num QR novo.
    if (isInterPix) {
      toast({
        title: "Você paga via PIX Automático",
        description:
          "Não há cartão para atualizar. Se a renovação parou, use o link de reautorização que enviamos por e-mail ou fale com o suporte.",
      });
      return;
    }
    // PIX Automático Woovi: não existe cartão salvo — o caminho real é migrar
    // pro cartão (fluxo abaixo), preservando o período já pago.
    if (isWooviPix) {
      void handleSwitchToCard();
      return;
    }
    // PIX Asaas recorrente: cartão não se aplica. Explica e oferece suporte.
    if (isAsaasPix) {
      toast({
        title: "Você paga via PIX",
        description:
          "PIX recorrente não usa cartão. Se quiser trocar de forma de pagamento, fale com o suporte.",
      });
      return;
    }
    setPortalLoading(true);
    toast({
      title: "Abrindo página de pagamento…",
      description: "Só um instante.",
    });
    try {
      const gateway =
        (profile as any)?.card_gateway === "asaas" ? "asaas-card" : "stripe-card";
      const { data, error } = await supabasePortal.functions.invoke("customer-portal", {
        body: { userId, gateway },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Link não recebido");
      // window.location.href evita popup blocker em mobile após await.
      window.location.href = data.url;
    } catch (err: any) {
      const msg = err?.context?.error || err?.message || "Não foi possível abrir agora. Tente novamente em instantes.";
      toast({
        title: "Ops",
        description: typeof msg === "string" ? msg : "Não foi possível abrir agora.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Olá Aura | Seu aplicativo</title>
        <meta name="description" content="Converse com a AURA e acompanhe suas jornadas, sessões e práticas no aplicativo Olá Aura." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className={`min-h-screen bg-background text-foreground flex flex-col ${activeTab === "conversar" ? "" : `portal-chat-theme portal-app-theme portal-app-area-${activeTab}`}`}>
        {isDemo && <div className="border-b border-border bg-muted px-4 py-1.5 text-center text-xs font-semibold text-muted-foreground">Personagem fictícia · Conta de demonstração</div>}
        {areaMeta && (
          <header className="portal-app-header sticky top-0 z-30 border-b border-border/70 bg-card/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                onClick={() => handleTabClick("conversar")}
                aria-label="Voltar para Conversas"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${areaMeta.tone}`}>
                <areaMeta.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{areaMeta.eyebrow}</p>
                <h1 className="truncate font-display text-xl font-semibold leading-tight text-foreground">{areaMeta.label}</h1>
              </div>
              <img src={logoOlaAura} alt="Olá AURA" className="h-7 w-auto opacity-75" />
            </div>
          </header>
        )}

        {/* Content */}
        <div className={activeTab === "conversar" ? "flex-1 w-full" : "portal-app-content flex-1 max-w-2xl mx-auto w-full px-5 py-6 pb-24"}>
          {activeTab !== "conversar" && !isDemo && <PlanTierBanner profile={profile} onChangePlan={() => { setMinimumSessionLimit(undefined); setChangePlanOpen(true); }} />}
          <div className={activeTab === "conversar" ? "block" : "hidden"} aria-hidden={activeTab !== "conversar"}>
            <ConversarTab
              userId={userId}
              firstName={firstName}
              onNavigate={handleTabClick}
              onPrefetch={prefetchArea}
              onOpenBilling={() => void handleOpenBillingPortal()}
              onChangePlan={() => { setMinimumSessionLimit(undefined); setChangePlanOpen(true); }}
              onSignOut={() => void signOut()}
              billingLabel={isWooviPix ? "Passar a pagar no cartão" : "Atualizar forma de pagamento"}
              accountLoading={portalLoading}
              isDemo={isDemo}
              isActive={activeTab === "conversar"}
              initialChatOpen={shouldOpenConversation}
              initialDraft={conversationDraftRequest ?? discussionPrompt}
              discussionEpisodeId={discussionEpisode?.id}
              entryContext={searchParams.get("migracao") === "whatsapp" ? "migration" : searchParams.get("onboarding") === "new" ? "new" : "regular"}
            />
          </div>
          <Suspense fallback={<PortalLoadingInline />}>
          {visitedTabs.has("hoje") && <div className={activeTab === "hoje" ? "block" : "hidden"} aria-hidden={activeTab !== "hoje"}>
            <HojeTab
              userId={userId}
              firstName={firstName}
              profile={profile}
              onNavigateTab={(t) => handleTabClick(t as TabId)}
              onOpenConversation={handleOpenConversation}
              onOpenNotifications={() => window.dispatchEvent(new Event("aura:open-push"))}
            />
          </div>}
          {visitedTabs.has("sessoes") && <div className={activeTab === "sessoes" ? "block" : "hidden"} aria-hidden={activeTab !== "sessoes"}><SessoesTab userId={userId} profile={profile} onChangePlan={(limit) => { setMinimumSessionLimit(limit); setChangePlanOpen(true); }} onOpenConversation={handleOpenConversation} onOpenNotifications={() => { handleTabClick("conversar"); window.setTimeout(() => window.dispatchEvent(new Event("aura:open-push")), 100); }} /></div>}
          {visitedTabs.has("jornadas") && <div className={activeTab === "jornadas" ? "block" : "hidden"} aria-hidden={activeTab !== "jornadas"}><JornadasTab userId={userId} profile={profile} onJourneyChanged={() => void refetchProfile()} /></div>}
          {visitedTabs.has("insights") && <div className={activeTab === "insights" ? "block" : "hidden"} aria-hidden={activeTab !== "insights"}><InsightsTab userId={userId} profile={profile} onOpenConversation={handleOpenConversation} /></div>}
          {visitedTabs.has("sobre") && <div className={activeTab === "sobre" ? "block" : "hidden"} aria-hidden={activeTab !== "sobre"}><SobreVoceTab userId={userId} profile={profile} onOpenConversation={handleOpenConversation} /></div>}
          {visitedTabs.has("meditacoes") && <div className={activeTab === "meditacoes" ? "block" : "hidden"} aria-hidden={activeTab !== "meditacoes"}><MeditacoesTab userId={userId} /></div>}
          </Suspense>
        </div>

        {/* Rodapé institucional; ações da conta ficam no menu da tela inicial. */}
        {activeTab !== "conversar" && <footer className="border-t border-border/40 py-6 text-center">
          <p className="text-sm text-muted-foreground font-body">Conteúdo exclusivo da AURA</p>
          <a
            href="https://olaaura.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-primary hover:text-primary/80 transition-colors font-body underline underline-offset-2 mt-1"
          >
            olaaura.com.br
          </a>
        </footer>}
      </div>

      {userId && !isDemo && (
        <ChangePlanDialog
          open={changePlanOpen}
          onOpenChange={(open) => {
            setChangePlanOpen(open);
            if (!open) setMinimumSessionLimit(undefined);
          }}
          userId={userId}
          currentPlan={(profile?.plan as "essencial" | "direcao" | "transformacao" | null) ?? null}
          currentTier={(profile as any)?.plan_tier ?? null}
          currentBilling={
            // Legacy: rows antigas gravaram "semestral"; ChangePlanDialog espera "semiannual".
            (profile?.billing_cycle === "semestral"
              ? "semiannual"
              : (profile?.billing_cycle as any)) ?? null
          }
          paymentGateway={
            isInterPix
              ? "inter-pix"
              : isWooviPix
              ? "woovi-pix"
              : isAsaasPix
              ? "asaas-pix"
              : (profile as any)?.card_gateway === "asaas"
                ? "asaas-card"
                : "stripe-card"
          }
          minimumSessionLimit={minimumSessionLimit}
        />
      )}
    </>
  );
};

const BASE_TIER_MESSAGE_LIMIT = 30;

function PlanTierBanner({
  profile,
  onChangePlan,
}: {
  profile: any;
  onChangePlan: () => void;
}) {
  const tier = (profile?.plan_tier || "").toString().toLowerCase();
  if (tier !== "lite" && tier !== "base") return null;

  const monthKey = new Date().toISOString().slice(0, 7);
  const used =
    profile?.messages_reset_month === monthKey
      ? profile?.messages_used_this_month ?? 0
      : 0;
  const pct = Math.min(100, Math.round((used / BASE_TIER_MESSAGE_LIMIT) * 100));

  return (
    <div className="mb-5 rounded-2xl border border-[#B8A5D9]/40 bg-white/70 p-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#87A878] font-bold font-['Nunito']">
          Plano {tier === "lite" ? "Lite" : "Base"}
        </p>
        <button
          onClick={onChangePlan}
          className="text-xs font-bold font-['Nunito'] text-[#1B2A4E] underline underline-offset-2 hover:text-[#87A878] transition-colors"
        >
          Voltar ao Essencial
        </button>
      </div>

      {tier === "base" ? (
        <div className="mt-3">
          <p className="text-sm text-[#2A2A2A] font-['Nunito']">
            {used} de {BASE_TIER_MESSAGE_LIMIT} mensagens usadas neste mês
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-[#1B2A4E]/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1B2A4E] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[#2A2A2A]/60 font-['Nunito']">
            Sem áudios e sem sessões agendadas neste plano. A cota reinicia no dia 1º.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#2A2A2A]/70 font-['Nunito']">
          1 sessão por mês e até 15 minutos de áudio. Conversas por texto seguem sem limite.
        </p>
      )}
    </div>
  );
}

function PortalError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="py-4 px-6 flex justify-center border-b border-border/50">
        <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto" />
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md animate-fade-in">
          <div className="bg-muted rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center mb-4">
            <Lock size={28} className="text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2 font-['Fraunces']">
            Acesso não autorizado
          </h1>
          <p className="text-muted-foreground font-['Nunito']">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default UserPortal;
