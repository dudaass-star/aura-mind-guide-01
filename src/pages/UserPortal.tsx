import { useSearchParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { Target, BarChart3, Headphones, Heart, Lock, LogOut } from "lucide-react";
import { usePortalAuth } from "@/contexts/PortalAuthContext";

import { PortalHeader, PortalLoading, ProgressBadges } from "@/components/portal/shared";
import { JornadasTab } from "@/components/portal/JornadasTab";
import { ResumosTab } from "@/components/portal/ResumosTab";
import { MeditacoesTab } from "@/components/portal/MeditacoesTab";
import { CapsulasTab } from "@/components/portal/CapsulasTab";
import { PhoneLinkPrompt } from "@/components/portal/PhoneLinkPrompt";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ChangePlanDialog } from "@/components/portal/ChangePlanDialog";

type TabId = "jornadas" | "resumos" | "meditacoes" | "capsulas";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "jornadas", label: "Jornadas", icon: Target },
  { id: "resumos", label: "Resumos", icon: BarChart3 },
  { id: "meditacoes", label: "Meditações", icon: Headphones },
  { id: "capsulas", label: "Cápsulas", icon: Heart },
];

const UserPortal = () => {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabId) || "jornadas";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const { session, loading: authLoading, signOut, linkStatus } = usePortalAuth();

  const userId = session?.user?.id;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["portal-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("profiles")
        .select("name, current_journey_id, current_episode, journeys_completed, plan")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && linkStatus === "linked",
  });

  const { data: reportsCount } = useQuery({
    queryKey: ["portal-reports-count", userId],
    queryFn: async () => {
      const { count, error } = await supabasePortal
        .from("monthly_reports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!userId && linkStatus === "linked",
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

        {/* Contextual Greeting */}
        <PortalHeader firstName={firstName} />

        {/* Progress Badges */}
        <ProgressBadges
          journeysCompleted={profile?.journeys_completed || 0}
          reportsCount={reportsCount || 0}
          meditationsAvailable={true}
        />

        {/* Tabs */}
        <div className="border-b border-border/30 bg-card/50 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-5 flex gap-0.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1 px-2.5 sm:px-4 py-3 text-xs sm:text-sm font-['Nunito'] font-medium whitespace-nowrap border-b-2 transition-all ${
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
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6">
          {activeTab === "jornadas" && <JornadasTab userId={userId!} profile={profile} portalToken={""} />}
          {activeTab === "resumos" && <ResumosTab userId={userId!} />}
          {activeTab === "meditacoes" && <MeditacoesTab />}
          {activeTab === "capsulas" && <CapsulasTab userId={userId!} />}
        </div>

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
