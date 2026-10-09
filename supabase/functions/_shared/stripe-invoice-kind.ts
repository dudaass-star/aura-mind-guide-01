// Ajustes proporcionais são caixa real, mas não uma mensalidade ou conversão.
type InvoiceLike = {
  billing_reason?: string | null;
  lines?: { data?: Array<{
    proration?: boolean;
    parent?: { subscription_item_details?: { proration?: boolean } | null } | null;
  }> };
};

export function isStripePlanAdjustment(invoice: InvoiceLike): boolean {
  return invoice.billing_reason === 'subscription_update' ||
    (invoice.lines?.data ?? []).some(line =>
      line.proration === true || line.parent?.subscription_item_details?.proration === true
    );
}

export function isStripeRecurringInvoice(invoice: InvoiceLike): boolean {
  return !isStripePlanAdjustment(invoice) &&
    ['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason ?? '');
}

export function stripeSubscriptionDescription(planName: string, cycle: string): string {
  const cycles: Record<string, string> = {
    monthly: 'mensal', quarterly: 'trimestral', semiannual: 'semestral', yearly: 'anual',
  };
  return `AURA ${planName} — Assinatura ${cycles[cycle] ?? cycle}`;
}