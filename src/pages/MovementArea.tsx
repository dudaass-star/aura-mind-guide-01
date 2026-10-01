import { Navigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { PortalLoading } from "@/components/portal/shared";
import { MovementDashboard } from "@/components/movement/MovementDashboard";
import logoOlaAura from "@/assets/logo-ola-aura-horizontal.png";
import { Link } from "react-router-dom";

export default function MovementArea() {
  const { session, loading } = usePortalAuth();
  const [params] = useSearchParams();
  if (loading) return <PortalLoading />;
  if (!session) return <Navigate to={`/meu-espaco/entrar?destino=movimento${params.get("por") ? `&por=${encodeURIComponent(params.get("por") || "")}` : ""}${params.get("papel") === "embaixador" ? "&papel=embaixador" : ""}`} replace />;
  return <div className="portal-chat-theme min-h-dvh bg-background text-foreground"><Helmet><title>Seu Movimento | Olá Aura</title><meta name="robots" content="noindex, nofollow" /></Helmet><header className="border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"><Link to="/movimento"><img src={logoOlaAura} alt="Olá Aura" className="h-7 w-auto" /></Link><Link to="/movimento" className="text-sm font-semibold text-primary">Sobre o Movimento</Link></div></header><MovementDashboard userId={session.user.id} suggestedName={session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || ""} initialAmbassadorIntent={params.get("papel") === "embaixador"} /></div>;
}
