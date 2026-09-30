import type { WooviResponse } from "./woovi.ts";

export type WooviCaller = <T = unknown>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown },
) => Promise<WooviResponse<T>>;

export type RecoveredCreation<T> = {
  response: WooviResponse<T>;
  recovered: boolean;
  outcome: "created" | "recovered" | "definitive_failure" | "unknown";
};

export function isAmbiguousWooviStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/**
 * Cria um recurso financeiro com identidade estável. Se a resposta for ambígua,
 * consulta a mesma identidade antes de repetir; a repetição mantém o mesmo
 * correlationID e por isso não cria uma segunda operação.
 */
export async function createWithWooviReconciliation<T>(
  call: WooviCaller,
  options: { createPath: string; lookupPath: string; body: Record<string, unknown> },
): Promise<RecoveredCreation<T>> {
  const first = await call<T>(options.createPath, { method: "POST", body: options.body });
  if (first.ok) return { response: first, recovered: false, outcome: "created" };
  if (!isAmbiguousWooviStatus(first.status)) {
    return { response: first, recovered: false, outcome: "definitive_failure" };
  }

  const lookup = await call<T>(options.lookupPath);
  if (lookup.ok) return { response: lookup, recovered: true, outcome: "recovered" };
  if (lookup.status !== 404) {
    return { response: first, recovered: false, outcome: "unknown" };
  }

  const retry = await call<T>(options.createPath, { method: "POST", body: options.body });
  if (retry.ok) return { response: retry, recovered: false, outcome: "created" };
  if (!isAmbiguousWooviStatus(retry.status)) {
    return { response: retry, recovered: false, outcome: "definitive_failure" };
  }

  const finalLookup = await call<T>(options.lookupPath);
  if (finalLookup.ok) return { response: finalLookup, recovered: true, outcome: "recovered" };
  return { response: retry, recovered: false, outcome: "unknown" };
}