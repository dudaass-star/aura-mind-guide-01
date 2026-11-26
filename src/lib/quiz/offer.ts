// Oferta do quiz: o convite inicial e a seleção usam o mesmo plano e ciclo.
export type Rhythm = "quinzenal" | "semanal" | "intensivo";
export type QuizBilling = "monthly" | "yearly";

export const INITIAL_OFFER = { plan: "essencial", billing: "monthly" } as const;

export const PAYWALL = {
  quinzenal: { plan: "essencial", name: "Essencial", sessions: "2 encontros guiados por mês", trial: "6,90", monthly: "29,90", yearlyMonth: "9,90", yearlyTotal: "118,80", off: 67 },
  semanal: { plan: "direcao", name: "Direção", sessions: "4 encontros guiados por mês", trial: "9,90", monthly: "49,90", yearlyMonth: "16,90", yearlyTotal: "202,80", off: 66 },
  intensivo: { plan: "transformacao", name: "Transformação", sessions: "8 encontros guiados por mês", trial: "19,90", monthly: "79,90", yearlyMonth: "26,90", yearlyTotal: "322,80", off: 66 },
} as const;

export function offerForCheckout(plan: string, billing: QuizBilling) {
  const config = Object.values(PAYWALL).find((offer) => offer.plan === plan);
  if (!config) return null;
  return {
    plan: config.plan,
    billing,
    today: billing === "monthly" ? config.trial : config.yearlyTotal,
    renewal: billing === "monthly" ? config.monthly : config.yearlyTotal,
    initialDays: billing === "monthly" ? 7 : null,
  };
}