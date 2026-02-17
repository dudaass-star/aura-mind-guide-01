import { Button } from "@/components/ui/button";
import { Check, Sparkles, MessageCircle, Calendar, FileText, Headphones, Zap, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
type BillingPeriod = "monthly" | "yearly";
const plans = [{
  id: "essencial",
  name: "Essencial",
  monthlyPrice: "29,90",
  yearlyPrice: "269,10",
  yearlyMonthlyEquivalent: "22,43",
  yearlyDiscount: 25,
  dailyPrice: {
    monthly: "~R$1/dia",
    yearly: "~R$0,74/dia"
  },
  period: {
    monthly: "/mês",
    yearly: "/ano"
  },
  description: "Suporte emocional 24/7 pra quem quer começar.",
  features: [{
    text: "Conversas ilimitadas 24/7",
    icon: MessageCircle
  }, {
    text: "Check-in diário de humor",
    icon: Check
  }, {
    text: "Review semanal",
    icon: FileText
  }, {
    text: "Respostas em texto e áudio",
    icon: Headphones
  }, {
    text: "Memória de longo prazo",
    icon: Check
  }, {
    text: "Conteúdo semanal personalizado",
    icon: BookOpen
  }],
  sessions: "—",
  cta: "Começar agora",
  popular: false,
  badge: null
}, {
  id: "direcao",
  name: "Direção",
  monthlyPrice: "49,90",
  yearlyPrice: "419,16",
  yearlyMonthlyEquivalent: "34,93",
  yearlyDiscount: 30,
  dailyPrice: {
    monthly: "~R$ 1,70 /dia",
    yearly: "~R$1,15/dia"
  },
  period: {
    monthly: "/mês",
    yearly: "/ano"
  },
  description: "Pra quem quer ir mais fundo com sessões guiadas.",
  features: [{
    text: "Tudo do Essencial",
    icon: Check
  }, {
    text: "4 Sessões Especiais/mês (45min)",
    icon: Calendar
  }, {
    text: "Metodologia estruturada",
    icon: Check
  }, {
    text: "Resumo escrito após cada sessão",
    icon: FileText
  }, {
    text: "Conteúdo semanal personalizado",
    icon: BookOpen
  }, {
    text: "Retrospectiva a cada 4 sessões",
    icon: Check
  }],
  sessions: "4/mês",
  cta: "Escolher Direção",
  popular: true,
  badge: "Mais escolhido"
}, {
  id: "transformacao",
  name: "Transformação",
  monthlyPrice: "79,90",
  yearlyPrice: "671,16",
  yearlyMonthlyEquivalent: "55,93",
  yearlyDiscount: 30,
  dailyPrice: {
    monthly: "~R$2,70/dia",
    yearly: "~R$1,84/dia"
  },
  period: {
    monthly: "/mês",
    yearly: "/ano"
  },
  description: "Pra momentos de transição e mudança profunda.",
  features: [{
    text: "Tudo do Direção",
    icon: Check
  }, {
    text: "8 Sessões Especiais/mês",
    icon: Calendar
  }, {
    text: "Prioridade no agendamento",
    icon: Zap
  }, {
    text: "Ideal para momentos de crise",
    icon: Check
  }, {
    text: "Suporte intensivo",
    icon: Check
  }, {
    text: "Conteúdo semanal personalizado",
    icon: BookOpen
  }],
  sessions: "8/mês",
  cta: "Escolher Transformação",
  popular: false,
  badge: null
}];
const Pricing = () => {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  return <section id="precos" className="py-24 bg-card relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sage-soft rounded-full blur-3xl opacity-40" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Escolha o que faz sentido{" "}
            <span className="text-gradient-sage">pra você</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">
            Todos os planos incluem acesso ilimitado à AURA 24/7.
          </p>
          
          {/* Billing period toggle */}
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setBillingPeriod("monthly")} className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${billingPeriod === "monthly" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>
              Mensal
            </button>
            <button onClick={() => setBillingPeriod("yearly")} className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${billingPeriod === "yearly" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>
              Anual
              <span className={`text-xs px-2 py-0.5 rounded-full ${billingPeriod === "yearly" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/20 text-primary"}`}>
                Economize até 30%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => {
          const price = billingPeriod === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          const period = plan.period[billingPeriod];
          const dailyPrice = plan.dailyPrice[billingPeriod];
          return <div key={index} className={`relative rounded-3xl p-6 transition-all duration-300 flex flex-col ${plan.popular ? "bg-sage-soft/40 border-2 border-primary/50 shadow-glow md:scale-105" : "bg-background border border-border/50"}`}>
              {/* Popular badge */}
              {plan.badge && <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                    <Sparkles className="w-4 h-4" />
                    {plan.badge}
                  </div>
                </div>}

              {/* Yearly discount badge */}
              {billingPeriod === "yearly" && <div className="absolute -top-4 right-4">
                <div className="px-3 py-1 rounded-full bg-green-500/90 text-white text-xs font-semibold">
                  -{plan.yearlyDiscount}%
                </div>
              </div>}

              {/* Plan header */}
              <div className="text-center mb-6">
                <h3 className="font-display text-xl font-bold text-foreground mb-2">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground text-sm mb-4 min-h-[40px]">
                  {plan.description}
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <span className="font-display text-4xl font-bold text-foreground transition-all duration-300">
                    {price}
                  </span>
                  <span className="text-muted-foreground">{period}</span>
                </div>
                {billingPeriod === "yearly" && <p className="text-xs text-muted-foreground mt-1">
                    equivale a R${plan.yearlyMonthlyEquivalent}/mês
                  </p>}
                <p className="text-xs text-primary font-medium mt-1">
                  {dailyPrice}
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-6 flex-grow">
                {plan.features.map((feature, featureIndex) => <li key={featureIndex} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                      <feature.icon className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground text-sm">{feature.text}</span>
                  </li>)}
              </ul>

              {/* CTA */}
              <Link to="/checkout" state={{
              plan: plan.id,
              billing: billingPeriod
            }}>
                <Button variant={plan.popular ? "sage" : "glass"} size="lg" className="w-full">
                  {plan.cta}
                </Button>
              </Link>
            </div>;
        })}
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-4 mt-10 text-sm text-muted-foreground">
          <span>✓ 5 conversas grátis pra começar</span>
          <span>✓ Cancela ou pausa quando quiser</span>
          <span>✓ Sem fidelidade</span>
        </div>

        {/* Sessions explanation */}
        <div className="mt-16 max-w-3xl mx-auto text-center">
          <h3 className="font-display text-xl font-semibold text-foreground mb-4">
            O que são as Sessões Especiais?
          </h3>
          <p className="text-muted-foreground mb-6">São encontros de 45 minutos só seus com a AURA, com metodologia estruturada. Diferente do chat do dia a dia, as sessões são mais profundas, reflexivas e focadas em transformação real.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="font-semibold text-foreground mb-1">Sessão de Clareza</p>
              <p className="text-muted-foreground">Decisões difíceis e escolhas importantes</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="font-semibold text-foreground mb-1">Sessão de Padrões</p>
              <p className="text-muted-foreground">Comportamentos que se repetem</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="font-semibold text-foreground mb-1">Sessão de Propósito</p>
              <p className="text-muted-foreground">Sentido e direção de vida</p>
            </div>
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="font-semibold text-foreground mb-1">Sessão Livre</p>
              <p className="text-muted-foreground">Tema aberto, você escolhe</p>
            </div>
          </div>
        </div>
      </div>
    </section>;
};
export default Pricing;