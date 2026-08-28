import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Pause,
  XCircle,
  Sparkles,
  Heart,
  TrendingDown,
  Archive,
  MessageCircle,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
  gateway?: string;
}

interface CancellationReason {
  id: string;
  label: string;
}

interface Snapshot {
  theme: string;
  before_summary: string | null;
  after_summary: string | null;
  confidence: "low" | "medium" | "high";
}

interface ValueRecap {
  name: string | null;
  sessions_count: number;
  snapshots: Snapshot[];
}

type Status =
  | "idle"
  | "checking"
  | "recap"
  | "selecting_reason"
  | "offer_ladder"
  | "processing"
  | "success"
  | "already_active"
  | "already_canceling"
  | "already_paused"
  | "reactivation"
  | "error";

type Tier = "pause" | "discount_30" | "lite" | "base";

// Ordem de ofertas por motivo declarado
const OFFERS_BY_REASON: Record<string, Tier[]> = {
  expensive: ["discount_30", "lite", "base"],
  not_using: ["pause", "lite"],
  come_back_later: ["pause", "base"],
  not_satisfied: ["pause"],
  other: ["discount_30", "pause", "lite", "base"],
};

const CancelSubscription = () => {
  const [searchParams] = useSearchParams();
  // Ofertas de dunning chegam por WhatsApp como /cancelar?t=<token>&offer=<tier>.
  const offerParamRaw = searchParams.get("offer");
  const portalToken = searchParams.get("t");
  const highlightedTier: Tier | null =
    offerParamRaw === "discount_30" || offerParamRaw === "lite" || offerParamRaw === "base"
      ? offerParamRaw
      : null;
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [message, setMessage] = useState("");
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState<string>("");
  const [valueRecap, setValueRecap] = useState<ValueRecap | null>(null);
  const [discountAvailable, setDiscountAvailable] = useState<boolean>(true);
  const [gatewayUnsupported, setGatewayUnsupported] = useState<boolean>(false);
  const [needsNewCard, setNeedsNewCard] = useState<boolean>(false);
  const [reactivating, setReactivating] = useState<boolean>(false);
  const autoCheckedRef = useRef(false);

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

  const checkSubscription = async (opts?: { token?: string; skipToOffers?: boolean }) => {
    const digits = phone.replace(/\D/g, "");
    if (!opts?.token && digits.length < 10) {
      toast.error("Por favor, insira um número de telefone válido");
      return;
    }

    setStatus("checking");
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: opts?.token
          ? { token: opts.token, action: "check", offer: highlightedTier }
          : { phone: digits, action: "check", offer: highlightedTier },
      });

      if (error) throw error;

      if (data.success && data.status === "already_active") {
        setSubscription(data.subscription || null);
        setStatus("already_active");
        setMessage(data.message);
      } else if (data.success && data.status === "active") {
        setSubscription(data.subscription);
        // Preserva o gateway retornado pelo backend pra decisões de UI (nota PIX etc).
        if (data.gateway) {
          setSubscription({ ...data.subscription, gateway: data.gateway });
        }
        setReasons(data.reasons || []);
        setValueRecap(data.value_recap || null);
        setDiscountAvailable(data.discount_available !== false);
        if (opts?.skipToOffers) {
          // Veio do link de oferta no WhatsApp: mostra a oferta prometida direto.
          setSelectedReason("expensive");
          setStatus("offer_ladder");
        } else {
          setStatus("recap");
        }
      } else if (data.success && data.status === "canceling") {
        setSubscription(data.subscription);
        setStatus("already_canceling");
        setMessage(data.message);
      } else if (data.success && data.status === "paused") {
        setSubscription(data.subscription);
        setStatus("already_paused");
        setMessage(data.message);
      } else if (data.status === "no_gateway_subscription") {
        // Assinatura não está mais ativa no gateway, mas a oferta prometida
        // no WhatsApp continua valendo: vira fluxo de reativação.
        setStatus("reactivation");
        setMessage(data.message || "");
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

  // Link de oferta do WhatsApp (/cancelar?t=<token>&offer=<tier>): identifica
  // o usuário pelo token e leva direto pra oferta prometida na mensagem.
  useEffect(() => {
    if (autoCheckedRef.current || !portalToken) return;
    autoCheckedRef.current = true;
    void checkSubscription({ token: portalToken, skipToOffers: !!highlightedTier });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalToken, highlightedTier]);

  const runAction = async (
    action:
      | "pause"
      | "apply_discount_3m"
      | "downgrade_to_lite"
      | "downgrade_to_base"
      | "cancel",
    extra: Record<string, unknown> = {}
  ) => {
    const digits = phone.replace(/\D/g, "");
    setStatus("processing");
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: {
          ...(digits.length >= 10 ? { phone: digits } : { token: portalToken }),
          action,
          reason: selectedReason || null,
          reason_detail: reasonDetail || null,
          ...extra,
        },
      });

      if (error) throw error;

      if (data.gateway_unsupported) {
        setGatewayUnsupported(true);
        setMessage(data.message);
        setStatus("error");
        return;
      }

      if (data.needs_new_card) {
        setNeedsNewCard(true);
        setMessage(data.message || "Precisamos atualizar sua forma de pagamento antes de continuar.");
        setStatus("error");
        return;
      }

      if (data.success) {
        // PIX Automático: a oferta aceita vira um QR novo (mandato no valor da
        // oferta), então mandamos o cliente direto pra tela de pagamento.
        if (data.redirect_url) {
          window.location.href = data.redirect_url as string;
          return;
        }
        setStatus("success");
        setMessage(data.message);
        if (data.subscription) setSubscription(data.subscription);
      } else {
        setStatus("error");
        setMessage(data.message || "Não consegui aplicar essa opção agora.");
      }
    } catch (err) {
      console.error(`Error running ${action}:`, err);
      setStatus("error");
      setMessage("Algo deu errado. Tente novamente em instantes.");
    }
  };

  const resetForm = () => {
    setReactivating(false);
    autoCheckedRef.current = true; // não reabre o fluxo por token depois de reset
    setStatus("idle");
    setSubscription(null);
    setMessage("");
    setPhone("");
    setSelectedReason("");
    setReasonDetail("");
    setValueRecap(null);
    setDiscountAvailable(true);
    setGatewayUnsupported(false);
    setNeedsNewCard(false);
  };

  // Reativação: cria o checkout no preço da oferta prometida no WhatsApp.
  const runReactivation = async () => {
    if (!highlightedTier) return;
    setReactivating(true);
    try {
      const digits = phone.replace(/\D/g, "");
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: {
          ...(digits.length >= 10 ? { phone: digits } : { token: portalToken }),
          action: "reactivate",
          offer: highlightedTier,
        },
      });
      if (error) throw error;
      if (data?.success && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(data?.message || "Não consegui abrir sua reativação agora.");
    } catch (err) {
      console.error("Error reactivating:", err);
      toast.error("Algo deu errado. Tente novamente em instantes.");
    } finally {
      setReactivating(false);
    }
  };

  const OFFER_LABELS: Record<Tier, { title: string; description: string }> = {
    pause: { title: "Pausar por um tempo", description: "Sem cobrança durante a pausa." },
    discount_30: {
      title: "30% de desconto por 3 meses",
      description: "Volta pro seu plano com um respiro no valor. Depois o preço normaliza.",
    },
    lite: {
      title: "Plano Lite — R$ 19,90/mês",
      description: "1 sessão por mês e seu histórico inteiro preservado.",
    },
    base: {
      title: "Plano Base — R$ 9,90/mês",
      description: "30 mensagens por mês com a Aura, sem perder sua memória e seu percurso.",
    },
  };

  const baseOfferList: Tier[] = selectedReason
    ? OFFERS_BY_REASON[selectedReason] || OFFERS_BY_REASON.other
    : [];
  // A oferta que veio no link entra sempre em primeiro lugar.
  const offerList: Tier[] = highlightedTier
    ? [highlightedTier, ...baseOfferList.filter((t) => t !== highlightedTier)]
    : baseOfferList;

  const renderOfferCard = (tier: Tier) => {
    if (tier === "discount_30" && !discountAvailable) return null;
    const highlight = tier === highlightedTier ? " ring-2 ring-primary ring-offset-2 ring-offset-background" : "";

    if (tier === "pause") {
      return (
        <div key="pause" className={`rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3${highlight}`}>
          <div className="flex items-start gap-3">
            <Pause className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Pausar por um tempo</p>
              <p className="text-sm text-muted-foreground">
                Sem cobrança durante a pausa. Seu histórico fica guardado e a Aura te espera.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[30, 60, 90].map((d) => (
              <Button
                key={d}
                variant="outline"
                size="sm"
                onClick={() => runAction("pause", { pause_days: d })}
              >
                {d} dias
              </Button>
            ))}
          </div>
        </div>
      );
    }

    if (tier === "discount_30") {
      return (
        <div key="discount" className={`rounded-lg border border-primary/30 bg-primary/10 p-4 space-y-3${highlight}`}>
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">30% de desconto por 3 meses</p>
              <p className="text-sm text-muted-foreground">
                Mantém seu plano atual com um respiro no valor. Depois volta ao normal.
              </p>
            </div>
          </div>
          <Button className="w-full" onClick={() => runAction("apply_discount_3m")}>
            Quero o desconto
          </Button>
        </div>
      );
    }

    if (tier === "lite") {
      return (
        <div key="lite" className={`rounded-lg border border-border bg-muted/30 p-4 space-y-3${highlight}`}>
          <div className="flex items-start gap-3">
            <TrendingDown className="w-5 h-5 text-foreground/70 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Plano Lite — R$ 19,90/mês</p>
              <p className="text-sm text-muted-foreground">
                Continua com a Aura de forma mais leve, mantendo seu histórico e seus insights.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A troca começa um ciclo novo hoje: cobramos R$ 19,90 agora e, se você já pagou o mês
                atual, ele segue valendo.
              </p>
            </div>

          </div>
          <Button variant="outline" className="w-full" onClick={() => runAction("downgrade_to_lite")}>
            Mudar para o Lite
          </Button>
        </div>
      );
    }

    if (tier === "base") {
      return (
        <div key="base" className={`rounded-lg border border-border bg-muted/30 p-4 space-y-3${highlight}`}>
          <div className="flex items-start gap-3">
            <Archive className="w-5 h-5 text-foreground/70 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Plano Base — R$ 9,90/mês</p>
              <p className="text-sm text-muted-foreground">
                Um acompanhamento mínimo pra não perder seu histórico e conseguir voltar quando quiser.
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={() => runAction("downgrade_to_base")}>
            Mudar para o Base
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Helmet>
        <title>Cancelar Assinatura | AURA</title>
        <meta name="description" content="Cancele sua assinatura AURA" />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
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
              <CardTitle className="text-2xl font-display">Antes de você decidir</CardTitle>
              <CardDescription>
                {status === "idle" && "Informe seu telefone para verificar sua assinatura"}
                {status === "checking" && "Buscando sua história..."}
                {status === "recap" && "Um pouco do seu percurso"}
                {status === "selecting_reason" && "O que te fez pensar em sair?"}
                {status === "offer_ladder" && "Escolha o que faz mais sentido pra você"}
                {status === "processing" && "Processando..."}
                {status === "success" && "Prontinho"}
                {status === "already_active" && "Assinatura ativa"}
                {status === "already_canceling" && "Cancelamento já solicitado"}
                {status === "already_paused" && "Assinatura pausada"}
                {status === "reactivation" && "Sua oferta continua de pé"}
                {status === "error" && "Ops!"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* 1. Phone input */}
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
                  <Button onClick={() => checkSubscription()} className="w-full" size="lg">
                    Verificar Assinatura
                  </Button>
                </div>
              )}

              {/* Loading */}
              {(status === "checking" || status === "processing") && (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Só um instante...</p>
                </div>
              )}

              {/* 2. Value recap */}
              {status === "recap" && subscription && (
                <div className="space-y-6">
                  {valueRecap && (valueRecap.sessions_count > 0 || valueRecap.snapshots.length > 0) ? (
                    <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">
                          {valueRecap.name ? `${valueRecap.name},` : "Ei,"} vale lembrar
                        </p>
                      </div>
                      {valueRecap.sessions_count > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Vocês já fizeram{" "}
                          <span className="font-semibold text-foreground">
                            {valueRecap.sessions_count} sessõe{valueRecap.sessions_count === 1 ? "" : "s"}
                          </span>{" "}
                          juntos. Isso é história — e ela fica com você.
                        </p>
                      )}
                      {valueRecap.snapshots.slice(0, 2).map((snap, i) => (
                        <div key={i} className="text-sm text-muted-foreground border-l-2 border-primary/30 pl-3">
                          <span className="font-medium text-foreground/80">{snap.theme}:</span>{" "}
                          {snap.after_summary || snap.before_summary}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plano</span>
                      <span className="font-medium">{subscription.plan}</span>
                    </div>
                    {subscription.amount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor</span>
                        <span className="font-medium">{subscription.amount}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Próxima cobrança</span>
                      <span className="font-medium">{subscription.endDateFormatted}</span>
                    </div>
                  </div>

                  {subscription.gateway === "asaas_pix" && (
                    <p className="text-xs text-muted-foreground text-center">
                      Você paga via PIX recorrente — o QR chega automático no próximo vencimento.
                    </p>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={resetForm} className="flex-1">
                      Ficar como está
                    </Button>
                    <Button variant="secondary" onClick={() => setStatus("selecting_reason")} className="flex-1">
                      Continuar
                    </Button>
                  </div>
                </div>
              )}

              {/* 3. Reason selection */}
              {status === "selecting_reason" && (
                <div className="space-y-6">
                  <p className="text-sm text-muted-foreground text-center">
                    Isso ajuda a Aura a te oferecer o caminho certo — e nos ajuda a melhorar.
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
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStatus("recap")} className="flex-1">
                      Voltar
                    </Button>
                    <Button
                      disabled={!selectedReason}
                      onClick={() => setStatus("offer_ladder")}
                      className="flex-1"
                    >
                      Continuar
                    </Button>
                  </div>
                </div>
              )}

              {/* 4. Offer ladder */}
              {status === "offer_ladder" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    {highlightedTier
                      ? "Sua condição especial está reservada aqui:"
                      : "Algumas opções antes de cancelar:"}
                  </p>
                  {offerList.map(renderOfferCard)}
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <Button
                      variant="ghost"
                      onClick={() => runAction("cancel")}
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancelar mesmo assim
                    </Button>
                    <Button variant="outline" onClick={() => setStatus("selecting_reason")} className="w-full">
                      Voltar
                    </Button>
                  </div>
                </div>
              )}

              {/* Success */}
              {status === "success" && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center py-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="text-center text-muted-foreground">{message}</p>
                  </div>
                  <Button onClick={resetForm} variant="outline" className="w-full">
                    Voltar ao início
                  </Button>
                </div>
              )}

              {/* Already active */}
              {status === "already_active" && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 flex gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-sm space-y-2">
                      <p className="font-medium text-foreground">Está tudo certo com sua assinatura.</p>
                      <p className="text-muted-foreground">
                        {message || "Sua assinatura já está ativa. Essa oferta era para reativação e não precisa ser aplicada agora."}
                      </p>
                    </div>
                  </div>
                  {subscription?.plan && (
                    <div className="bg-muted/50 rounded-lg p-4 text-sm flex justify-between">
                      <span className="text-muted-foreground">Plano atual</span>
                      <span className="font-medium capitalize">{subscription.plan}</span>
                    </div>
                  )}
                  <div className="space-y-3">
                    <Link to={portalToken ? `/meu-espaco?t=${portalToken}` : "/meu-espaco"} className="block">
                      <Button className="w-full">Ir para meu espaço</Button>
                    </Link>
                    <a
                      href="https://wa.me/16625255005?text=Oi%2C%20preciso%20de%20ajuda%20com%20minha%20assinatura"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button variant="outline" className="w-full">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Falar com o suporte
                      </Button>
                    </a>
                  </div>
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

              {/* Error */}
              {status === "reactivation" && highlightedTier && (
                <div className="space-y-6">
                  <p className="text-sm text-muted-foreground text-center">
                    Sua assinatura não está mais ativa — mas a oferta que te mandamos no
                    WhatsApp vale pra voltar agora, com todo o seu histórico intacto.
                  </p>
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">
                          {OFFER_LABELS[highlightedTier].title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {OFFER_LABELS[highlightedTier].description}
                        </p>
                      </div>
                    </div>
                    <Button className="w-full" onClick={runReactivation} disabled={reactivating}>
                      {reactivating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Abrindo...
                        </>
                      ) : (
                        "Reativar com essa oferta"
                      )}
                    </Button>
                  </div>
                  <a
                    href="https://wa.me/16625255005?text=Oi%2C%20preciso%20de%20ajuda%20com%20minha%20assinatura"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button variant="outline" className="w-full">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Prefiro falar com o suporte
                    </Button>
                  </a>
                </div>
              )}
              {status === "error" && (
                <div className="space-y-6">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                    <p className="text-destructive">{message}</p>
                  </div>
                  {(gatewayUnsupported || !!portalToken) && (
                    <a
                      href="https://wa.me/16625255005?text=Oi%2C%20preciso%20de%20ajuda%20com%20minha%20assinatura"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button className="w-full">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Falar com o suporte
                      </Button>
                    </a>
                  )}
                  {needsNewCard && (
                    <a href="/checkout" className="block">
                      <Button className="w-full">
                        Atualizar forma de pagamento
                      </Button>
                    </a>
                  )}
                  <Button onClick={resetForm} className="w-full">
                    Tentar novamente
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
