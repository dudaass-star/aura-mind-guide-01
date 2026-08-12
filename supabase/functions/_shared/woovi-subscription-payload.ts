// Opções do mandato PIX Automático da Woovi.
// Não inclua minimumValue/maximumValue: esses campos transformam a autorização
// em valor variável no arranjo Pix, mesmo quando `subscription.value` é fixo.
export type WooviJourney = "ONLY_RECURRENCY" | "PAYMENT_ON_APPROVAL";

export function buildFixedPixRecurringOptions(journey: WooviJourney) {
  return {
    journey,
    retryPolicy: "THREE_RETRIES_7_DAYS",
  } as const;
}