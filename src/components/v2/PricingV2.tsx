import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { trackCtaClick } from "@/lib/ga4";

const plans = [
  {
    id: "essencial",
    name: "Essencial",
    price: "29,90",
    tag: "Pra começar",
    features: ["Conversas ilimitadas 24/7", "Check-in diário", "Memória de longo prazo"],
    popular: false,
  },
  {
    id: "direcao",
    name: "Direção",
    price: "49,90",
    tag: "Mais escolhido",
    features: ["Tudo do Essencial", "4 sessões guiadas/mês (45min)", "Resumo escrito após cada sessão"],
    popular: true,
  },
  {
    id: "transformacao",
    name: "Transformação",
    price: "79,90",
    tag: "Pra momentos de virada",
    features: ["Tudo do Direção", "8 sessões guiadas/mês", "Prioridade em crise"],
    popular: false,
  },
];

const PricingV2 = () => (
  <section id="precos" className="relative py-28 md:py-36 bg-background overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] v2-glow-sage pointer-events-none" />

    <div className="container mx-auto px-6 relative z-10">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4">planos</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
          Escolha o que faz sentido{" "}
          <span className="text-gradient-sage">pra você.</span>
        </h2>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`relative rounded-3xl p-8 flex flex-col transition-all duration-500 ${
              p.popular
                ? "bg-card border border-primary/50 shadow-[0_0_60px_hsl(var(--primary)/0.18)] md:-translate-y-2"
                : "bg-card/60 border border-border/60 hover:border-border"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-primary/80 mb-4">{p.tag}</p>
            <h3 className="font-display text-2xl text-foreground">{p.name}</h3>

            <div className="mt-6 mb-8 flex items-baseline gap-1">
              <span className="text-sm text-muted-foreground">R$</span>
              <span className="font-display text-5xl text-foreground">{p.price}</span>
              <span className="text-muted-foreground">/mês</span>
            </div>

            <ul className="space-y-3 mb-8 flex-grow">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground/85">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              to="/checkout"
              state={{ plan: p.id, billing: "monthly" }}
              onClick={() => trackCtaClick("pricing", `${p.name} (v2)`)}
            >
              <Button
                variant={p.popular ? "sage" : "glass"}
                size="lg"
                className="w-full rounded-full"
              >
                Começar
              </Button>
            </Link>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground mt-10">
        7 dias por R$ 6,90 · Cancele quando quiser · Sem fidelidade
      </p>
    </div>
  </section>
);

export default PricingV2;
