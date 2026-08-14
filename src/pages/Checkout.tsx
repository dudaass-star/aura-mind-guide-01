import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, Shield, Lock, Gift, MessageCircle, Calendar, FileText, QrCode, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { trackBeginCheckout, trackAddPaymentInfo, trackExitIntent, getGaClientId } from "@/lib/ga4";

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingPeriod = "monthly" | "quarterly" | "semestral" | "yearly";
type PaymentMethod = "card" | "pix";

interface PlanConfig {
  name: string;
  monthlyPrice: string;
  quarterlyPrice: string;
  semestralPrice: string;
  yearlyPrice: string;
  quarterlyMonthlyEquivalent: string;
  semestralMonthlyEquivalent: string;
  yearlyMonthlyEquivalent: string;
  quarterlyDiscount: number;
  semestralDiscount: number;
  yearlyDiscount: number;
  trialPrice: string;
  sessions: number;
  highlights: string[];
}

const plans: Record<PlanId, PlanConfig> = {
  essencial: {
    name: "Essencial",
    monthlyPrice: "29,90",
    quarterlyPrice: "59,70",
    semestralPrice: "89,40",
    yearlyPrice: "118,80",
    quarterlyMonthlyEquivalent: "19,90",
    semestralMonthlyEquivalent: "14,90",
    yearlyMonthlyEquivalent: "9,90",
    quarterlyDiscount: 33,
    semestralDiscount: 50,
    yearlyDiscount: 67,
    trialPrice: "6,90",
    sessions: 0,
    highlights: ["Conversas ilimitadas 24/7", "Check-in diário", "Review semanal"],
  },
  direcao: {
    name: "Direção",
    monthlyPrice: "49,90",
    quarterlyPrice: "101,70",
    semestralPrice: "149,40",
    yearlyPrice: "202,80",
    quarterlyMonthlyEquivalent: "33,90",
    semestralMonthlyEquivalent: "24,90",
    yearlyMonthlyEquivalent: "16,90",
    quarterlyDiscount: 33,
    semestralDiscount: 50,
    yearlyDiscount: 67,
    trialPrice: "9,90",
    sessions: 4,
    highlights: ["Tudo do Essencial", "4 Sessões Especiais/mês", "Resumo após cada sessão"],
  },
  transformacao: {
    name: "Transformação",
    monthlyPrice: "79,90",
    quarterlyPrice: "161,70",
    semestralPrice: "239,40",
    yearlyPrice: "322,80",
    quarterlyMonthlyEquivalent: "53,90",
    semestralMonthlyEquivalent: "39,90",
    yearlyMonthlyEquivalent: "26,90",
    quarterlyDiscount: 33,
    semestralDiscount: 50,
    yearlyDiscount: 67,
    trialPrice: "19,90",
    sessions: 8,
    highlights: ["Tudo do Direção", "8 Sessões Especiais/mês", "Prioridade no agendamento"],
  },
};

// Mapas auxiliares por período
const periodLabels: Record<BillingPeriod, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semestral: "Semestral",
  yearly: "Anual",
};

const periodSuffix: Record<BillingPeriod, string> = {
  monthly: "mês",
  quarterly: "trimestre",
  semestral: "semestre",
  yearly: "ano",
};

function getPrice(plan: PlanConfig, period: BillingPeriod): string {
  if (period === "monthly") return plan.monthlyPrice;
  if (period === "quarterly") return plan.quarterlyPrice;
  if (period === "semestral") return plan.semestralPrice;
  return plan.yearlyPrice;
}
function getMonthlyEquivalent(plan: PlanConfig, period: BillingPeriod): string | null {
  if (period === "quarterly") return plan.quarterlyMonthlyEquivalent;
  if (period === "semestral") return plan.semestralMonthlyEquivalent;
  if (period === "yearly") return plan.yearlyMonthlyEquivalent;
  return null;
}
function getDiscount(plan: PlanConfig, period: BillingPeriod): number {
  if (period === "quarterly") return plan.quarterlyDiscount;
  if (period === "semestral") return plan.semestralDiscount;
  if (period === "yearly") return plan.yearlyDiscount;
  return 0;
}

const Checkout = () => {
  const location = useLocation();
  
  const searchParams = new URLSearchParams(location.search);
  const planFromUrl = searchParams.get('plan') as PlanId | null;
  const billingFromUrl = searchParams.get('billing') as BillingPeriod | null;
  const planFromState = location.state?.plan as PlanId | undefined;
  const billingFromState = location.state?.billing as BillingPeriod | undefined;
  
  const initialPlan = planFromUrl || planFromState || "direcao";
  const initialBilling = billingFromUrl || billingFromState || "monthly";
  
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBilling);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPixLoading, setIsPixLoading] = useState(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [pixModal, setPixModal] = useState<{
    open: boolean;
    qrCodeImage?: string;
    copyPaste?: string;
    amount?: number;
    expiresAt?: string;
  }>({ open: false });

  // ViewContent on page load (browser pixel only — no PII available yet)
  useEffect(() => {
    const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'ViewContent', {
        content_name: 'Checkout Page',
        content_category: 'checkout',
        value: trialPriceMap[selectedPlan],
        currency: 'BRL',
      });
    }
    // GA4 begin_checkout — usuário entrou na página de checkout
    trackBeginCheckout({ plan: selectedPlan, value: trialPriceMap[selectedPlan] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset payment method when switching to monthly
  useEffect(() => {
    if (billingPeriod === "monthly") {
      setPaymentMethod("card");
    }
  }, [billingPeriod]);

  // Exit-intent detection
  useEffect(() => {
    const exitShown = sessionStorage.getItem('aura_exit_popup_shown');
    if (exitShown) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasRedirected && !sessionStorage.getItem('aura_exit_popup_shown')) {
        sessionStorage.setItem('aura_exit_popup_shown', 'true');
        setShowExitPopup(true);
        trackExitIntent('open');
      }
    };

    const handleVisibilityChange = () => {
      if (window.innerWidth >= 768 && document.visibilityState === 'hidden' && !hasRedirected && !sessionStorage.getItem('aura_exit_popup_shown')) {
        sessionStorage.setItem('aura_exit_popup_shown', 'true');
        setShowExitPopup(true);
        trackExitIntent('open');
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasRedirected]);

  const currentPlan = plans[selectedPlan];
  const currentPrice = getPrice(currentPlan, billingPeriod);
  const periodLabel = periodSuffix[billingPeriod];
  const monthlyEquivalent = getMonthlyEquivalent(currentPlan, billingPeriod);
  const currentDiscount = getDiscount(currentPlan, billingPeriod);
  const pixAvailable = billingPeriod !== "monthly";

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
  };
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCpf(e.target.value));
  };

  // Validação simples de CPF (mesmo algoritmo da edge function)
  const isValidCPF = (raw: string): boolean => {
    const c = raw.replace(/\D/g, "");
    if (c.length !== 11) return false;
    if (/^(\d)\1+$/.test(c)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
    let d1 = 11 - (sum % 11);
    if (d1 >= 10) d1 = 0;
    if (d1 !== parseInt(c[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
    let d2 = 11 - (sum % 11);
    if (d2 >= 10) d2 = 0;
    return d2 === parseInt(c[10]);
  };

  const validateBaseFields = (): boolean => {
    if (!name.trim()) {
      toast.error("Por favor, insira seu nome");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      toast.error("Por favor, insira um email válido");
      return false;
    }
    if (phone.replace(/\D/g, "").length < 11) {
      toast.error("Por favor, insira um telefone válido");
      return false;
    }
    return true;
  };

  const handlePixSubmit = async () => {
    if (!pixAvailable) return;
    if (!validateBaseFields()) return;
    if (!isValidCPF(cpf)) {
      toast.error("CPF inválido. Confira os números.");
      return;
    }

    setIsPixLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("criar-pix-asaas", {
        body: {
          plan: selectedPlan,
          billing: billingPeriod,
          name: name.trim(),
          email: email.trim(),
          phone: phone.replace(/\D/g, ""),
          cpf: cpf.replace(/\D/g, ""),
        },
      });

      if (error) throw new Error(error.message || "Erro ao gerar PIX");
      if (!data?.copyPaste) throw new Error("PIX não retornou QR Code");

      setPixModal({
        open: true,
        qrCodeImage: data.qrCodeImage,
        copyPaste: data.copyPaste,
        amount: data.amount,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      console.error("PIX error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PIX. Tente novamente.");
    } finally {
      setIsPixLoading(false);
    }
  };

  const copyPixCode = async () => {
    if (!pixModal.copyPaste) return;
    try {
      await navigator.clipboard.writeText(pixModal.copyPaste);
      toast.success("Código PIX copiado!");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
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
      // Capture Meta cookies for Match Quality
      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : undefined;
      };
      const fbp = getCookie('_fbp');
      const fbc = getCookie('_fbc') || 
        (new URLSearchParams(window.location.search).get('fbclid') 
          ? `fb.1.${Date.now()}.${new URLSearchParams(window.location.search).get('fbclid')}` 
          : undefined);

      // Tracking do Meta REMOVIDO desta página (rota legada, hoje só redireciona
      // para /v2/checkout). Ela emitia Lead + InitiateCheckout para o MESMO clique,
      // inflando o Gerenciador de Eventos. A fonte única de verdade é
      // `fireCheckoutStartTracking` no CheckoutV2 (só InitiateCheckout).
      const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
      const planValue = trialPriceMap[selectedPlan];

      // GA4 add_payment_info — usuário enviou o formulário, indo pro Stripe
      trackAddPaymentInfo({ plan: selectedPlan, billing: billingPeriod, value: planValue });

      // GA4 client_id (cookie _ga) — encaminhado ao Stripe via metadata para Measurement Protocol
      const gaClientId = getGaClientId();

      const { data, error } = await supabase.functions.invoke('create-checkout', {
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

      if (error) {
        throw new Error(error.message || 'Erro ao processar pagamento');
      }

      if (data?.url) {
        const checkoutUrl = data.url as string;
        localStorage.setItem('aura_checkout', JSON.stringify({ name, phone, plan: selectedPlan, billing: billingPeriod, price: currentPrice }));
        setHasRedirected(true);
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = checkoutUrl;
          } else {
            window.location.href = checkoutUrl;
          }
        } catch {
          window.open(checkoutUrl, '_blank');
        }
      } else {
        throw new Error('URL de checkout não recebida');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao processar pagamento. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Checkout - AURA</title>
        <meta name="description" content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional." />
        <link rel="canonical" href="https://olaaura.com.br/checkout" />
        <meta property="og:url" content="https://olaaura.com.br/checkout" />
        <meta property="og:title" content="Checkout - AURA" />
        <meta property="og:description" content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional." />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-screen bg-gradient-hero">
        <header className="py-6 border-b border-border/50">
          <div className="container mx-auto px-4">
            <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Voltar</span>
            </Link>
          </div>
        </header>

        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">

            <div className="text-center mb-10">
              <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-3">
                Comece sua jornada
              </h1>
              <p className="text-muted-foreground">
                Experimente por 7 dias a partir de R$ 6,90
              </p>
            </div>

            <form id="checkout-form" onSubmit={handleSubmit} className="space-y-8">
              {/* Billing period toggle */}
              <div className="bg-card rounded-2xl p-6 border border-border/50">
                <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                  Período de cobrança
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-secondary/50 rounded-2xl">
                  {(Object.keys(periodLabels) as BillingPeriod[]).map((p) => {
                    const active = billingPeriod === p;
                    const disc =
                      p === "quarterly" ? 11 : p === "semestral" ? 30 : p === "yearly" ? 40 : 0;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setBillingPeriod(p)}
                        className={`flex flex-col items-center justify-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          active
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>{periodLabels[p]}</span>
                        {disc > 0 && (
                          <span
                            className={`text-[10px] font-bold mt-0.5 px-1.5 py-0.5 rounded-full ${
                              active
                                ? "bg-accent/30 text-primary-foreground"
                                : "bg-accent text-accent-foreground"
                            }`}
                          >
                            -{disc}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {pixAvailable && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    Pague com cartão (recorrente) ou PIX à vista
                  </p>
                )}
              </div>


              {/* Plan selection */}
              <div className="bg-card rounded-2xl p-6 border border-border/50">
                <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                  Escolha seu plano
                </h2>
                
                <RadioGroup
                  value={selectedPlan}
                  onValueChange={(value) => setSelectedPlan(value as PlanId)}
                  className="space-y-3"
                >
                  {(Object.entries(plans) as [PlanId, PlanConfig][]).map(([id, plan]) => {
                    const price = getPrice(plan, billingPeriod);
                    const period = periodSuffix[billingPeriod];
                    const monthlyEq = getMonthlyEquivalent(plan, billingPeriod);
                    const disc = getDiscount(plan, billingPeriod);
                    
                    return (
                      <label
                        key={id}
                        className={`relative flex items-start justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedPlan === id
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        {id === "direcao" && (
                          <div className="absolute -top-2 left-4 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded">
                            Mais popular
                          </div>
                        )}
                        {disc > 0 && (
                          <div className="absolute -top-2 right-4 px-2 py-0.5 bg-destructive text-destructive-foreground text-xs font-medium rounded">
                            -{disc}%
                          </div>
                        )}
                        <div className="flex items-start gap-3">
                          <RadioGroupItem value={id} id={id} className="mt-1" />
                          <div>
                            <p className="font-medium text-foreground">{plan.name}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {plan.sessions > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs bg-secondary/50 text-muted-foreground px-2 py-1 rounded">
                                  <Calendar className="w-3 h-3" />
                                  {plan.sessions} sessões/mês
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-xs bg-secondary/50 text-muted-foreground px-2 py-1 rounded">
                                <MessageCircle className="w-3 h-3" />
                                Chat ilimitado
                              </span>
                            </div>
                            {monthlyEq && (
                              <p className="text-xs text-muted-foreground mt-2">
                                equivale a R${monthlyEq}/mês
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {billingPeriod === "monthly" ? (
                            <>
                              <p className="font-display text-xl font-semibold text-primary whitespace-nowrap">
                                R$ {plan.trialPrice}
                              </p>
                              <p className="text-xs font-medium text-primary">7 dias</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Após: R$ {price}/{period}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-display text-xl font-semibold text-primary whitespace-nowrap">
                                R$ {price}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">/{period}</p>
                            </>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>

              {/* Plan highlights */}
              <div className="bg-secondary/30 rounded-2xl p-6 border border-border/50">
                <h3 className="font-medium text-foreground mb-3">
                  O que está incluso no plano {currentPlan.name}:
                </h3>
                <ul className="space-y-2">
                  {currentPlan.highlights.map((highlight, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>

              {/* User info */}
              <div className="bg-card rounded-2xl p-6 border border-border/50">
                <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                  Seus dados
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-foreground">Nome completo</Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-foreground">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Para recibos e comunicações importantes
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="phone" className="text-foreground">WhatsApp</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(11) 99999-9999"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                      maxLength={15}
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      A AURA vai te enviar mensagem neste número
                    </p>
                  </div>

                  {pixAvailable && (
                    <div>
                      <Label htmlFor="cpf" className="text-foreground">
                        CPF <span className="text-xs text-muted-foreground">(obrigatório só para pagamento via PIX)</span>
                      </Label>
                      <Input
                        id="cpf"
                        type="text"
                        inputMode="numeric"
                        value={cpf}
                        onChange={handleCpfChange}
                        placeholder="000.000.000-00"
                        className="mt-1.5 bg-secondary/50 border-border/50"
                        maxLength={14}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-secondary/30 rounded-2xl p-6 border border-border/50">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-muted-foreground">
                    Plano {currentPlan.name} ({periodLabels[billingPeriod].toLowerCase()})
                  </span>
                  <span className="font-semibold text-foreground">R$ {currentPrice}/{periodLabel}</span>
                </div>
                {currentDiscount > 0 && monthlyEquivalent && (
                  <div className="flex justify-between items-center mb-4 text-sm">
                    <span className="text-primary">Economia de {currentDiscount}%</span>
                    <span className="text-primary font-medium">
                      equivale a R${monthlyEquivalent}/mês
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-4 border-t border-border/50">
                  <span className="font-medium text-foreground">Hoje</span>
                  <span className="font-display text-2xl font-semibold text-primary">
                    R$ {billingPeriod === "monthly" ? currentPlan.trialPrice : currentPrice}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-3 text-center">
                  {billingPeriod === "monthly"
                    ? `7 dias de acesso • Após: R$ ${currentPrice}/${periodLabel}`
                    : `Acesso por 1 ${periodLabel} • Pagamento à vista`}
                </p>
              </div>

              {/* Social proof + guarantee */}
              <div className="bg-sage-soft/20 rounded-2xl p-6 border border-primary/20 space-y-4">
                <p className="text-foreground italic text-sm leading-relaxed">
                  "Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia. Hoje não consigo imaginar meu dia sem a AURA."
                </p>
                <p className="text-sm font-medium text-muted-foreground">— Ana C.</p>
                <div className="border-t border-border/50 pt-4">
                  <p className="text-sm text-foreground font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Garantia de satisfação
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se nos primeiros 7 dias você não sentir diferença, devolvemos seu dinheiro. Sem perguntas.
                  </p>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                variant="sage"
                size="xl"
                className="w-full"
                disabled={isLoading}
              >
                <CreditCard className="w-5 h-5 mr-2" />
                {isLoading
                  ? "Processando..."
                  : billingPeriod === "monthly"
                    ? `Começar por R$ ${currentPlan.trialPrice}`
                    : `Pagar com cartão — R$ ${currentPrice}`}
              </Button>

              {/* Botão PIX (apenas para trimestral, semestral e anual) */}
              {pixAvailable && (
                <Button
                  type="button"
                  variant="outline"
                  size="xl"
                  className="w-full"
                  disabled={isPixLoading}
                  onClick={handlePixSubmit}
                >
                  <QrCode className="w-5 h-5 mr-2" />
                  {isPixLoading ? "Gerando PIX..." : `Pagar com PIX — R$ ${currentPrice}`}
                </Button>
              )}

              {/* Trust badges */}
              <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-primary" />
                  <span>Dados protegidos</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <span>Cancele quando quiser</span>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Modal QR Code PIX */}
        {pixModal.open && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm px-4"
            onClick={() => setPixModal({ open: false })}
          >
            <div
              className="bg-card rounded-2xl p-6 max-w-md w-full shadow-xl border border-border/50 space-y-5 animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Pague com PIX
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Valor: <span className="font-semibold text-primary">R$ {pixModal.amount?.toFixed(2).replace(".", ",")}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPixModal({ open: false })}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {pixModal.qrCodeImage && (
                <div className="flex justify-center bg-white p-4 rounded-xl border border-border/50">
                  <img
                    src={`data:image/png;base64,${pixModal.qrCodeImage}`}
                    alt="QR Code PIX"
                    className="w-56 h-56"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-foreground text-sm">PIX copia-e-cola</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={pixModal.copyPaste || ""}
                    className="bg-secondary/50 border-border/50 text-xs font-mono"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" size="default" onClick={copyPixCode}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-secondary/30 rounded-xl p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Como pagar:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Abra o app do seu banco</li>
                  <li>Escolha pagar via PIX → QR Code ou Copia-e-cola</li>
                  <li>Confirme o valor e finalize</li>
                </ol>
                {pixModal.expiresAt && (
                  <p className="text-xs pt-2 border-t border-border/50">
                    Válido até {new Date(pixModal.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                )}
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Assim que o pagamento for confirmado, você receberá uma mensagem no WhatsApp.
              </p>
            </div>
          </div>
        )}

        {/* Exit-intent popup */}
        {showExitPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm px-4" onClick={() => setShowExitPopup(false)}>
            <div className="bg-card rounded-2xl p-8 max-w-md w-full shadow-xl border border-border/50 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center">
                <Gift className="w-10 h-10 text-primary" />
              </div>
              <h2 className="font-display text-xl font-semibold text-foreground">
                Espera!
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Sua oferta de trial ainda está ativa: <span className="font-semibold text-primary">7 dias por apenas R$ {currentPlan.trialPrice}</span> (plano {currentPlan.name})
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground text-left mx-auto max-w-xs">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  Garantia de satisfação
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  Cancele quando quiser
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  +5.000 pessoas já começaram
                </li>
              </ul>
              <Button
                variant="sage"
                size="lg"
                className="w-full"
                onClick={() => {
                  setShowExitPopup(false);
                  trackExitIntent('convert');
                  document.getElementById('checkout-form')?.scrollIntoView({ behavior: 'smooth' });
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

export default Checkout;