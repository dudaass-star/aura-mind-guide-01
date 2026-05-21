import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, Shield, Lock, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { trackBeginCheckout, trackAddPaymentInfo, trackExitIntent, getGaClientId } from "@/lib/ga4";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import "@/styles/v2-theme.css";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingPeriod = "monthly" | "yearly";

interface PlanConfig {
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlyMonthlyEquivalent: string;
  yearlyDiscount: number;
  trialPrice: string;
  sessions: number;
  highlights: string[];
}

const plans: Record<PlanId, PlanConfig> = {
  essencial: {
    name: "Essencial",
    monthlyPrice: "29,90",
    yearlyPrice: "214,90",
    yearlyMonthlyEquivalent: "17,91",
    yearlyDiscount: 40,
    trialPrice: "6,90",
    sessions: 0,
    highlights: ["Conversas ilimitadas 24/7", "Check-in diário", "Review semanal"],
  },
  direcao: {
    name: "Direção",
    monthlyPrice: "49,90",
    yearlyPrice: "359,90",
    yearlyMonthlyEquivalent: "29,99",
    yearlyDiscount: 40,
    trialPrice: "9,90",
    sessions: 4,
    highlights: ["Tudo do Essencial", "4 Sessões Especiais/mês", "Resumo após cada sessão"],
  },
  transformacao: {
    name: "Transformação",
    monthlyPrice: "79,90",
    yearlyPrice: "574,90",
    yearlyMonthlyEquivalent: "47,91",
    yearlyDiscount: 40,
    trialPrice: "19,90",
    sessions: 8,
    highlights: ["Tudo do Direção", "8 Sessões Especiais/mês", "Prioridade no agendamento"],
  },
};

const CheckoutV2 = () => {
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const planFromUrl = searchParams.get("plan") as PlanId | null;
  const billingFromUrl = searchParams.get("billing") as BillingPeriod | null;
  const planFromState = location.state?.plan as PlanId | undefined;
  const billingFromState = location.state?.billing as BillingPeriod | undefined;

  const initialPlan = planFromUrl || planFromState || "direcao";
  const initialBilling = billingFromUrl || billingFromState || "monthly";

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBilling);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  // Estado do checkout embedado: clientSecret + promise da Stripe.js carregada com a chave pública
  // devolvida pela edge function. Quando setados, renderizamos <EmbeddedCheckout /> inline,
  // sem salto pro domínio checkout.stripe.com.
  const [embeddedClientSecret, setEmbeddedClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeJs | null> | null>(null);

  // ViewContent + GA4 begin_checkout no mount
  useEffect(() => {
    const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "ViewContent", {
        content_name: "Checkout Page V2",
        content_category: "checkout",
        value: trialPriceMap[selectedPlan],
        currency: "BRL",
      });
    }
    trackBeginCheckout({ plan: selectedPlan, value: trialPriceMap[selectedPlan] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit-intent (mesma regra do V1: desktop >= 768px)
  useEffect(() => {
    const exitShown = sessionStorage.getItem("aura_exit_popup_shown");
    if (exitShown) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasRedirected && !sessionStorage.getItem("aura_exit_popup_shown")) {
        sessionStorage.setItem("aura_exit_popup_shown", "true");
        setShowExitPopup(true);
        trackExitIntent("open");
      }
    };

    const handleVisibilityChange = () => {
      if (
        window.innerWidth >= 768 &&
        document.visibilityState === "hidden" &&
        !hasRedirected &&
        !sessionStorage.getItem("aura_exit_popup_shown")
      ) {
        sessionStorage.setItem("aura_exit_popup_shown", "true");
        setShowExitPopup(true);
        trackExitIntent("open");
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasRedirected]);

  const currentPlan = plans[selectedPlan];
  const currentPrice = billingPeriod === "monthly" ? currentPlan.monthlyPrice : currentPlan.yearlyPrice;
  const periodLabel = billingPeriod === "monthly" ? "mês" : "ano";

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Por favor, insira seu nome");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      toast.error("Por favor, insira um email válido");
      return;
    }

    if (phone.replace(/\D/g, "").length < 11) {
      toast.error("Por favor, insira um telefone válido");
      return;
    }

    setIsLoading(true);

    try {
      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return match ? match[2] : undefined;
      };
      const fbp = getCookie("_fbp");
      const fbc =
        getCookie("_fbc") ||
        (new URLSearchParams(window.location.search).get("fbclid")
          ? `fb.1.${Date.now()}.${new URLSearchParams(window.location.search).get("fbclid")}`
          : undefined);

      const leadEventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const icEventId = `ic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const userData = {
        email: email.trim(),
        phone: phone.replace(/\D/g, ""),
        first_name: name.trim().split(" ")[0],
        client_user_agent: navigator.userAgent,
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
      };

      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq(
          "track",
          "Lead",
          {
            content_name: `Trial ${plans[selectedPlan].name}`,
            content_category: "checkout",
            value: ({ essencial: 6.9, direcao: 9.9, transformacao: 19.9 } as Record<string, number>)[selectedPlan],
            currency: "BRL",
          },
          { eventID: leadEventId },
        );
        (window as any).fbq(
          "track",
          "InitiateCheckout",
          {
            content_name: `Trial ${plans[selectedPlan].name}`,
            content_category: "checkout",
            value: ({ essencial: 6.9, direcao: 9.9, transformacao: 19.9 } as Record<string, number>)[selectedPlan],
            currency: "BRL",
          },
          { eventID: icEventId },
        );
      }

      const capiPayload = {
        event_source_url: window.location.href,
        user_data: userData,
        custom_data: {
          content_name: `Trial ${plans[selectedPlan].name}`,
          content_category: "checkout",
          value: ({ essencial: 6.9, direcao: 9.9, transformacao: 19.9 } as Record<string, number>)[selectedPlan],
          currency: "BRL",
        },
      };

      Promise.all([
        supabase.functions.invoke("meta-capi", {
          body: { ...capiPayload, event_name: "Lead", event_id: leadEventId },
        }),
        supabase.functions.invoke("meta-capi", {
          body: { ...capiPayload, event_name: "InitiateCheckout", event_id: icEventId },
        }),
      ]).catch(() => {});

      const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
      trackAddPaymentInfo({ plan: selectedPlan, billing: billingPeriod, value: trialPriceMap[selectedPlan] });

      const gaClientId = getGaClientId();

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan: selectedPlan,
          billing: billingPeriod,
          trial: true,
          embedded: true,
          name: name.trim(),
          email: email.trim(),
          phone: phone,
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(gaClientId && { gaClientId }),
        },
      });

      if (error) throw new Error(error.message || "Erro ao processar pagamento");

      if (data?.clientSecret && data?.publishableKey) {
        // Persistimos os dados pra resgate caso o usuário recarregue durante o pagamento.
        localStorage.setItem(
          "aura_checkout",
          JSON.stringify({ name, phone, plan: selectedPlan, billing: billingPeriod, price: currentPrice }),
        );
        setHasRedirected(true);
        setStripePromise(loadStripe(data.publishableKey as string));
        setEmbeddedClientSecret(data.clientSecret as string);
        // Scroll suave pro topo do bloco de pagamento embed.
        requestAnimationFrame(() => {
          document.getElementById("embedded-checkout-block")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        throw new Error("clientSecret não recebido");
      }
    } catch (err) {
      console.error("Checkout V2 error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Options memoizado pra evitar re-mount do EmbeddedCheckoutProvider a cada render.
  const embeddedOptions = useMemo(
    () => (embeddedClientSecret ? { clientSecret: embeddedClientSecret } : null),
    [embeddedClientSecret],
  );

  const handleResetCheckout = useCallback(() => {
    setEmbeddedClientSecret(null);
    setStripePromise(null);
    setHasRedirected(false);
  }, []);

  const inputCls =
    "mt-1.5 bg-white/5 border-white/15 text-white placeholder:text-white/55 focus-visible:ring-1 focus-visible:ring-[hsl(140_18%_55%)]";

  return (
    <>
      <Helmet>
        <title>Checkout - AURA</title>
        <meta
          name="description"
          content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional."
        />
        <link rel="canonical" href="https://olaaura.com.br/v2/checkout" />
        <meta property="og:url" content="https://olaaura.com.br/v2/checkout" />
        <meta property="og:title" content="Checkout - AURA" />
        <meta property="og:description" content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional." />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="v2-theme min-h-screen bg-[hsl(220_35%_8%)] text-white">
        {/* Glow decorativo no topo */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, hsl(140 22% 35% / 0.35) 0%, transparent 70%)",
          }}
          aria-hidden
        />

        <header className="relative py-5 border-b border-white/10">
          <div className="container mx-auto px-6 flex items-center justify-between">
            <Link
              to="/v2"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Voltar</span>
            </Link>
            <Link to="/v2" className="flex items-center">
              <img
                src={logoOlaAura}
                alt="Olá AURA"
                className="h-14 w-auto brightness-0 invert"
              />
            </Link>
            <div className="w-16" />
          </div>
        </header>

        <div className="relative container mx-auto px-4 py-8 md:py-12 pb-32 md:pb-12">
          <div className="max-w-xl mx-auto">
            {/* Cabeçalho enxuto */}
            <div className="text-center mb-6">
              <h1 className="font-display text-2xl md:text-3xl font-semibold mb-2 tracking-tight">
                {embeddedClientSecret ? "Confirme e pague" : "Comece em 2 minutos"}
              </h1>
              <p className="text-white/65 text-sm">
                {embeddedClientSecret
                  ? <>R$ {currentPlan.trialPrice} agora • depois R$ {currentPrice}/{periodLabel}</>
                  : <>7 dias por R$ {currentPlan.trialPrice} • cancele quando quiser</>}
              </p>
              {embeddedClientSecret && (
                <button
                  type="button"
                  onClick={handleResetCheckout}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 hover:border-white/40 transition-colors"
                >
                  ← Editar dados
                </button>
              )}
            </div>

            <form
              id="checkout-form"
              onSubmit={handleSubmit}
              className={`space-y-5 ${embeddedClientSecret ? "opacity-70 pointer-events-none" : ""}`}
              aria-disabled={!!embeddedClientSecret}
            >
              {/* Toggle de período — sem moldura de card */}
              <div className="flex items-center justify-center gap-1 p-1 bg-white/5 rounded-full border border-white/10 max-w-xs mx-auto">
                <button
                  type="button"
                  onClick={() => setBillingPeriod("monthly")}
                  className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    billingPeriod === "monthly"
                      ? "bg-[hsl(140_22%_45%)] text-white shadow-md"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod("yearly")}
                  className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    billingPeriod === "yearly"
                      ? "bg-[hsl(140_22%_45%)] text-white shadow-md"
                      : "text-white/70 hover:text-white"
                  }`}
                >
                  Anual
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      billingPeriod === "yearly"
                        ? "bg-white/20 text-white"
                        : "bg-[hsl(35_70%_60%)] text-[hsl(220_35%_12%)]"
                    }`}
                  >
                    -40%
                  </span>
                </button>
              </div>

              {/* Planos slim */}
              <RadioGroup
                value={selectedPlan}
                onValueChange={(value) => setSelectedPlan(value as PlanId)}
                className="space-y-2.5"
              >
                {(Object.entries(plans) as [PlanId, PlanConfig][]).map(([id, plan]) => {
                  const price = billingPeriod === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
                  const period = billingPeriod === "monthly" ? "mês" : "ano";
                  const active = selectedPlan === id;
                  const isPopular = id === "direcao";

                  return (
                    <label
                      key={id}
                      className={`relative flex items-center justify-between gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                        active
                          ? "border-[hsl(140_22%_55%)] bg-[hsl(140_22%_45%/0.14)] shadow-[0_0_0_1px_hsl(140_22%_55%/0.4)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/25"
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-2 left-4 px-2 py-0.5 bg-[hsl(140_22%_45%)] text-white text-[10px] font-semibold rounded uppercase tracking-wide">
                          Mais popular
                        </div>
                      )}
                      <div className="flex items-center gap-3 min-w-0">
                        <RadioGroupItem
                          value={id}
                          id={id}
                          className="border-white/40 text-[hsl(140_22%_55%)] shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-white">{plan.name}</p>
                          <p className="text-xs text-white/65 truncate">
                            {plan.sessions > 0
                              ? `${plan.sessions} sessões/mês + chat ilimitado`
                              : "Chat ilimitado 24/7"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-display text-lg font-semibold text-[hsl(140_30%_72%)] whitespace-nowrap leading-tight">
                          R$ {plan.trialPrice}
                        </p>
                        <p className="text-[11px] text-white/65 leading-tight">
                          depois R$ {price}/{period}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>

              {/* Formulário enxuto */}
              <div className="space-y-3 pt-2">
                <div>
                  <Label htmlFor="name" className="text-white/80 text-sm">Nome</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-white/80 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-white/80 text-sm">WhatsApp</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(11) 99999-9999"
                    className={inputCls}
                    maxLength={15}
                  />
                  <p className="text-[11px] text-white/60 mt-1">
                    A AURA conversa com você por aqui
                  </p>
                </div>
              </div>

              {/* Resumo único acima do CTA */}
              <div className="text-center text-sm text-white/65 pt-1">
                Hoje{" "}
                <span className="text-white font-semibold">R$ {currentPlan.trialPrice}</span>
                {" "}• depois{" "}
                <span className="text-white/85">R$ {currentPrice}/{periodLabel}</span>
              </div>

              {/* CTA principal */}
              <Button
                type="submit"
                variant="sage"
                size="xl"
                className="w-full rounded-full"
                disabled={isLoading}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                {isLoading ? "Processando..." : `Começar por R$ ${currentPlan.trialPrice}`}
              </Button>
              <p className="text-center text-[11px] text-white/50 -mt-2">
                Sem compromisso • Cancele em 1 clique no WhatsApp
              </p>

              {/* Faixa única de confiança */}
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/55 pt-1">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                  Garantia 7 dias
                </div>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                  Pagamento Stripe
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                  Cancele quando quiser
                </div>
              </div>

              {/* Mini-depoimento */}
              <p className="text-center text-xs text-white/55 italic max-w-md mx-auto pt-2">
                "Em 3 dias senti que alguém finalmente me ouvia." — Ana C.
              </p>
            </form>

            {embeddedClientSecret && stripePromise && embeddedOptions && (
              <div id="embedded-checkout-block" className="space-y-4 pt-8 mt-8 border-t border-white/10">
                <div className="rounded-2xl bg-white p-2 md:p-4 shadow-2xl">
                  <EmbeddedCheckoutProvider stripe={stripePromise} options={embeddedOptions}>
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/55 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                    Criptografado de ponta a ponta
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                    Processado pela Stripe
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky CTA mobile — escondido quando o checkout embedado está aberto */}
        {!embeddedClientSecret && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[hsl(220_35%_8%/0.95)] backdrop-blur-md border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="submit"
            form="checkout-form"
            variant="sage"
            size="lg"
            className="w-full rounded-full"
            disabled={isLoading}
          >
            {isLoading ? "Processando..." : `Começar por R$ ${currentPlan.trialPrice}`}
          </Button>
        </div>
        )}

        {/* Exit-intent popup */}
        {showExitPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setShowExitPopup(false)}
          >
            <div
              className="bg-[hsl(220_35%_12%)] rounded-2xl p-8 max-w-md w-full shadow-2xl border border-white/10 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center">
                <Gift className="w-10 h-10 text-[hsl(140_30%_72%)]" />
              </div>
              <h2 className="font-display text-xl font-semibold text-white">Espera!</h2>
              <p className="text-white/70 text-sm leading-relaxed">
                Sua oferta de trial ainda está ativa:{" "}
                <span className="font-semibold text-[hsl(140_30%_72%)]">
                  7 dias por apenas R$ {currentPlan.trialPrice}
                </span>{" "}
                (plano {currentPlan.name})
              </p>
              <ul className="space-y-2 text-sm text-white/70 text-left mx-auto max-w-xs">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)] flex-shrink-0" />
                  Garantia de satisfação
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)] flex-shrink-0" />
                  Cancele quando quiser
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)] flex-shrink-0" />
                  +5.000 pessoas já começaram
                </li>
              </ul>
              <Button
                variant="sage"
                size="lg"
                className="w-full rounded-full"
                onClick={() => {
                  setShowExitPopup(false);
                  trackExitIntent("convert");
                  document.getElementById("checkout-form")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Quero experimentar por R$ {currentPlan.trialPrice}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default CheckoutV2;
