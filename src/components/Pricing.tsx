import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Mensal",
    price: "27,90",
    period: "/mês",
    description: "Flexibilidade para experimentar",
    features: [
      "Conversas ilimitadas",
      "Memória de longo prazo",
      "Check-in diário",
      "Review semanal",
      "2 áudios por dia",
    ],
    cta: "Assinar mensal",
    popular: false,
    badge: null,
    paymentNote: "Somente cartão de crédito",
  },
  {
    name: "Anual",
    price: "239,90",
    period: "/ano",
    priceMonthly: "19,99",
    description: "Compromisso com sua evolução",
    features: [
      "Tudo do plano mensal",
      "Economia de R$ 95/ano",
      "3 áudios por dia",
      "Prioridade no suporte",
      "Acesso a novidades em beta",
    ],
    cta: "Assinar anual",
    popular: true,
    badge: "Mais popular",
    paymentNote: "Cartão ou Pix",
  },
];

const Pricing = () => {
  return (
    <section id="precos" className="py-24 bg-card relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-glow rounded-full blur-3xl opacity-40" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Invista em <span className="text-gradient-gold">você</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Menos que um café por dia para ter clareza mental e direção na vida.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-3xl p-8 transition-all duration-300 ${
                plan.popular
                  ? "bg-gradient-card border-2 border-primary/50 shadow-glow"
                  : "bg-gradient-card border border-border/50"
              }`}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    {plan.badge}
                  </div>
                </div>
              )}

              {/* Plan header */}
              <div className="text-center mb-8">
                <h3 className="font-display text-2xl font-semibold text-foreground mb-2">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {plan.description}
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <span className="font-display text-5xl font-semibold text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                {plan.priceMonthly && (
                  <p className="text-sm text-primary mt-2">
                    Apenas R$ {plan.priceMonthly}/mês
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-teal/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-teal" />
                    </div>
                    <span className="text-foreground text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link to="/checkout" state={{ plan: plan.name.toLowerCase() }}>
                <Button
                  variant={plan.popular ? "gold" : "glass"}
                  size="lg"
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </Link>

              {/* Payment note */}
              <p className="text-center text-xs text-muted-foreground mt-4">
                {plan.paymentNote}
              </p>
            </div>
          ))}
        </div>

        {/* Trial reminder */}
        <div className="text-center mt-12">
          <p className="text-muted-foreground">
            Ainda não tem certeza?{" "}
            <span className="text-primary font-medium">
              Teste grátis com 5 conversas
            </span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
