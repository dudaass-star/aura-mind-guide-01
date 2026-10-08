import { expect, test } from 'bun:test';
import { billingSnapshotReader } from './billing-snapshot-reader';
test('paginação percorre toda a cópia sem chamadas externas', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => ({ id: String(i), status: 'active', created: i }));
  const reader = billingSnapshotReader({ subscriptions: rows });
  const first = await reader.subscriptions.list({ limit: 100 });
  const second = await reader.subscriptions.list({ limit: 100, starting_after: first.data.at(-1)?.id });
  const last = await reader.subscriptions.list({ limit: 100, starting_after: second.data.at(-1)?.id });
  expect(first.has_more).toBe(true);
  expect(last.has_more).toBe(false);
  expect(first.data.length + second.data.length + last.data.length).toBe(205);
  let count = 0;
  for await (const _row of reader.subscriptions.list()) count++;
  expect(count).toBe(205);
});