import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, Shield, Lock, MessageCircle, Calendar, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingPeriod = "monthly" | "yearly";
type PaymentMethod = "card";

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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Generate a unique event_id for deduplication between browser pixel and CAPI
    const eventId = `ic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Browser pixel event with event_id
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'InitiateCheckout', {}, { eventID: eventId });
    }

  }, []);

  // Reset payment method when switching to monthly
  useEffect(() => {
    if (billingPeriod === "monthly") {
      setPaymentMethod("card");
    }
  }, [billingPeriod]);

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

      // Send CAPI InitiateCheckout with PII for better Match Quality
      const capiEventId = `ic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      supabase.functions.invoke('meta-capi', {
        body: {
          event_name: 'InitiateCheckout',
          event_id: capiEventId,
          event_source_url: window.location.href,
          user_data: {
            email: email.trim(),
            phone: phone.replace(/\D/g, ''),
            first_name: name.trim().split(' ')[0],
            client_user_agent: navigator.userAgent,
            ...(fbp && { fbp }),
            ...(fbc && { fbc }),
          },
          custom_data: {
            content_name: `Trial ${plans[selectedPlan].name}`,
            content_category: 'checkout',
          },
        },
      }).catch(() => {}); // non-blocking
      
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
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao processar pagamento');
      }

      if (data?.url) {
        const checkoutUrl = data.url as string;
        localStorage.setItem('aura_checkout', JSON.stringify({ name, phone, plan: selectedPlan, billing: billingPeriod, price: currentPrice }));
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

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Billing period toggle */}
              <div className="bg-card rounded-2xl p-6 border border-border/50">
                <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                  Período de cobrança
                </h2>
                <div className="flex items-center justify-center gap-3 p-1 bg-secondary/50 rounded-full">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("monthly")}
                    className={`flex-1 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
                      billingPeriod === "monthly"
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("yearly")}
                    className={`flex-1 px-4 py-2.5 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      billingPeriod === "yearly"
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Anual
                    <span className={`text-sm font-bold px-3 py-1 rounded-full transition-all ${
                      billingPeriod === "yearly" 
                        ? "bg-accent/30 text-primary-foreground" 
                        : "bg-accent text-accent-foreground shadow-sm animate-pulse-soft"
                    }`}>
                      40% off
                    </span>
                  </button>
                </div>
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
                    const price = billingPeriod === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
                    const period = billingPeriod === "monthly" ? "mês" : "ano";
                    
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
                        {billingPeriod === "yearly" && (
                          <div className="absolute -top-2 right-4 px-2 py-0.5 bg-destructive text-destructive-foreground text-xs font-medium rounded">
                            -{plan.yearlyDiscount}%
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
                            {billingPeriod === "yearly" && (
                              <p className="text-xs text-muted-foreground mt-2">
                                equivale a R${plan.yearlyMonthlyEquivalent}/mês
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xl font-semibold text-primary whitespace-nowrap">
                            R$ {plan.trialPrice}
                          </p>
                          <p className="text-xs font-medium text-primary">7 dias</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Após: R$ {price}/{period}
                          </p>
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
                </div>
              </div>

              {/* Summary */}
              <div className="bg-secondary/30 rounded-2xl p-6 border border-border/50">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-muted-foreground">
                    Plano {currentPlan.name} ({billingPeriod === "monthly" ? "mensal" : "anual"})
                  </span>
                  <span className="font-semibold text-foreground">R$ {currentPrice}/{periodLabel}</span>
                </div>
                {billingPeriod === "yearly" && (
                  <div className="flex justify-between items-center mb-4 text-sm">
                    <span className="text-primary">Economia de {currentPlan.yearlyDiscount}%</span>
                    <span className="text-primary font-medium">
                      equivale a R${currentPlan.yearlyMonthlyEquivalent}/mês
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-4 border-t border-border/50">
                  <span className="font-medium text-foreground">Hoje</span>
                  <span className="font-display text-2xl font-semibold text-primary">
                    R$ {currentPlan.trialPrice}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-3 text-center">
                  7 dias de acesso • Após: R$ {currentPrice}/{periodLabel}
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
                {isLoading ? "Processando..." : `Começar por R$ ${currentPlan.trialPrice}`}
              </Button>

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
      </div>
    </>
  );
};

export default Checkout;