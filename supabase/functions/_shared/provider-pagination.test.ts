import { describe, expect, test } from 'bun:test';
import { collectProviderPages } from './provider-pagination';
describe('Paginação financeira completa', () => {
  const identity = (i: { id: string }) => i.id;
  test('alcança pagamentos após 5.000 lançamentos', async () => {
    const rows = Array.from({ length: 5103 }, (_, n) => ({ id: String(n) }));
    expect(await collectProviderPages(async (offset, limit) => ({ items: rows.slice(offset, offset + limit), total: rows.length }), identity)).toEqual(rows);
  });
  test('busca a página vazia final para múltiplos do limite', async () => {
    const offsets: number[] = [];
    await collectProviderPages(async (offset) => { offsets.push(offset); return { items: offset < 200 ? Array.from({ length: 100 }, (_, n) => ({ id: String(offset + n) })) : [] }; }, identity);
    expect(offsets).toEqual([0, 100, 200]);
  });
  test('respeita continuação explícita com página curta', async () => {
    expect((await collectProviderPages(async (offset) => ({ items: [{ id: String(offset) }], hasMore: offset === 0, total: 2 }), identity)).length).toBe(2);
  });
  test('recusa página repetida', async () => {
    await expect(collectProviderPages(async () => ({ items: [{ id: '1' }], hasMore: true }), identity)).rejects.toThrow('página repetida');
  });
  test('recusa total incompatível', async () => {
    await expect(collectProviderPages(async () => ({ items: [{ id: '1' }], hasMore: false, total: 200 }), identity)).rejects.toThrow('total');
  });
  test('recusa erro posterior sem devolver os primeiros pagamentos', async () => {
    await expect(collectProviderPages(async (offset) => { if (offset) throw new Error('Indisponível'); return { items: [{ id: '1' }], hasMore: true }; }, identity)).rejects.toThrow('Indisponível');
  });
  test('recusa teto e página vazia inconsistente', async () => {
    await expect(collectProviderPages(async (offset) => ({ items: [{ id: String(offset) }], hasMore: true }), identity, 1, 2)).rejects.toThrow('limite de segurança');
    await expect(collectProviderPages(async () => ({ items: [], hasMore: true }), identity)).rejects.toThrow('página vazia');
  });
});
