import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import avatarAura from "@/assets/avatar-aura.jpg";

export default function DemoInviteAccess() {
  const { session, loading } = usePortalAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (loading || session) return;
    const token = searchParams.get("token");
    if (!token) {
      setError(true);
      return;
    }

    let cancelled = false;
    const enter = async () => {
      const { data, error: invokeError } = await supabasePortal.functions.invoke("demo-access-invite", {
        body: { action: "consume", token },
      });
      if (cancelled) return;
      if (invokeError || !data?.token_hash) {
        setError(true);
        return;
      }

      const { error: verifyError } = await supabasePortal.auth.verifyOtp({
        token_hash: data.token_hash,
        type: data.type || "magiclink",
      });
      if (cancelled) return;
      if (verifyError) {
        setError(true);
        return;
      }
      navigate("/meu-espaco?tab=conversar", { replace: true });
    };

    void enter();
    return () => { cancelled = true; };
  }, [loading, navigate, searchParams, session]);

  if (session) return <Navigate to="/meu-espaco?tab=conversar" replace />;

  return (
    <div className="portal-chat-theme flex min-h-dvh items-center justify-center bg-background px-5">
      <Helmet>
        <title>Acesso à demonstração | Olá Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm text-center">
        <img src={logoOlaAura} alt="Olá AURA" className="mx-auto mb-8 h-9 w-auto" />
        <img src={avatarAura} alt="AURA" className="mx-auto mb-4 h-16 w-16 rounded-full object-cover ring-4 ring-secondary" />
        {error ? (
          <>
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
            <h1 className="mb-2 font-display text-2xl font-semibold text-foreground">Este convite não está mais disponível</h1>
            <p className="mb-5 font-body text-sm text-muted-foreground">Peça um novo link de acesso à equipe Olá Aura.</p>
            <Button className="h-11 w-full font-body" onClick={() => navigate("/v2", { replace: true })}>Conhecer a Olá Aura</Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-4 h-7 w-7 animate-spin text-primary" />
            <h1 className="mb-2 font-display text-2xl font-semibold text-foreground">Abrindo a demonstração</h1>
            <p className="font-body text-sm text-muted-foreground">Preparando sua entrada no app Olá Aura…</p>
          </>
        )}
      </div>
    </div>
  );
}