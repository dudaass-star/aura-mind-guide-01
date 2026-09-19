import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import logoOlaAura from "@/assets/logo-ola-aura.png";

export default function PortalWhatsAppAccess() {
  const { session, loading } = usePortalAuth();
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (started.current || loading || session) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError(true);
      return;
    }
    (async () => {
      const { data, error: invokeError } = await supabasePortal.functions.invoke("portal-whatsapp-access", {
        body: { action: "consume", token },
      });
      if (invokeError || !data?.token_hash) {
        setError(true);
        return;
      }
      const { error: verifyError } = await supabasePortal.auth.verifyOtp({
        token_hash: data.token_hash,
        type: data.type === "signup" ? "signup" : "magiclink",
      });
      if (verifyError) setError(true);
    })();
  }, [loading, session]);

  if (session) return <Navigate to="/meu-espaco" replace />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <Helmet><title>Acesso seguro | Meu Espaço Aura</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="w-full max-w-sm text-center">
        <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto mx-auto mb-8" />
        {error ? (
          <>
            <ShieldCheck className="h-8 w-8 text-accent mx-auto mb-4" />
            <h1 className="font-['Fraunces'] text-2xl text-foreground mb-2">Esse link não está mais disponível</h1>
            <p className="text-sm text-muted-foreground font-['Nunito'] mb-6">Ele pode ter expirado ou já ter sido usado. Peça um novo link na tela de entrada.</p>
            <a href="/meu-espaco/entrar" className="text-sm text-accent underline font-['Nunito']">Voltar para entrar</a>
          </>
        ) : (
          <>
            <Loader2 className="h-7 w-7 animate-spin text-accent mx-auto mb-4" />
            <h1 className="font-['Fraunces'] text-2xl text-foreground mb-2">Abrindo seu espaço</h1>
            <p className="text-sm text-muted-foreground font-['Nunito']">Confirmando seu acesso com segurança…</p>
          </>
        )}
      </div>
    </div>
  );
}