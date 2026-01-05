import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, Loader2, ArrowLeft, Pause, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SubscriptionInfo {
  id: string;
  plan: string;
  endDate?: string;
  endDateFormatted?: string;
  amount?: string;
  resumesAt?: string;
  resumesAtFormatted?: string;
}

interface CancellationReason {
  id: string;
  label: string;
}

type Status = "idle" | "checking" | "found" | "selecting_reason" | "canceling" | "pausing" | "canceled" | "paused" | "already_canceling" | "already_paused" | "error";

const CancelSubscription = () => {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState<string>("");

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
        setReasons(data.reasons || []);
        setStatus("found");
      } else if (data.success && data.status === "canceling") {
        setSubscription(data.subscription);
        setStatus("already_canceling");
        setMessage(data.message);
      } else if (data.success && data.status === "paused") {
        setSubscription(data.subscription);
        setStatus("already_paused");
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

  const goToReasonSelection = () => {
    setStatus("selecting_reason");
  };

  const pauseSubscription = async () => {
    const digits = phone.replace(/\D/g, "");
    setStatus("pausing");

    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: { 
          phone: digits, 
          action: "pause",
          reason: selectedReason,
          reason_detail: reasonDetail || null,
        },
      });

      if (error) throw error;

      if (data.success) {
        setStatus("paused");
        setMessage(data.message);
        setSubscription(data.subscription);
      } else {
        setStatus("error");
        setMessage(data.message || "Erro ao pausar assinatura");
      }
    } catch (error) {
      console.error("Error pausing subscription:", error);
      setStatus("error");
      setMessage("Erro ao pausar assinatura. Tente novamente.");
    }
  };

  const cancelSubscription = async () => {
    const digits = phone.replace(/\D/g, "");
    setStatus("canceling");

    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: { 
          phone: digits, 
          action: "cancel",
          reason: selectedReason,
          reason_detail: reasonDetail || null,
        },
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
    setSelectedReason("");
    setReasonDetail("");
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
                {status === "selecting_reason" && "Por que você quer cancelar?"}
                {(status === "canceling" || status === "pausing") && "Processando..."}
                {status === "canceled" && "Assinatura cancelada"}
                {status === "paused" && "Assinatura pausada"}
                {status === "already_canceling" && "Cancelamento já solicitado"}
                {status === "already_paused" && "Assinatura pausada"}
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
              {(status === "checking" || status === "canceling" || status === "pausing") && (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">
                    {status === "checking" && "Buscando sua assinatura..."}
                    {status === "canceling" && "Processando cancelamento..."}
                    {status === "pausing" && "Pausando assinatura..."}
                  </p>
                </div>
              )}

              {/* Subscription found - show info */}
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
                    <Button variant="destructive" onClick={goToReasonSelection} className="flex-1">
                      Continuar
                    </Button>
                  </div>
                </div>
              )}

              {/* Reason selection step */}
              {status === "selecting_reason" && (
                <div className="space-y-6">
                  <p className="text-sm text-muted-foreground text-center">
                    Seu feedback é muito importante pra gente melhorar! 💜
                  </p>

                  <div className="space-y-2">
                    {reasons.map((reason) => (
                      <button
                        key={reason.id}
                        onClick={() => setSelectedReason(reason.id)}
                        className={`w-full p-3 rounded-lg border text-left transition-colors ${
                          selectedReason === reason.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border hover:border-primary/50 text-muted-foreground"
                        }`}
                      >
                        {reason.label}
                      </button>
                    ))}
                  </div>

                  {selectedReason === "other" && (
                    <Input
                      placeholder="Conte-nos mais..."
                      value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value)}
                    />
                  )}

                  {selectedReason && (
                    <div className="space-y-3">
                      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Pause className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-primary mb-1">Que tal uma pausa?</p>
                            <p className="text-muted-foreground">
                              Você pode pausar sua assinatura por 30 dias sem perder nenhum benefício. Quando voltar, é só continuar de onde parou!
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setStatus("found")} className="flex-1">
                          Voltar
                        </Button>
                        <Button onClick={pauseSubscription} className="flex-1">
                          <Pause className="w-4 h-4 mr-2" />
                          Pausar 30 dias
                        </Button>
                      </div>

                      <Button 
                        variant="ghost" 
                        onClick={cancelSubscription} 
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancelar mesmo assim
                      </Button>
                    </div>
                  )}

                  {!selectedReason && (
                    <Button variant="outline" onClick={() => setStatus("found")} className="w-full">
                      Voltar
                    </Button>
                  )}
                </div>
              )}

              {/* Paused state */}
              {status === "paused" && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center py-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Pause className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-center text-muted-foreground">{message}</p>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center text-sm">
                    <p className="text-muted-foreground">
                      Você receberá uma notificação antes da assinatura ser reativada.
                    </p>
                  </div>
                  <Button onClick={resetForm} variant="outline" className="w-full">
                    Voltar ao Início
                  </Button>
                </div>
              )}

              {/* Already paused */}
              {status === "already_paused" && subscription && (
                <div className="space-y-6">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex gap-3">
                    <Pause className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-muted-foreground">
                        {message || `Sua assinatura será reativada em ${subscription.resumesAtFormatted}.`}
                      </p>
                    </div>
                  </div>
                  <Button onClick={resetForm} className="w-full">
                    Voltar ao Início
                  </Button>
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
