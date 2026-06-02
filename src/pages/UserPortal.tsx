import { useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { useState, useEffect } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { Target, Sparkles, Headphones, Lock, LogOut, Sun, Calendar, User } from "lucide-react";
import { usePortalAuth } from "@/contexts/PortalAuthContext";

import { PortalLoading } from "@/components/portal/shared";
import { JornadasTab } from "@/components/portal/JornadasTab";
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

type TabId = "hoje" | "sessoes" | "insights" | "sobre" | "jornadas" | "meditacoes";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "hoje", label: "Hoje", icon: Sun },
  { id: "sessoes", label: "Sessões", icon: Calendar },
  { id: "insights", label: "Insights", icon: Sparkles },
  { id: "sobre", label: "Sobre você", icon: User },
  { id: "jornadas", label: "Jornadas", icon: Target },
  { id: "meditacoes", label: "Meditações", icon: Headphones },
];

const UserPortal = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = (searchParams.get("tab") as TabId) || "hoje";
  const legacyToken = searchParams.get("t");
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [resolvingLegacy, setResolvingLegacy] = useState(!!legacyToken);
  const { session, loading: authLoading, signOut, linkStatus } = usePortalAuth();

  // Compatibilidade com links legados /meu-espaco?t=<token>.
  // Se não há sessão, resolve o token para o email do dono e redireciona
  // pro fluxo de login com o email pré-preenchido + envio automático do código.
  useEffect(() => {
    if (!legacyToken) return;
    if (authLoading) return;
    if (session) {
      // Já está logado — só limpa o token da URL pra não vazar em referers.
      setResolvingLegacy(false);
      navigate("/meu-espaco" + (initialTab !== "hoje" ? `?tab=${initialTab}` : ""), { replace: true });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabasePortal.functions.invoke("resolve-portal-token", {
          body: { token: legacyToken },
        });
        if (error || !data?.resolved || !data?.email) {
          navigate("/meu-espaco/entrar", { replace: true });
          return;
        }
        const params = new URLSearchParams({ email: data.email, autoSend: "1" });
        navigate(`/meu-espaco/entrar?${params.toString()}`, { replace: true });
      } catch {
        navigate("/meu-espaco/entrar", { replace: true });
      }
    })();
  }, [legacyToken, authLoading, session, navigate, initialTab]);

  const userId = session?.user?.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["portal-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("profiles")
        .select(
          "name, current_journey_id, current_episode, journeys_completed, plan, billing_cycle, asaas_customer_id, pending_insight, last_user_message_at, last_proactive_insight_at, sessions_used_this_month",
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

  if (authLoading || resolvingLegacy) return <PortalLoading />;
  if (!session) return <Navigate to="/meu-espaco/entrar" replace />;

  // Aguardando vinculação ao profile legado
  if (linkStatus === "idle" || linkStatus === "linking") return <PortalLoading />;

  // Não achou profile por email → pede telefone
  if (linkStatus === "needs_phone" || linkStatus === "phone_taken" || linkStatus === "error") {
    return <PhoneLinkPrompt />;
  }

  if (profileLoading) return <PortalLoading />;

  const firstName = profile?.name?.split(" ")[0] || "você";

  const handleOpenBillingPortal = async () => {
    if (portalLoading) return;
    setPortalLoading(true);
    try {
      const { data, error } = await supabasePortal.functions.invoke("customer-portal", {
        body: { userId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Link não recebido");
      window.open(data.url, "_blank", "noopener,noreferrer");
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

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border/40 shadow-sm">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <img src={logoOlaAura} alt="Olá AURA" className="h-12 w-auto" />
            <span className="text-xs uppercase tracking-widest text-accent font-semibold font-['Nunito']">
              Meu Espaço
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border/30 bg-card/50 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-2 sm:px-5 flex gap-0.5 overflow-x-auto scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1 px-2.5 sm:px-3 py-3 text-xs sm:text-sm font-['Nunito'] font-medium whitespace-nowrap border-b-2 transition-all shrink-0 ${
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 pb-24">
          {activeTab === "hoje" && (
            <HojeTab
              userId={userId!}
              firstName={firstName}
              profile={profile}
              onNavigateTab={(t) => setActiveTab(t as TabId)}
            />
          )}
          {activeTab === "sessoes" && <SessoesTab userId={userId!} profile={profile} />}
          {activeTab === "insights" && <InsightsTab userId={userId!} profile={profile} />}
          {activeTab === "sobre" && <SobreVoceTab userId={userId!} />}
          {activeTab === "jornadas" && (
            <JornadasTab userId={userId!} profile={profile} portalToken={""} />
          )}
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
            <span>Atualizar forma de pagamento</span>
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
          currentBilling={(profile?.billing_cycle as any) ?? null}
          paymentMethod={isAsaasPix ? "pix" : "card"}
        />
      )}
    </>
  );
};

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
