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

// ---------------------------------------------------------------------------
// Reciclagem de parcela (recuperação silenciosa de ~30 dias)
//
// O Bacen permite criar/retentar a cobrança recorrente (CobR) de uma parcela
// entre 2 e 10 dias antes do vencimento, e a Woovi expõe isso em:
//   GET  /api/v1/subscriptions/{id}/installments
//   POST /api/v1/installments/{id}/cobr        (cria a CobR da parcela)
//   POST /api/v1/installments/{id}/cobr/retry  (retenta, valor opcional)
// É por aqui que encadeamos novas tentativas sem pedir nova autorização ao
// cliente — e é também como aplicamos desconto (valor menor na retentativa).
// Doc: https://developers.woovi.com/docs/pix-automatic/pix-automatic-cobr-manual
// ---------------------------------------------------------------------------

const INSTALLMENT_PAID_STATUSES = ["PAID", "COMPLETED", "CONFIRMED"];

export interface WooviInstallment {
  globalID: string;
  status: string;
  value: number | null;
  dueDate: string | null;
}

/**
 * Parcela mais recente do mandato que ainda NÃO foi paga (a que precisa de nova
 * tentativa). Devolve `null` quando a Woovi não responde ou tudo está pago.
 */
export async function findUnpaidInstallment(
  subscriptionId: string,
): Promise<WooviInstallment | null> {
  const r = await wooviFetch<Record<string, any>>(
    `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/installments`,
  );
  if (!r.ok) return null;
  const raw = r.data as Record<string, any> | null;
  const list: Record<string, any>[] = Array.isArray(raw?.installments)
    ? raw!.installments
    : Array.isArray(raw)
      ? (raw as unknown as Record<string, any>[])
      : [];
  const unpaid = list
    .filter((i) => !INSTALLMENT_PAID_STATUSES.includes(String(i?.status || "").toUpperCase()))
    .filter((i) => !!(i?.globalID || i?.id));
  if (unpaid.length === 0) return null;
  // A Woovi devolve as parcelas em ordem crescente; a última em aberto é a atual.
  const target = unpaid[unpaid.length - 1];
  return {
    globalID: String(target.globalID || target.id),
    status: String(target.status || "").toUpperCase(),
    value: Number.isFinite(Number(target.value)) ? Number(target.value) : null,
    dueDate: target.dueDate ? String(target.dueDate).slice(0, 10) : null,
  };
}

/**
 * Nova tentativa de débito na mesma parcela (mesmo mandato, sem novo scan).
 * `valueCents` permite retentar com valor menor — é assim que o desconto de
 * retenção entra no trilho PIX, onde não existe cupom.
 */
export async function retryInstallmentCobr(
  installmentId: string,
  valueCents?: number,
): Promise<WooviResponse<Record<string, any>>> {
  const body = valueCents && valueCents > 0 ? { value: valueCents } : undefined;
  const retry = await wooviFetch<Record<string, any>>(
    `/api/v1/installments/${encodeURIComponent(installmentId)}/cobr/retry`,
    { method: "POST", ...(body ? { body } : {}) } as RequestInit & { body?: unknown },
  );
  if (retry.ok) return retry;
  // Parcela que ainda não tem CobR criada: cria em vez de retentar.
  return await wooviFetch<Record<string, any>>(
    `/api/v1/installments/${encodeURIComponent(installmentId)}/cobr`,
    { method: "POST", ...(body ? { body } : {}) } as RequestInit & { body?: unknown },
  );
}

/** Cria a CobR de uma parcela agendada (janela de 5 a 10 dias antes do vencimento). */
export async function createInstallmentCobr(
  installmentId: string,
  valueCents?: number,
): Promise<WooviResponse<Record<string, any>>> {
  const body = valueCents && valueCents > 0 ? { value: valueCents } : undefined;
  return await wooviFetch<Record<string, any>>(
    `/api/v1/installments/${encodeURIComponent(installmentId)}/cobr`,
    { method: "POST", ...(body ? { body } : {}) } as RequestInit & { body?: unknown },
  );
}

/**
 * Próxima parcela AGENDADA do mandato — é ela que cobre a recuperação real.
 *
 * Regra do Bacen: a CobR só pode ser criada de 2 a 10 dias antes do vencimento
 * (a Woovi cria sozinha no 4º dia antes, deixando a criação manual entre o 5º e
 * o 10º). Ou seja: NÃO existe forçar a parcela vencida indefinidamente — o que
 * recupera o cliente é o ciclo seguinte, que o mandato vivo cobra sozinho com
 * outras 3 tentativas em 7 dias.
 */
export async function findScheduledInstallment(
  subscriptionId: string,
): Promise<WooviInstallment | null> {
  const r = await wooviFetch<Record<string, any>>(
    `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/installments`,
  );
  if (!r.ok) return null;
  const raw = r.data as Record<string, any> | null;
  const list: Record<string, any>[] = Array.isArray(raw?.installments)
    ? raw!.installments
    : Array.isArray(raw)
      ? (raw as unknown as Record<string, any>[])
      : [];
  const today = brtDate();
  const scheduled = list
    .filter((i) => ["SCHEDULED", "ACTIVE"].includes(String(i?.status || "").toUpperCase()))
    .filter((i) => !!(i?.globalID || i?.id))
    .filter((i) => !i?.dueDate || String(i.dueDate).slice(0, 10) >= today);
  if (scheduled.length === 0) return null;
  const target = scheduled[0];
  return {
    globalID: String(target.globalID || target.id),
    status: String(target.status || "").toUpperCase(),
    value: Number.isFinite(Number(target.value)) ? Number(target.value) : null,
    dueDate: target.dueDate ? String(target.dueDate).slice(0, 10) : null,
  };
}

/** Dias corridos entre hoje (BRT) e uma data YYYY-MM-DD. */
export function daysUntil(dateStr: string): number {
  const due = Date.parse(`${dateStr}T12:00:00-03:00`);
  const now = Date.parse(`${brtDate()}T12:00:00-03:00`);
  return Math.round((due - now) / 86400000);
}

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
