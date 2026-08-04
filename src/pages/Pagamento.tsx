import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import { Loader2, AlertCircle } from "lucide-react";

// Página de redirect: recebe ?t=<token> de mensagens (Twilio CTA, email)
// e redireciona automaticamente pro Stripe Billing Portal pra atualização
// do método de pagamento.
const Pagamento = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Link inválido. Abra pelo link que você recebeu na mensagem.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "customer-portal",
          { body: { token } },
        );
        if (cancelled) return;
        if (fnError) throw fnError;
        if (!data?.url) throw new Error("Link não recebido");
        window.location.replace(data.url);
      } catch (err: any) {
        if (cancelled) return;
        const msg =
          err?.context?.error ||
          err?.message ||
          "Não foi possível abrir agora. Tente de novo em instantes.";
        setError(typeof msg === "string" ? msg : "Não foi possível abrir agora.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <>
      <Helmet>
        <title>Atualizar pagamento | Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <img src={logoOlaAura} alt="Olá AURA" className="h-14 w-auto mb-8" />

        {!error ? (
          <div className="text-center max-w-sm animate-fade-in">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-foreground mb-1 font-['Fraunces']">
              Abrindo seu pagamento seguro
            </h1>
            <p className="text-sm text-muted-foreground font-['Nunito']">
              Te levando pro ambiente seguro de pagamento pra você atualizar ou quitar sua cobrança…
            </p>
          </div>
        ) : (
          <div className="text-center max-w-md animate-fade-in">
            <div className="bg-muted rounded-full p-4 w-16 h-16 mx-auto flex items-center justify-center mb-4">
              <AlertCircle size={28} className="text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2 font-['Fraunces']">
              Não foi possível abrir
            </h1>
            <p className="text-muted-foreground font-['Nunito'] mb-4">{error}</p>
            <p className="text-xs text-muted-foreground font-['Nunito']">
              Se o problema continuar, responda no WhatsApp que a gente te ajuda.
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default Pagamento;