import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SubscriptionInfo {
  id: string;
  plan: string;
  endDate: string;
  endDateFormatted: string;
  amount?: string;
}

type Status = "idle" | "checking" | "found" | "canceling" | "canceled" | "already_canceling" | "error";

const CancelSubscription = () => {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [message, setMessage] = useState("");

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const checkSubscription = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Por favor, insira um número de telefone válido");
      return;
    }

    setStatus("checking");
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: { phone: digits, action: "check" },
      });

      if (error) throw error;

      if (data.success && data.status === "active") {
        setSubscription(data.subscription);
        setStatus("found");
      } else if (data.success && data.status === "canceling") {
        setSubscription(data.subscription);
        setStatus("already_canceling");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.message || "Nenhuma assinatura encontrada");
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
      setStatus("error");
      setMessage("Erro ao verificar assinatura. Tente novamente.");
    }
  };

  const cancelSubscription = async () => {
    const digits = phone.replace(/\D/g, "");
    setStatus("canceling");

    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: { phone: digits, action: "cancel" },
      });

      if (error) throw error;

      if (data.success) {
        setStatus("canceled");
        setMessage(data.message);
        setSubscription(data.subscription);
      } else {
        setStatus("error");
        setMessage(data.message || "Erro ao cancelar assinatura");
      }
    } catch (error) {
      console.error("Error canceling subscription:", error);
      setStatus("error");
      setMessage("Erro ao cancelar assinatura. Tente novamente.");
    }
  };

  const resetForm = () => {
    setStatus("idle");
    setSubscription(null);
    setMessage("");
    setPhone("");
  };

  return (
    <>
      <Helmet>
        <title>Cancelar Assinatura | AURA</title>
        <meta name="description" content="Cancele sua assinatura AURA" />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>

          <Card className="border-border/50">
            <CardHeader className="text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
                <span className="text-primary font-display font-bold text-2xl">A</span>
              </div>
              <CardTitle className="text-2xl font-display">Cancelar Assinatura</CardTitle>
              <CardDescription>
                {status === "idle" && "Informe seu telefone para verificar sua assinatura"}
                {status === "checking" && "Verificando sua assinatura..."}
                {status === "found" && "Assinatura encontrada"}
                {status === "canceling" && "Processando cancelamento..."}
                {status === "canceled" && "Assinatura cancelada"}
                {status === "already_canceling" && "Cancelamento já solicitado"}
                {status === "error" && "Ops!"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Phone input step */}
              {status === "idle" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium text-foreground">
                      Telefone (WhatsApp)
                    </label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={phone}
                      onChange={handlePhoneChange}
                      className="text-center text-lg"
                    />
                  </div>
                  <Button onClick={checkSubscription} className="w-full" size="lg">
                    Verificar Assinatura
                  </Button>
                </div>
              )}

              {/* Loading state */}
              {(status === "checking" || status === "canceling") && (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">
                    {status === "checking" ? "Buscando sua assinatura..." : "Processando cancelamento..."}
                  </p>
                </div>
              )}

              {/* Subscription found - confirmation step */}
              {status === "found" && subscription && (
                <div className="space-y-6">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Plano</span>
                      <span className="font-medium">{subscription.plan}</span>
                    </div>
                    {subscription.amount && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Valor</span>
                        <span className="font-medium">{subscription.amount}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Próxima cobrança</span>
                      <span className="font-medium">{subscription.endDateFormatted}</span>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-500 mb-1">Atenção</p>
                      <p className="text-muted-foreground">
                        Ao cancelar, você continuará tendo acesso até {subscription.endDateFormatted}. Após esta data, o acesso será encerrado.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={resetForm} className="flex-1">
                      Voltar
                    </Button>
                    <Button variant="destructive" onClick={cancelSubscription} className="flex-1">
                      Confirmar Cancelamento
                    </Button>
                  </div>
                </div>
              )}

              {/* Already canceling */}
              {status === "already_canceling" && subscription && (
                <div className="space-y-6">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-muted-foreground">
                        {message || `Sua assinatura será encerrada em ${subscription.endDateFormatted}.`}
                      </p>
                    </div>
                  </div>
                  <Button onClick={resetForm} className="w-full">
                    Voltar ao Início
                  </Button>
                </div>
              )}

              {/* Success state */}
              {status === "canceled" && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center py-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-center text-muted-foreground">{message}</p>
                  </div>
                  <Button onClick={resetForm} variant="outline" className="w-full">
                    Voltar ao Início
                  </Button>
                </div>
              )}

              {/* Error state */}
              {status === "error" && (
                <div className="space-y-6">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                    <p className="text-destructive">{message}</p>
                  </div>
                  <Button onClick={resetForm} className="w-full">
                    Tentar Novamente
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Precisa de ajuda?{" "}
            <a href="mailto:suporte@aura.app" className="text-primary hover:underline">
              Entre em contato
            </a>
          </p>
        </div>
      </div>
    </>
  );
};

export default CancelSubscription;
