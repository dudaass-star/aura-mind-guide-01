import { Link } from "react-router-dom";
import { Check, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/ga4";

const guarantees = [
  "7 dias por R$ 6,90",
  "Cancele quando quiser",
  "Sem fidelidade",
  "Acesso completo a todos os recursos",
];

const plans = [
  { id: "essencial", name: "Essencial", price: "29,90", tag: "Pra começar", features: ["Conversas ilimitadas 24/7", "Check-in diário", "Memória de longo prazo"], popular: false },
  { id: "direcao", name: "Direção", price: "49,90", tag: "Mais escolhido", features: ["Tudo do Essencial", "4 sessões guiadas/mês (45min)", "Resumo escrito após cada sessão"], popular: true },
  { id: "transformacao", name: "Transformação", price: "79,90", tag: "Pra momentos de virada", features: ["Tudo do Direção", "8 sessões guiadas/mês", "Prioridade em crise"], popular: false },
];

const PricingV2 = () => (
  <section id="precos" className="relative py-24 md:py-32 bg-[hsl(var(--sage-soft))]">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto mb-16">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary/80 mb-4">sem planos complicados</p>
          <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.1] tracking-tight text-foreground">
            Comece sua jornada
            <br /> hoje mesmo.
          </h2>
          <p className="mt-5 text-base text-foreground/75 max-w-md">
            7 dias para experimentar por apenas R$ 6,90. Depois, menos de R$ 1,00 por dia.
          </p>
        </div>

        <div className="bg-card rounded-3xl p-8 shadow-xl border border-border/40">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[hsl(var(--sage-soft))] flex items-center justify-center">
              <BadgeCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-xl text-foreground">Experimente sem risco</h3>
            </div>
          </div>
          <ul className="space-y-3 mb-6">
            {guarantees.map((g) => (
              <li key={g} className="flex items-center gap-3 text-sm text-foreground/85">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                {g}
              </li>
            ))}
          </ul>
          <Link to="/checkout" onClick={() => trackCtaClick("pricing", "Começar agora R$ 6,90 (v2)")}>
            <Button variant="default" size="lg" className="w-full rounded-xl bg-foreground text-background hover:bg-foreground/90">
              Começar agora por R$ 6,90
            </Button>
          </Link>
          <p className="text-center text-xs text-muted-foreground mt-3">
            Após 7 dias, R$ 29,90/mês ou R$ 299/ano
          </p>
        </div>
      </div>

      {/* Planos detalhados */}
      <div id="recursos" className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl p-6 flex flex-col bg-card border ${
              p.popular ? "border-primary shadow-lg md:-translate-y-2" : "border-border/40"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 mb-3">{p.tag}</p>
            <h3 className="font-display text-xl text-foreground">{p.name}</h3>
            <div className="mt-4 mb-6 flex items-baseline gap-1">
              <span className="text-sm text-muted-foreground">R$</span>
              <span className="font-display text-4xl text-foreground">{p.price}</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <ul className="space-y-2.5 mb-6 flex-grow">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/85">
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
                variant={p.popular ? "sage" : "outline"}
                size="default"
                className="w-full rounded-xl"
              >
                Começar
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default PricingV2;
