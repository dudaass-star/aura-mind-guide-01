import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { migrateDefaultSessionToPortal } from "@/contexts/portalSessionBridge";
import logoOlaAura from "@/assets/logo-ola-aura.png";

export default function PortalAuthCallback() {
  const { session, loading } = usePortalAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loading || session) return;

    let cancelled = false;
    const finishLogin = async () => {
      const migrated = await migrateDefaultSessionToPortal();
      if (cancelled) return;
      if (migrated) {
        navigate("/meu-espaco", { replace: true });
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
  }, [loading, navigate, session]);

  if (session) return <Navigate to="/meu-espaco" replace />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <Helmet>
        <title>Confirmando acesso | Meu Espaço Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm text-center">
        <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto mx-auto mb-8" />
        {timedOut ? (
          <>
            <ShieldCheck className="h-8 w-8 text-accent mx-auto mb-4" />
            <h1 className="font-['Fraunces'] text-2xl text-foreground mb-2">Vamos tentar novamente</h1>
            <p className="text-sm text-muted-foreground font-['Nunito'] mb-5">
              A confirmação do Google não terminou neste navegador.
            </p>
            <Button onClick={() => navigate("/meu-espaco/entrar", { replace: true })} className="w-full h-11 font-['Nunito']">
              Voltar para entrar
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-accent mx-auto mb-4" />
            <h1 className="font-['Fraunces'] text-2xl text-foreground mb-2">Abrindo seu espaço</h1>
            <p className="text-sm text-muted-foreground font-['Nunito']">Confirmando sua entrada com segurança…</p>
          </>
        )}
      </div>
    </div>
  );
}