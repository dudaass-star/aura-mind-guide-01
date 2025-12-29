import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, QrCode, Check, Shield, Lock } from "lucide-react";
import { toast } from "sonner";

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialPlan = location.state?.plan || "anual";
  
  const [selectedPlan, setSelectedPlan] = useState<"mensal" | "anual">(initialPlan);
  const [paymentMethod, setPaymentMethod] = useState<"cartao" | "pix">("cartao");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const plans = {
    mensal: {
      price: "27,90",
      period: "mês",
      paymentMethods: ["cartao"],
    },
    anual: {
      price: "239,90",
      period: "ano",
      priceMonthly: "19,99",
      paymentMethods: ["cartao", "pix"],
    },
  };

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
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      navigate("/obrigado", { state: { name, phone, plan: selectedPlan, paymentMethod } });
    }, 1500);
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
                Escolha seu plano e método de pagamento
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
                  onValueChange={(value) => {
                    setSelectedPlan(value as "mensal" | "anual");
                    if (value === "mensal") setPaymentMethod("cartao");
                  }}
                  className="space-y-3"
                >
                  {/* Monthly */}
                  <label
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === "mensal"
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="mensal" id="mensal" />
                      <div>
                        <p className="font-medium text-foreground">Mensal</p>
                        <p className="text-sm text-muted-foreground">Somente cartão</p>
                      </div>
                    </div>
                    <p className="font-display text-xl font-semibold text-foreground">
                      R$ 27,90<span className="text-sm text-muted-foreground">/mês</span>
                    </p>
                  </label>

                  {/* Annual */}
                  <label
                    className={`relative flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === "anual"
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border"
                    }`}
                  >
                    <div className="absolute -top-2 left-4 px-2 py-0.5 bg-teal text-accent-foreground text-xs font-medium rounded">
                      Economia de R$ 95
                    </div>
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="anual" id="anual" />
                      <div>
                        <p className="font-medium text-foreground">Anual</p>
                        <p className="text-sm text-muted-foreground">Cartão ou Pix</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl font-semibold text-foreground">
                        R$ 239,90<span className="text-sm text-muted-foreground">/ano</span>
                      </p>
                      <p className="text-sm text-primary">R$ 19,99/mês</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {/* Payment method (only for annual) */}
              {selectedPlan === "anual" && (
                <div className="bg-card rounded-2xl p-6 border border-border/50">
                  <h2 className="font-display text-lg font-semibold text-foreground mb-4">
                    Método de pagamento
                  </h2>
                  
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as "cartao" | "pix")}
                    className="grid grid-cols-2 gap-3"
                  >
                    <label
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border cursor-pointer transition-all ${
                        paymentMethod === "cartao"
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      <RadioGroupItem value="cartao" id="cartao" className="sr-only" />
                      <CreditCard className="w-6 h-6 text-primary mb-2" />
                      <span className="text-sm font-medium text-foreground">Cartão</span>
                    </label>

                    <label
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border cursor-pointer transition-all ${
                        paymentMethod === "pix"
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      <RadioGroupItem value="pix" id="pix" className="sr-only" />
                      <QrCode className="w-6 h-6 text-primary mb-2" />
                      <span className="text-sm font-medium text-foreground">Pix</span>
                    </label>
                  </RadioGroup>
                </div>
              )}

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
                  <span className="text-muted-foreground">Plano {selectedPlan}</span>
                  <span className="font-semibold text-foreground">R$ {currentPlan.price}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-border/50">
                  <span className="font-medium text-foreground">Total</span>
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
                {isLoading ? "Processando..." : "Continuar para pagamento"}
              </Button>

              {/* Trust badges */}
              <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-teal" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-teal" />
                  <span>Dados protegidos</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-teal" />
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
