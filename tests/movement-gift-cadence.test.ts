import { test, expect } from 'bun:test';
import { canOfferGift } from '../src/lib/movement-gift-cadence';

const now = Date.UTC(2026, 9, 19);
const day = 86_400_000;

test('degustação nunca recebe convite', () => {
  expect(canOfferGift({ status: 'degustacao', state: {}, now, trigger: 'session', rating: 5 })).toBe(false);
});
test('sessão só com nota 4 ou 5', () => {
  expect(canOfferGift({ status: 'active', state: {}, now, trigger: 'session', rating: 3 })).toBe(false);
  expect(canOfferGift({ status: 'active', state: {}, now, trigger: 'session', rating: 4 })).toBe(true);
});
test('silêncio de 21 dias após exibição', () => {
  expect(canOfferGift({ status: 'active', state: { lastPromptAt: now - 20 * day }, now, trigger: 'session', rating: 5 })).toBe(false);
  expect(canOfferGift({ status: 'active', state: { lastPromptAt: now - 21 * day }, now, trigger: 'session', rating: 5 })).toBe(true);
});
test('oração só a partir da 3ª concluída', () => {
  expect(canOfferGift({ status: 'active', state: { prayersCompleted: 2 }, now, trigger: 'prayer' })).toBe(false);
  expect(canOfferGift({ status: 'active', state: { prayersCompleted: 3 }, now, trigger: 'prayer' })).toBe(true);
});
test('quem já compartilhou não recebe mais', () => {
  expect(canOfferGift({ status: 'active', state: { sharedAt: now - 60 * day }, now, trigger: 'session', rating: 5 })).toBe(false);
});
