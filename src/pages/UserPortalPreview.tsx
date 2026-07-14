// Rota DEV-ONLY para inspeção visual do portal sem OAuth.
// Ativa apenas quando import.meta.env.DEV é true (vite dev server no sandbox).
// Em build de produção (preview .lovable.app e produção) redireciona pra /.
import { Navigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { Target, Sparkles, Headphones, Sun, Calendar, User, Route, BookOpen } from "lucide-react";

import { PortalLoading } from "@/components/portal/shared";
import { JornadasTab } from "@/components/portal/JornadasTab";
import { JornadaTab } from "@/components/portal/JornadaTab";
import { MemoriaTab } from "@/components/portal/MemoriaTab";
import { MeditacoesTab } from "@/components/portal/MeditacoesTab";
import { HojeTab } from "@/components/portal/HojeTab";
import { SessoesTab } from "@/components/portal/SessoesTab";
import { InsightsTab } from "@/components/portal/InsightsTab";
import { SobreVoceTab } from "@/components/portal/SobreVoceTab";
import { FloatingWhatsAppCTA } from "@/components/portal/FloatingWhatsAppCTA";

type TabId = "hoje" | "sessoes" | "insights" | "sobre" | "jornada" | "memoria" | "jornadas" | "meditacoes";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "hoje", label: "Hoje", icon: Sun },
  { id: "sessoes", label: "Sessões", icon: Calendar },
  { id: "insights", label: "Percurso", icon: Sparkles },
  { id: "jornada", label: "Jornada", icon: Route },
  { id: "memoria", label: "Memória", icon: BookOpen },
  { id: "sobre", label: "Sobre você", icon: User },
  { id: "jornadas", label: "Jornadas", icon: Target },
  { id: "meditacoes", label: "Meditações", icon: Headphones },
];

const UserPortalPreview = () => {
  // Guard duplo: variável DEV + confirmação em runtime.
  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId") || "";
  const initialTab = (searchParams.get("tab") as TabId) || "hoje";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["portal-preview-profile", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("profiles")
        .select(
          "name, current_journey_id, current_episode, journeys_completed, plan, billing_cycle, asaas_customer_id, card_gateway, pending_insight, last_user_message_at, last_proactive_insight_at, sessions_used_this_month, created_at",
        )
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="font-semibold">Preview do portal (dev)</p>
          <p className="text-sm text-muted-foreground mt-2">
            Passe <code>?userId=&lt;uuid&gt;&amp;tab=hoje</code> na URL.
          </p>
        </div>
      </div>
    );
  }

  if (profileLoading) return <PortalLoading />;

  const firstName = profile?.name?.split(" ")[0] || "você";

  return (
    <>
      <Helmet>
        <title>Preview Portal (dev) | Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        {/* Aviso dev */}
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 text-center text-xs py-1 font-mono">
          DEV PREVIEW — user {userId.slice(0, 8)}…
        </div>

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
              userId={userId}
              firstName={firstName}
              profile={profile}
              onNavigateTab={(t) => setActiveTab(t as TabId)}
            />
          )}
          {activeTab === "sessoes" && <SessoesTab userId={userId} profile={profile} />}
          {activeTab === "insights" && <InsightsTab userId={userId} profile={profile} />}
          {activeTab === "jornada" && <JornadaTab userId={userId} />}
          {activeTab === "memoria" && <MemoriaTab userId={userId} />}
          {activeTab === "sobre" && <SobreVoceTab userId={userId} />}
          {activeTab === "jornadas" && (
            <JornadasTab userId={userId} profile={profile} portalToken={""} />
          )}
          {activeTab === "meditacoes" && <MeditacoesTab userId={userId} />}
        </div>

        <FloatingWhatsAppCTA />
      </div>
    </>
  );
};

export default UserPortalPreview;