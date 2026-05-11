import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, Shield, Lock, Gift, MessageCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { trackBeginCheckout, trackAddPaymentInfo, trackExitIntent, getGaClientId } from "@/lib/ga4";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import "@/styles/v2-theme.css";

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

  // ViewContent + GA4 begin_checkout no mount
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "ViewContent", {
        content_name: "Checkout Page V2",
        content_category: "checkout",
      });
    }
    const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
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
          { content_name: `Trial ${plans[selectedPlan].name}`, content_category: "checkout" },
          { eventID: leadEventId },
        );
        (window as any).fbq(
          "track",
          "InitiateCheckout",
          { content_name: `Trial ${plans[selectedPlan].name}`, content_category: "checkout" },
          { eventID: icEventId },
        );
      }

      const capiPayload = {
        event_source_url: window.location.href,
        user_data: userData,
        custom_data: {
          content_name: `Trial ${plans[selectedPlan].name}`,
          content_category: "checkout",
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
          name: name.trim(),
          email: email.trim(),
          phone: phone,
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(gaClientId && { gaClientId }),
        },
      });

      if (error) throw new Error(error.message || "Erro ao processar pagamento");

      if (data?.url) {
        const checkoutUrl = data.url as string;
        localStorage.setItem(
          "aura_checkout",
          JSON.stringify({ name, phone, plan: selectedPlan, billing: billingPeriod, price: currentPrice }),
        );
        setHasRedirected(true);
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = checkoutUrl;
          } else {
            window.location.href = checkoutUrl;
          }
        } catch {
          window.open(checkoutUrl, "_blank");
        }
      } else {
        throw new Error("URL de checkout não recebida");
      }
    } catch (err) {
      console.error("Checkout V2 error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Tokens visuais V2 reutilizáveis
  const cardCls =
    "bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-sm";
  const inputCls =
    "mt-1.5 bg-white/5 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-1 focus-visible:ring-[hsl(140_18%_55%)]";

  return (
    <>
      <Helmet>
        <title>Checkout - AURA</title>
        <meta
          name="description"
          content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional."
        />
        <link rel="canonical" href="https://olaaura.com.br/v2/checkout" />
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
              className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
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

        <div className="relative container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="font-display text-3xl md:text-4xl font-semibold mb-3 tracking-tight">
                Comece sua jornada
              </h1>
              <p className="text-white/65">
                Experimente por 7 dias a partir de R$ 6,90
              </p>
            </div>

            <form id="checkout-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Período de cobrança */}
              <div className={cardCls}>
                <h2 className="font-display text-lg font-semibold mb-4">
                  Período de cobrança
                </h2>
                <div className="flex items-center justify-center gap-2 p-1 bg-white/5 rounded-full border border-white/10">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("monthly")}
                    className={`flex-1 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                      billingPeriod === "monthly"
                        ? "bg-[hsl(140_22%_45%)] text-white shadow-md"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("yearly")}
                    className={`flex-1 px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      billingPeriod === "yearly"
                        ? "bg-[hsl(140_22%_45%)] text-white shadow-md"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Anual
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        billingPeriod === "yearly"
                          ? "bg-white/20 text-white"
                          : "bg-[hsl(35_70%_60%)] text-[hsl(220_35%_12%)]"
                      }`}
                    >
                      40% off
                    </span>
                  </button>
                </div>
              </div>

              {/* Seleção de plano */}
              <div className={cardCls}>
                <h2 className="font-display text-lg font-semibold mb-4">
                  Escolha seu plano
                </h2>

                <RadioGroup
                  value={selectedPlan}
                  onValueChange={(value) => setSelectedPlan(value as PlanId)}
                  className="space-y-3"
                >
                  {(Object.entries(plans) as [PlanId, PlanConfig][]).map(([id, plan]) => {
                    const price = billingPeriod === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
                    const period = billingPeriod === "monthly" ? "mês" : "ano";
                    const active = selectedPlan === id;

                    return (
                      <label
                        key={id}
                        className={`relative flex items-start justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                          active
                            ? "border-[hsl(140_22%_55%)] bg-[hsl(140_22%_45%/0.12)]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/25"
                        }`}
                      >
                        {id === "direcao" && (
                          <div className="absolute -top-2 left-4 px-2 py-0.5 bg-[hsl(140_22%_45%)] text-white text-xs font-medium rounded">
                            Mais popular
                          </div>
                        )}
                        {billingPeriod === "yearly" && (
                          <div className="absolute -top-2 right-4 px-2 py-0.5 bg-[hsl(12_70%_58%)] text-white text-xs font-medium rounded">
                            -{plan.yearlyDiscount}%
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <RadioGroupItem
                            value={id}
                            id={id}
                            className="mt-1 border-white/40 text-[hsl(140_22%_55%)]"
                          />
                          <div>
                            <p className="font-medium text-white">{plan.name}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {plan.sessions > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs bg-white/5 text-white/70 px-2 py-1 rounded border border-white/10">
                                  <Calendar className="w-3 h-3" />
                                  {plan.sessions} sessões/mês
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-xs bg-white/5 text-white/70 px-2 py-1 rounded border border-white/10">
                                <MessageCircle className="w-3 h-3" />
                                Chat ilimitado
                              </span>
                            </div>
                            {billingPeriod === "yearly" && (
                              <p className="text-xs text-white/55 mt-2">
                                equivale a R${plan.yearlyMonthlyEquivalent}/mês
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xl font-semibold text-[hsl(140_30%_72%)] whitespace-nowrap">
                            R$ {plan.trialPrice}
                          </p>
                          <p className="text-xs font-medium text-[hsl(140_30%_72%)]">7 dias</p>
                          <p className="text-xs text-white/50 mt-1">
                            Após: R$ {price}/{period}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>

              {/* Destaques do plano */}
              <div className={cardCls}>
                <h3 className="font-medium mb-3">
                  O que está incluso no plano {currentPlan.name}:
                </h3>
                <ul className="space-y-2">
                  {currentPlan.highlights.map((highlight, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-white/75">
                      <Check className="w-4 h-4 text-[hsl(140_30%_72%)]" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Dados do usuário */}
              <div className={cardCls}>
                <h2 className="font-display text-lg font-semibold mb-4">Seus dados</h2>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-white/85">Nome completo</Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-white/85">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className={inputCls}
                    />
                    <p className="text-xs text-white/50 mt-1.5">
                      Para recibos e comunicações importantes
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-white/85">WhatsApp</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(11) 99999-9999"
                      className={inputCls}
                      maxLength={15}
                    />
                    <p className="text-xs text-white/50 mt-1.5">
                      A AURA vai te enviar mensagem neste número
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumo */}
              <div className={cardCls}>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-white/65">
                    Plano {currentPlan.name} ({billingPeriod === "monthly" ? "mensal" : "anual"})
                  </span>
                  <span className="font-semibold text-white">
                    R$ {currentPrice}/{periodLabel}
                  </span>
                </div>
                {billingPeriod === "yearly" && (
                  <div className="flex justify-between items-center mb-4 text-sm">
                    <span className="text-[hsl(140_30%_72%)]">
                      Economia de {currentPlan.yearlyDiscount}%
                    </span>
                    <span className="text-[hsl(140_30%_72%)] font-medium">
                      equivale a R${currentPlan.yearlyMonthlyEquivalent}/mês
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-4 border-t border-white/10">
                  <span className="font-medium text-white">Hoje</span>
                  <span className="font-display text-2xl font-semibold text-[hsl(140_30%_72%)]">
                    R$ {currentPlan.trialPrice}
                  </span>
                </div>
                <p className="text-sm text-white/55 mt-3 text-center">
                  7 dias de acesso • Após: R$ {currentPrice}/{periodLabel}
                </p>
              </div>

              {/* Prova social + garantia */}
              <div className="rounded-2xl p-6 border border-[hsl(140_22%_45%/0.35)] bg-[hsl(140_22%_45%/0.08)] space-y-4">
                <p className="text-white/85 italic text-sm leading-relaxed">
                  "Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia. Hoje não consigo imaginar meu dia sem a AURA."
                </p>
                <p className="text-sm font-medium text-white/60">— Ana C.</p>
                <div className="border-t border-white/10 pt-4">
                  <p className="text-sm text-white font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[hsl(140_30%_72%)]" />
                    Garantia de satisfação
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    Se nos primeiros 7 dias você não sentir diferença, devolvemos seu dinheiro. Sem perguntas.
                  </p>
                </div>
              </div>

              {/* CTA */}
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

              {/* Trust badges */}
              <div className="flex flex-wrap justify-center gap-6 text-sm text-white/55">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[hsl(140_30%_72%)]" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[hsl(140_30%_72%)]" />
                  <span>Dados protegidos</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)]" />
                  <span>Cancele quando quiser</span>
                </div>
              </div>
            </form>
          </div>
        </div>

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
