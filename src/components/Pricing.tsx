import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Mensal",
    price: "27,90",
    period: "/mês",
    description: "Pra quem quer começar agora.",
    features: [
      "Conversas ilimitadas",
      "Memória de longo prazo",
      "Check-in diário",
      "Review semanal",
      "Respostas em texto e áudio",
    ],
    cta: "Assinar mensal",
    popular: false,
    badge: null,
    paymentNote: "Somente cartão de crédito (recorrência automática)",
  },
  {
    name: "Anual",
    price: "239,90",
    originalPrice: "334,80",
    discountPercent: "-28%",
    period: "/ano",
    priceMonthly: "19,99",
    description: "Melhor custo-benefício. Ideal pra quem quer consistência.",
    features: [
      "Tudo do plano mensal",
      "Melhor custo-benefício",
      "Ideal pra quem quer consistência",
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
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sage-soft rounded-full blur-3xl opacity-40" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Escolha seu plano.{" "}
            <span className="text-gradient-sage">Comece hoje.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-3xl p-8 transition-all duration-300 ${
                plan.popular
                  ? "bg-sage-soft/40 border-2 border-primary/50 shadow-glow"
                  : "bg-background border border-border/50"
              }`}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                    <Sparkles className="w-4 h-4" />
                    {plan.badge}
                  </div>
                </div>
              )}

              {/* Plan header */}
              <div className="text-center mb-8">
                <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {plan.description}
                </p>
                <div className="flex flex-col items-center gap-2">
                  {plan.originalPrice && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg text-muted-foreground line-through">
                        R$ {plan.originalPrice}
                      </span>
                      {plan.discountPercent && (
                        <span className="px-2 py-0.5 rounded-full bg-[hsl(var(--accent))] text-white text-xs font-bold animate-pulse">
                          {plan.discountPercent}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="font-display text-5xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>
                {plan.priceMonthly && (
                  <p className="text-sm text-primary font-semibold mt-2">
                    Equivale a R$ {plan.priceMonthly}/mês
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link to="/checkout" state={{ plan: plan.name.toLowerCase() }}>
                <Button
                  variant={plan.popular ? "sage" : "glass"}
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
      </div>
    </section>
  );
};

export default Pricing;