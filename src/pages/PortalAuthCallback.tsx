import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { migrateDefaultSessionToPortal } from "@/contexts/portalSessionBridge";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import avatarAura from "@/assets/avatar-aura.jpg";

export default function PortalAuthCallback() {
  const { session, loading } = usePortalAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);
  const requestedDestination = searchParams.get("destino") || sessionStorage.getItem("aura-portal-destination");
  const destination = requestedDestination?.startsWith("/movimento/area") ? requestedDestination : "/meu-espaco";
  const isMovementEntry = destination.startsWith("/movimento/area");

  useEffect(() => {
    if (loading || session) return;

    let cancelled = false;
    const finishLogin = async () => {
      const migrated = await migrateDefaultSessionToPortal();
      if (cancelled) return;
      if (migrated) {
        sessionStorage.removeItem("aura-portal-destination");
        navigate(destination, { replace: true });
        return;
      }
      window.setTimeout(() => {
        if (!cancelled) setTimedOut(true);
      }, 4000);
    };

    void finishLogin();
    return () => {
      cancelled = true;
    };
  }, [destination, loading, navigate, session]);

  if (session) {
    sessionStorage.removeItem("aura-portal-destination");
    return <Navigate to={destination} replace />;
  }

  return (
    <div className="portal-chat-theme min-h-dvh bg-background flex items-center justify-center px-5">
      <Helmet>
        <title>Confirmando acesso | Olá Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm text-center">
        <img src={logoOlaAura} alt="Olá AURA" className="h-9 w-auto mx-auto mb-8" />
        <img src={avatarAura} alt="AURA" className="h-16 w-16 rounded-full object-cover ring-4 ring-secondary mx-auto mb-4" />
        {timedOut ? (
          <>
            <ShieldCheck className="h-8 w-8 text-primary mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">Vamos tentar novamente</h1>
            <p className="text-sm text-muted-foreground font-body mb-5">
              A confirmação do Google não terminou neste navegador.
            </p>
            <Button onClick={() => navigate(`/meu-espaco/entrar${destination.startsWith("/movimento/area") ? `?destino=movimento${destination.includes("?por=") ? `&por=${encodeURIComponent(destination.split("?por=")[1] || "")}` : ""}` : ""}`, { replace: true })} className="w-full h-11 font-body">
              Voltar para entrar
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto mb-4" />
            <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
              {isMovementEntry ? "Abrindo o Movimento" : "Abrindo o Olá Aura"}
            </h1>
            <p className="text-sm text-muted-foreground font-body">
              {isMovementEntry ? "Preparando sua participação gratuita…" : "Confirmando sua entrada com segurança…"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}