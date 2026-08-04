// Fonte única de verdade dos preços/SKUs de plano por ciclo.
// Usado pelo Portal (ChangePlanDialog) e por qualquer UI que mostre preço.
// Os price IDs Trim/Sem/Anual são os mesmos hardcoded em
// `supabase/functions/create-checkout/index.ts` (RECURRING_PRICES).

export type PlanId = "essencial" | "direcao" | "transformacao";
export type BillingCycle = "monthly" | "quarterly" | "semiannual" | "yearly";

export const PLAN_LABELS: Record<PlanId, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

export const PLAN_TAGLINES: Record<PlanId, string> = {
  essencial: "Apoio do dia a dia, no seu ritmo.",
  direcao: "Mais profundidade e sessões frequentes.",
  transformacao: "Acompanhamento completo, sem limites.",
};

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
};

// Equivalente mensal mostrado na UI (R$ por mês).
export const PLAN_MONTHLY_EQUIVALENT: Record<PlanId, Record<BillingCycle, number>> = {
  essencial: {
    monthly: 29.9,
    quarterly: 19.9,
    semiannual: 14.9,
    yearly: 9.9,
  },
  direcao: {
    monthly: 49.9,
    quarterly: 33.9,
    semiannual: 24.9,
    yearly: 16.9,
  },
  transformacao: {
    monthly: 79.9,
    quarterly: 53.9,
    semiannual: 39.9,
    yearly: 26.9,
  },
};

export function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}