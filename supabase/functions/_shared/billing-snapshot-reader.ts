// Compatibilidade de leitura com os recortes legados, sem chamadas ao provedor.
type Row = Record<string, any>;
export function billingSnapshotReader(snapshot: Row) {
  const page = (rows: Row[], params: Row = {}) => {
    const start = params.starting_after ? rows.findIndex(r => r.id === params.starting_after) + 1 : 0;
    const data = rows.slice(start, start + (params.limit || 100));
    const result = { data, has_more: start + data.length < rows.length, next_page: null };
    return Object.assign(Promise.resolve(result), { async *[Symbol.asyncIterator]() { yield* rows; } });
  };
  return {
    invoices: { list: (params: Row = {}) => page((snapshot.invoices || []).filter((r: Row) => !params.customer || r.customer === params.customer), params) },
    subscriptions: { list: (params: Row = {}) => page((snapshot.subscriptions || []).filter((r: Row) => (!params.status || params.status === 'all' || r.status === params.status) && (!params.created?.gte || r.created >= params.created.gte) && (!params.created?.lt || r.created < params.created.lt)), params) },
    charges: { search: (params: Row) => {
      const amount = Number(params.query.match(/amount:(\d+)/)?.[1]);
      const rows = (snapshot.weeklyCharges || []).filter((r: Row) => r.amount === amount && r.status === 'succeeded');
      const start = Number(params.page || 0), data = rows.slice(start, start + params.limit);
      return Promise.resolve({ data, has_more: start + data.length < rows.length, next_page: String(start + data.length) });
    } },
  };
}