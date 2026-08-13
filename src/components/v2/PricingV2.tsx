import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";
import { PLAN_MONTHLY_EQUIVALENT, PlanId, fmtBRL } from "@/lib/plan-pricing";

const guarantees = [
  "7 dias por R$ 6,90 para experimentar",
  "Reembolso em 7 dias se não sentir diferença",
  "Cancele quando quiser, sem fidelidade",
  "Acesso completo a todos os recursos",
];

// Ciclos da landing. As chaves de `checkoutBilling` seguem o contrato do /v2/checkout.
type CycleId = "monthly" | "quarterly" | "semiannual" | "yearly";

const cycles: {
  id: CycleId;
  label: string;
  months: number;
  checkoutBilling: string;
  discount?: number;
}[] = [
  { id: "monthly", label: "Mensal", months: 1, checkoutBilling: "monthly" },
  { id: "quarterly", label: "Trimestral", months: 3, checkoutBilling: "quarterly", discount: 33 },
  { id: "semiannual", label: "Semestral", months: 6, checkoutBilling: "semestral", discount: 50 },
  { id: "yearly", label: "Anual", months: 12, checkoutBilling: "yearly", discount: 67 },
];

const plans: {
  id: PlanId;
  name: string;
  tag: string;
  features: string[];
  popular: boolean;
}[] = [
  { id: "essencial", name: "Essencial", tag: "Pra começar", features: ["Conversas ilimitadas 24/7", "1 sessão guiada/mês (45min)", "Memória de longo prazo"], popular: false },
  { id: "direcao", name: "Direção", tag: "Recomendado", features: ["Tudo do Essencial", "4 sessões guiadas/mês (45min)", "Resumo escrito após cada sessão"], popular: true },
  { id: "transformacao", name: "Transformação", tag: "Pra momentos de virada", features: ["Tudo do Direção", "8 sessões guiadas/mês", "Prioridade em crise"], popular: false },
];

const PricingV2 = () => {
  const [cycleId, setCycleId] = useState<CycleId>("yearly");
  const cycle = cycles.find((c) => c.id === cycleId)!;

  const essencialMonthly = PLAN_MONTHLY_EQUIVALENT.essencial[cycleId];
  const perDay = essencialMonthly / 30;

  return (
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
            7 dias para experimentar por apenas R$ 6,90. Depois, a partir de{" "}
            <span className="font-semibold text-foreground">
              {fmtBRL(perDay).replace("R$", "R$")} por dia
            </span>{" "}
            — menos que um café.
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
          <Link
            to={checkoutHref("pricing")}
            onClick={() => trackLandingCta("pricing", "Começar agora R$ 6,90 (v2)")}
          >
            <Button variant="default" size="lg" className="w-full rounded-xl bg-foreground text-background hover:bg-foreground/90">
              Começar agora por R$ 6,90
            </Button>
          </Link>
          <p className="text-center text-xs text-muted-foreground mt-3">
            Depois, a partir de {fmtBRL(PLAN_MONTHLY_EQUIVALENT.essencial.yearly)}/mês no plano anual
          </p>
        </div>
      </div>

      {/* Seletor de ciclo */}
      <div id="recursos" className="max-w-5xl mx-auto mb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-card border border-border/40">
          {cycles.map((c) => {
            const active = c.id === cycleId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCycleId(c.id)}
                aria-pressed={active}
                className={`relative rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-foreground/70 hover:bg-[hsl(var(--sage-soft))]"
                }`}
              >
                {c.label}
                {c.discount && (
                  <span
                    className={`ml-1.5 text-[10px] font-semibold ${
                      active ? "text-primary-foreground/90" : "text-amber-600"
                    }`}
                  >
                    -{c.discount}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-center text-xs text-foreground/60 mt-3">
          Todos os ciclos começam com 7 dias por R$ 6,90 · reembolso em 7 dias
        </p>
      </div>

      {/* Planos detalhados */}
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {plans.map((p) => {
          const monthly = PLAN_MONTHLY_EQUIVALENT[p.id][cycleId];
          const total = monthly * cycle.months;
          const fullMonthly = PLAN_MONTHLY_EQUIVALENT[p.id].monthly;
          return (
          <div
            key={p.id}
            className={`rounded-2xl p-6 flex flex-col bg-card border ${
              p.popular ? "border-primary shadow-lg md:-translate-y-2" : "border-border/40"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 mb-3">{p.tag}</p>
            <h3 className="font-display text-xl text-foreground">{p.name}</h3>
            <div className="mt-4 mb-1 flex items-baseline gap-1">
              <span className="text-sm text-muted-foreground">R$</span>
              <span className="font-display text-4xl text-foreground">
                {monthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <p className="mb-6 text-xs text-muted-foreground">
              {cycleId === "monthly" ? (
                "cobrado mensalmente"
              ) : (
                <>
                  <span className="line-through opacity-70">
                    {fmtBRL(fullMonthly)}
                  </span>{" "}
                  · {fmtBRL(total)} cobrado a cada {cycle.months} meses
                </>
              )}
            </p>
            <ul className="space-y-2.5 mb-6 flex-grow">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/85">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={checkoutHref("pricing")}
              state={{ plan: p.id, billing: cycle.checkoutBilling }}
              onClick={() => trackLandingCta("pricing", `${p.name} ${cycle.label} (v2)`)}
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
          );
        })}
      </div>
    </div>
  </section>
  );
};

export default PricingV2;
