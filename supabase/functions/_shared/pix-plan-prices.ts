// Preços cheios compartilhados pela cobrança Woovi e pelo contexto do suporte.
export const PIX_PLAN_PRICES: Record<string, Record<string, number>> = {
  essencial: { monthly: 2990, quarterly: 5970, semestral: 8940, yearly: 11880 },
  direcao: { monthly: 4990, quarterly: 10170, semestral: 14940, yearly: 20280 },
  transformacao: { monthly: 7990, quarterly: 16170, semestral: 23940, yearly: 32280 },
  oracoes: { monthly: 1690, yearly: 14280 },
};