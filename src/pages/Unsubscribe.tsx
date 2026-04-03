import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type Status = "loading" | "valid" | "already_unsubscribed" | "invalid" | "success" | "error";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: anonKey } }
        );
        const data = await response.json();

        if (!response.ok) {
          setStatus("invalid");
        } else if (data.valid === false && data.reason === "already_unsubscribed") {
          setStatus("already_unsubscribed");
        } else if (data.valid) {
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("error");
      }
    };

    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });

      if (error) {
        setStatus("error");
      } else if (data?.success) {
        setStatus("success");
      } else if (data?.reason === "already_unsubscribed") {
        setStatus("already_unsubscribed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Cancelar inscrição - AURA</title>
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            💜 AURA
          </h1>

          {status === "loading" && (
            <div className="space-y-4">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">Verificando...</p>
            </div>
          )}

          {status === "valid" && (
            <div className="space-y-4">
              <p className="text-foreground">
                Deseja parar de receber nossos emails?
              </p>
              <Button
                onClick={handleUnsubscribe}
                disabled={isProcessing}
                variant="sage"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processando...
                  </>
                ) : (
                  "Confirmar cancelamento"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Você não receberá mais emails da AURA.
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <CheckCircle className="w-12 h-12 text-primary mx-auto" />
              <p className="text-foreground font-medium">Pronto!</p>
              <p className="text-muted-foreground">
                Você foi removido da nossa lista de emails. Sentiremos sua falta. 💜
              </p>
            </div>
          )}

          {status === "already_unsubscribed" && (
            <div className="space-y-4">
              <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto" />
              <p className="text-foreground font-medium">Já cancelado</p>
              <p className="text-muted-foreground">
                Você já cancelou a inscrição anteriormente.
              </p>
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-4">
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <p className="text-foreground font-medium">Link inválido</p>
              <p className="text-muted-foreground">
                Este link de cancelamento é inválido ou expirou.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <XCircle className="w-12 h-12 text-destructive mx-auto" />
              <p className="text-foreground font-medium">Erro</p>
              <p className="text-muted-foreground">
                Ocorreu um erro. Tente novamente mais tarde.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Unsubscribe;
