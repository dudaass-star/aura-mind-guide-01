import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, Shield, Lock, MessageCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type PlanId = "essencial" | "direcao" | "transformacao";

interface PlanConfig {
  name: string;
  price: string;
  priceValue: number;
  period: string;
  sessions: number;
  highlights: string[];
}

const plans: Record<PlanId, PlanConfig> = {
  essencial: {
    name: "Essencial",
    price: "29,90",
    priceValue: 2990,
    period: "mês",
    sessions: 0,
    highlights: ["Conversas ilimitadas 24/7", "Check-in diário", "Review semanal"],
  },
  direcao: {
    name: "Direção",
    price: "49,90",
    priceValue: 4990,
    period: "mês",
    sessions: 4,
    highlights: ["Tudo do Essencial", "4 Sessões Especiais/mês", "Resumo após cada sessão"],
  },
  transformacao: {
    name: "Transformação",
    price: "79,90",
    priceValue: 7990,
    period: "mês",
    sessions: 8,
    highlights: ["Tudo do Direção", "8 Sessões Especiais/mês", "Prioridade no agendamento"],
  },
};

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialPlan = (location.state?.plan as PlanId) || "direcao";
  
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const currentPlan = plans[selectedPlan];

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
    
    if (phone.replace(/\D/g, "").length < 11) {
      toast.error("Por favor, insira um telefone válido");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          plan: selectedPlan,
          name: name.trim(),
          phone: phone,
        },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao processar pagamento');
      }

      if (data?.url) {
        const checkoutUrl = data.url as string;

        // Store user info in localStorage for thank you page
        localStorage.setItem('aura_checkout', JSON.stringify({ name, phone, plan: selectedPlan }));

        // Redirect to Stripe Checkout
        if (window.top) {
          window.top.location.href = checkoutUrl;
        } else {
          window.location.href = checkoutUrl;
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
        {/* Header */}
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
            {/* Title */}
            <div className="text-center mb-10">
              <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-3">
                Finalizar assinatura
              </h1>
              <p className="text-muted-foreground">
                Escolha seu plano e comece sua jornada
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
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
                  {(Object.entries(plans) as [PlanId, PlanConfig][]).map(([id, plan]) => (
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
                        </div>
                      </div>
                      <p className="font-display text-xl font-semibold text-foreground whitespace-nowrap">
                        R$ {plan.price}<span className="text-sm text-muted-foreground">/{plan.period}</span>
                      </p>
                    </label>
                  ))}
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
                  <span className="text-muted-foreground">Plano {currentPlan.name}</span>
                  <span className="font-semibold text-foreground">R$ {currentPlan.price}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-border/50">
                  <span className="font-medium text-foreground">Total mensal</span>
                  <span className="font-display text-2xl font-semibold text-foreground">
                    R$ {currentPlan.price}
                  </span>
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
                {isLoading ? "Processando..." : "Continuar para pagamento"}
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
