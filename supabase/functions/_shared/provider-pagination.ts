/** Uma coleção parcial nunca é devolvida como completa. */
export async function collectProviderPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; hasMore?: boolean; total?: number }>,
  identity: (item: T) => string,
  pageSize = 100,
  maxPages = 1000,
): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const { items, hasMore, total } = await fetchPage(offset, pageSize);
    if (!Array.isArray(items)) throw new Error('Resposta de paginação inválida');
    for (const item of items) {
      const id = identity(item);
      if (!id || seen.has(id)) throw new Error('Paginação incompleta: registro sem identidade ou página repetida');
      seen.add(id); result.push(item);
    }
    offset += items.length;
    if (hasMore === false || (hasMore === undefined && items.length < pageSize)) {
      if (total !== undefined && result.length !== total) throw new Error('Paginação incompleta: total do provedor não confere');
      return result;
    }
    if (!items.length) throw new Error('Paginação incompleta: página vazia com continuação');
  }
  throw new Error('Paginação incompleta: limite de segurança atingido');
}
