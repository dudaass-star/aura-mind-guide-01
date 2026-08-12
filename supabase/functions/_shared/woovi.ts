// Cliente compartilhado da Woovi (OpenPix) — trilho de PIX Automático (Bacen).
//
// Diferente do Inter, a Woovi não exige mTLS nem OAuth: a autenticação é o
// próprio AppID no header `Authorization`. Guardamos ele em WOOVI_APP_ID.
//
// Por que a Woovi existe no projeto: ela implementa a JORNADA 3
// (`PAYMENT_ON_APPROVAL`), em que UM único QR Code cobra o valor de entrada E
// autoriza o mandato recorrente no mesmo scan — a UX que o Inter não entrega
// (o Inter só faz a Jornada 2, com aprovação separada).
export const WOOVI_API_BASE = "https://api.woovi.com";

export type WooviResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  /** Corpo cru truncado — usado no log quando a Woovi devolve erro. */
  raw: string;
};

/**
 * Chamada autenticada à API da Woovi. Nunca lança em erro HTTP: devolve
 * `{ ok:false, status, raw }` para o chamador decidir. Há dinheiro real em cima,
 * então quem chama precisa ver o status, não só uma exceção genérica.
 */
export async function wooviFetch<T = unknown>(
  path: string,
  init: RequestInit & { body?: unknown } = {},
): Promise<WooviResponse<T>> {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) throw new Error("WOOVI_APP_ID ausente");

  const { body, headers, ...rest } = init;
  const resp = await fetch(`${WOOVI_API_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: appId,
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });

  const raw = await resp.text();
  let data: T | null = null;
  try {
    data = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    data = null;
  }
  if (!resp.ok) {
    console.error(`[woovi] ${init.method || "GET"} ${path} → ${resp.status}: ${raw.slice(0, 500)}`);
  }
  return { ok: resp.ok, status: resp.status, data, raw: raw.slice(0, 2000) };
}

/** Data no formato YYYY-MM-DD no fuso de Brasília (padrão absoluto do projeto). */
export function brtDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Frequências aceitas pelo Pix Automático da Woovi (BIMONTHLY não é suportado). */
export const WOOVI_FREQUENCY: Record<string, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  semestral: "SEMIANNUALLY",
  yearly: "ANNUALLY",
};

// ---------------------------------------------------------------------------
// Vocabulário de status do mandato
//
// A Woovi devolve status em inglês (ACTIVE / APPROVED / REJECTED / ...), mas
// todo o resto do projeto (auditoria, guarda anti-duplicidade, dunning) fala
// português (APROVADA / REJEITADA / CANCELADA). Se cada função traduzir do seu
// jeito, os mecanismos de segurança ficam cegos — foi exatamente o que
// aconteceu. Este é o ÚNICO ponto de tradução do trilho.
// ---------------------------------------------------------------------------
export const WOOVI_APPROVED_STATUSES = [
  "APPROVED", "PIX_AUTOMATIC_APPROVED", "ACTIVE", "AUTHORIZED",
];
export const WOOVI_REJECTED_STATUSES = [
  "REJECTED", "PIX_AUTOMATIC_REJECTED", "EXPIRED", "PIX_AUTOMATIC_EXPIRED",
];
export const WOOVI_CANCELED_STATUSES = [
  "CANCELED", "CANCELLED", "PIX_AUTOMATIC_CANCELED", "INACTIVE",
];
export const WOOVI_PAID_STATUSES = [
  "COMPLETED", "PAID", "CONFIRMED", "PIX_AUTOMATIC_COBR_COMPLETED",
];

/** Rótulos internos que significam "mandato vivo, debitando". */
export const MANDATE_ACTIVE_STATUSES = ["APROVADA", "ATIVA"];

/**
 * Traduz o status cru da Woovi para o vocabulário interno. Status desconhecido
 * (ou mandato ainda em criação) volta como `fallback` — nunca inventamos
 * "aprovada" para algo que não conhecemos: há dinheiro real em cima.
 */
export function normalizeMandateStatus(remote: unknown, fallback = "CRIANDO"): string {
  const s = String(remote ?? "").toUpperCase().trim();
  if (!s) return fallback;
  if (WOOVI_APPROVED_STATUSES.includes(s)) return "APROVADA";
  if (WOOVI_REJECTED_STATUSES.includes(s)) return "REJEITADA";
  if (WOOVI_CANCELED_STATUSES.includes(s)) return "CANCELADA";
  if (["CREATED", "PENDING", "WAITING", "PIX_AUTOMATIC_CREATED"].includes(s)) return "AGUARDANDO";
  return fallback;
}
