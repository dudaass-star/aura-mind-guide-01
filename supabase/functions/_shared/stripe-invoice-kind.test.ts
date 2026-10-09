import { describe, expect, test } from 'bun:test';
import { isStripePlanAdjustment, isStripeRecurringInvoice, stripeSubscriptionDescription } from './stripe-invoice-kind';

describe('Classificação de faturas Stripe', () => {
  test('diferença de R$4,30 é ajuste, não mensalidade', () => {
    const invoice = { billing_reason: 'subscription_update' };
    expect(isStripePlanAdjustment(invoice)).toBe(true);
    expect(isStripeRecurringInvoice(invoice)).toBe(false);
  });
  test('reconhece proração nas duas versões da API', () => {
    for (const line of [{ proration: true }, { parent: { subscription_item_details: { proration: true } } }]) {
      const invoice = { billing_reason: 'subscription_cycle', lines: { data: [line] } };
      expect(isStripePlanAdjustment(invoice)).toBe(true);
      expect(isStripeRecurringInvoice(invoice)).toBe(false);
    }
  });
  test('preserva primeira mensalidade e renovação completas', () => {
    for (const billing_reason of ['subscription_create', 'subscription_cycle']) {
      expect(isStripeRecurringInvoice({ billing_reason })).toBe(true);
    }
    expect(isStripeRecurringInvoice({ billing_reason: 'manual' })).toBe(false);
    expect(isStripeRecurringInvoice({ billing_reason: 'subscription_threshold' })).toBe(false);
  });
  test('nome acompanha plano e os quatro ciclos', () => {
    expect(stripeSubscriptionDescription('Essencial', 'monthly')).toBe('AURA Essencial — Assinatura mensal');
    expect(stripeSubscriptionDescription('Direção', 'quarterly')).toContain('trimestral');
    expect(stripeSubscriptionDescription('Transformação', 'semiannual')).toContain('semestral');
    expect(stripeSubscriptionDescription('Essencial', 'yearly')).toContain('anual');
  });
});