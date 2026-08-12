import { useSearchParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { Sparkles, Headphones, Lock, LogOut, Sun, Calendar, User } from "lucide-react";
import { usePortalAuth } from "@/contexts/PortalAuthContext";

import { PortalLoading } from "@/components/portal/shared";
import { MeditacoesTab } from "@/components/portal/MeditacoesTab";
import { PhoneLinkPrompt } from "@/components/portal/PhoneLinkPrompt";
import { HojeTab } from "@/components/portal/HojeTab";
import { SessoesTab } from "@/components/portal/SessoesTab";
import { InsightsTab } from "@/components/portal/InsightsTab";
import { SobreVoceTab } from "@/components/portal/SobreVoceTab";
import { FloatingWhatsAppCTA } from "@/components/portal/FloatingWhatsAppCTA";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ChangePlanDialog } from "@/components/portal/ChangePlanDialog";
import {
  usePortalNovidades,
  markTabSeen,
  type TabKey,
} from "@/components/portal/hooks/usePortalNovidades";

type TabId = "hoje" | "sessoes" | "insights" | "sobre" | "meditacoes";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "hoje", label: "Hoje", icon: Sun },
  { id: "sessoes", label: "Sessões", icon: Calendar },
  { id: "insights", label: "Percurso", icon: Sparkles },
  { id: "sobre", label: "Sobre você", icon: User },
  { id: "meditacoes", label: "Meditações", icon: Headphones },
];

// Abas que exibem badge de novidade (subset do TabId).
const NOVIDADE_TABS: Record<string, TabKey> = {
  hoje: "hoje",
  insights: "insights",
  sobre: "sobre",
};

const UserPortal = () => {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as TabId | "memoria" | null;
  // Legacy: aba "memoria" foi absorvida em "sobre".
  const initialTab: TabId = (rawTab === "memoria" ? "sobre" : (rawTab as TabId)) || "hoje";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const { session, loading: authLoading, signOut, linkStatus } = usePortalAuth();

  const userId = session?.user?.id;
  const { data: novidades, refetch: refetchNovidades } = usePortalNovidades(userId);

  // Ao abrir o portal, marca a aba inicial como vista.
  useEffect(() => {
    const key = NOVIDADE_TABS[activeTab];
    if (key && userId) markTabSeen(userId, key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleTabClick = (id: TabId) => {
    setActiveTab(id);
    const key = NOVIDADE_TABS[id];
    if (key && userId) {
      markTabSeen(userId, key);
      // Re-avalia badges após marcar como visto.
      setTimeout(() => refetchNovidades(), 100);
    }
  };

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["portal-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("profiles")
        .select(
          "name, current_journey_id, current_episode, journeys_completed, plan, plan_tier, billing_cycle, asaas_customer_id, card_gateway, last_user_message_at, last_proactive_insight_at, sessions_used_this_month, messages_used_this_month, messages_reset_month, created_at",
        )
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && linkStatus === "linked",
  });

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
  // Trilho PIX Automático Bacen pelo Banco Inter (sem cartão, mandato Bacen).
  const isInterPix = (profile as any)?.card_gateway === "inter";
  // Trilho PIX Automático pela Woovi (jornada composta, mandato Bacen).
  const isWooviPix = (profile as any)?.card_gateway === "woovi";

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
    // PIX Automático Woovi: idem Inter — o que resolve é reautorizar o mandato.
    if (isWooviPix) {
      toast({
        title: "Você paga via PIX Automático",
        description:
          "Não há cartão para atualizar. Se a renovação parou, mandamos um QR novo pra reautorizar o débito no seu banco — ou fale com o suporte.",
      });
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
        <title>Meu Espaço | Aura</title>
        <meta name="description" content="Seu painel pessoal da Aura" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-[#F5F0E8] text-[#2A2A2A] flex flex-col">
        {/* Header — Deep Navy Anchor */}
        <div className="bg-[#F5F0E8]">
          <div className="max-w-2xl mx-auto px-5 pt-5 pb-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-11 w-auto" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#87A878] font-bold font-['Nunito']">
              Meu Espaço
            </span>
          </div>
        </div>

        {/* Tabs — underline navy accent */}
        <div className="bg-[#F5F0E8] sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-3 sm:px-5 border-b border-[#87A878]/20 flex gap-1 sm:gap-1 w-full justify-between sm:justify-start sm:overflow-x-auto scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const novidadeKey = NOVIDADE_TABS[tab.id];
              const hasNovidade =
                !isActive && novidadeKey && (novidades as any)?.[novidadeKey];
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  aria-label={tab.label}
                  className={`relative flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-4 py-3 text-xs sm:text-sm font-['Nunito'] whitespace-nowrap transition-all flex-1 sm:flex-none sm:shrink-0 ${
                    isActive
                      ? "text-[#1B2A4E] font-bold"
                      : "text-[#2A2A2A]/50 font-semibold hover:text-[#1B2A4E]"
                  }`}
                >
                  <Icon size={isActive ? 16 : 15} className="sm:!w-[14px] sm:!h-[14px] shrink-0" />
                  <span className={`${isActive ? "inline" : "hidden"} sm:inline`}>{tab.label}</span>
                  {hasNovidade && (
                    <span
                      aria-label="Novidade"
                      className="absolute top-1.5 right-1.5 sm:static sm:ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#B8A5D9] animate-pulse-soft"
                    />
                  )}
                  {isActive && (
                    <span className="absolute -bottom-px left-1/2 -translate-x-1/2 h-[3px] w-8 sm:w-6 bg-[#1B2A4E] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 pb-24">
          <PlanTierBanner profile={profile} onChangePlan={() => setChangePlanOpen(true)} />
          {activeTab === "hoje" && (
            <HojeTab
              userId={userId!}
              firstName={firstName}
              profile={profile}
              onNavigateTab={(t) => handleTabClick(t as TabId)}
            />
          )}
          {activeTab === "sessoes" && <SessoesTab userId={userId!} profile={profile} />}
          {activeTab === "insights" && <InsightsTab userId={userId!} profile={profile} />}
          {activeTab === "sobre" && <SobreVoceTab userId={userId!} />}
          {activeTab === "meditacoes" && <MeditacoesTab userId={userId!} />}
        </div>

        {/* CTA flutuante presente em todas as abas */}
        <FloatingWhatsAppCTA />

        {/* Footer */}
        <footer className="border-t border-border/40 py-6 text-center">
          <button
            onClick={handleOpenBillingPortal}
            disabled={portalLoading}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors font-['Nunito'] mb-3 disabled:opacity-60"
          >
            {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            <span>{portalLoading ? "Abrindo…" : "Atualizar forma de pagamento"}</span>
          </button>
          <button
            onClick={() => setChangePlanOpen(true)}
            className="block mx-auto mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors font-['Nunito']"
          >
            <RefreshCw size={14} />
            <span>Trocar de plano</span>
          </button>
          <button
            onClick={signOut}
            className="block mx-auto mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent transition-colors font-['Nunito']"
          >
            <LogOut size={14} />
            <span>Sair</span>
          </button>
          <p className="text-sm text-muted-foreground font-['Nunito']">Conteúdo exclusivo da Aura</p>
          <a
            href="https://olaaura.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-accent hover:text-accent/80 transition-colors font-['Nunito'] underline underline-offset-2 mt-1"
          >
            olaaura.com.br
          </a>
        </footer>
      </div>

      {userId && (
        <ChangePlanDialog
          open={changePlanOpen}
          onOpenChange={setChangePlanOpen}
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
              : isAsaasPix
              ? "asaas-pix"
              : (profile as any)?.card_gateway === "asaas"
                ? "asaas-card"
                : "stripe-card"
          }
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
