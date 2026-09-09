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
 * Erro tipado para "a Woovi não respondeu / recusou a pergunta".
 *
 * Existe porque confundir isso com "não existe parcela" custou dinheiro real:
 * a auditoria concluía "sem cobrança" quando a Woovi devolvia 429 e seguia
 * adiante sem criar o débito do ciclo. Indisponibilidade NUNCA é conclusão.
 */
export class WooviUnavailable extends Error {
  constructor(public status: number, public path: string, public raw = "") {
    super(`woovi indisponível (${status}) em ${path}`);
    this.name = "WooviUnavailable";
  }
}

// ---------------------------------------------------------------------------
// Limite de taxa
//
// A Woovi devolve 429 com `retryAfter` em segundos. A auditoria roda a cada 15
// min varrendo dezenas de mandatos, então sem fila serializada + espaçamento
// mínimo TODAS as consultas voltavam 429 e as proteções ficavam cegas.
// ---------------------------------------------------------------------------
const MIN_INTERVAL_MS = 700;
const MAX_RETRIES = 2;
const MAX_BACKOFF_MS = 20_000;
let gate: Promise<void> = Promise.resolve();
let lastCallAt = 0;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Serializa as chamadas e garante o espaçamento mínimo entre elas. */
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return await fn();
  });
  gate = run.then(() => {}, () => {});
  return run;
}

/**
 * Chamada autenticada à API da Woovi. Nunca lança em erro HTTP: devolve
 * `{ ok:false, status, raw }` para o chamador decidir. Há dinheiro real em cima,
 * então quem chama precisa ver o status, não só uma exceção genérica.
 *
 * Em 429 respeita o `retryAfter` da Woovi e repete (até MAX_RETRIES).
 */
export async function wooviFetch<T = unknown>(
  path: string,
  init: RequestInit & { body?: unknown } = {},
): Promise<WooviResponse<T>> {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) throw new Error("WOOVI_APP_ID ausente");

  const { body, headers, ...rest } = init;

  const once = async (): Promise<WooviResponse<T> & { retryAfterMs?: number }> => {
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
    let retryAfterMs: number | undefined;
    if (resp.status === 429) {
      const fromBody = Number((data as Record<string, unknown> | null)?.["retryAfter"]);
      const fromHeader = Number(resp.headers.get("retry-after"));
      const secs = Number.isFinite(fromBody) && fromBody > 0
        ? fromBody
        : Number.isFinite(fromHeader) && fromHeader > 0
          ? fromHeader
          : 5;
      retryAfterMs = Math.min(secs * 1000, MAX_BACKOFF_MS);
    }
    return { ok: resp.ok, status: resp.status, data, raw: raw.slice(0, 2000), retryAfterMs };
  };

  let attempt = 0;
  for (;;) {
    const r = await schedule(once);
    if (r.status !== 429 || attempt >= MAX_RETRIES) {
      const { retryAfterMs: _ignored, ...clean } = r;
      return clean;
    }
    attempt++;
    console.warn(`[woovi] 429 em ${path} — aguardando ${r.retryAfterMs}ms (tentativa ${attempt})`);
    await sleep(r.retryAfterMs || 5000);
  }
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
// Reciclagem de parcela (recuperação silenciosa de até 60 dias)
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

const INSTALLMENT_PAID_STATUSES = ["PAID", "COMPLETED", "CONFIRMED", "CONCLUDED"];

export interface WooviInstallment {
  globalID: string;
  status: string;
  value: number | null;
  dueDate: string | null;
  /** A parcela já tem CobR criada (não tentar criar de novo: a Woovi devolve 400). */
  hasCobr: boolean;
}

/**
 * A parcela da Woovi NÃO traz `dueDate`: o vencimento vem em `dateGenerateCharge`
 * (e, quando a CobR existe, também em `cobr.dueDate`). Ler só `dueDate` fazia a
 * auditoria concluir "sem parcela agendada" para mandatos perfeitamente em
 * ordem — e daí sair criando CobR à toa até estourar o limite de taxa da Woovi.
 */
function installmentDue(i: Record<string, any>): string | null {
  const raw = i?.dueDate || i?.dateGenerateCharge || i?.cobr?.dueDate
    || i?.cobr?.paymentDate || null;
  return raw ? String(raw).slice(0, 10) : null;
}

function toInstallment(i: Record<string, any>): WooviInstallment {
  return {
    globalID: String(i.globalID || i.id),
    status: String(i.status || "").toUpperCase(),
    value: Number.isFinite(Number(i.value)) ? Number(i.value) : null,
    dueDate: installmentDue(i),
    hasCobr: !!i?.cobr,
  };
}

/**
 * Parcela VENCIDA (ou vencendo hoje) do mandato que ainda não foi paga — a que
 * realmente precisa de nova tentativa. Devolve `null` quando a Woovi respondeu e
 * nada está vencido em aberto; se a Woovi não respondeu, LANÇA `WooviUnavailable`
 * — silêncio dela não pode virar conclusão nossa.
 *
 * Antes esta função pegava a ÚLTIMA parcela em aberto da fila, que é a mais
 * DISTANTE no futuro (o mandato tem parcelas agendadas por meses). Resultado
 * real: a retentativa do ciclo de 09/09 foi disparada contra uma parcela de
 * janeiro de 2027 e a reconferência ficou agendada para 2027 — o mês corrente
 * nunca foi cobrado. Agora escolhemos sempre a mais ANTIGA em aberto com
 * vencimento até hoje (parcela sem data conhecida entra como corrente).
 */
export async function findUnpaidInstallment(
  subscriptionId: string,
): Promise<WooviInstallment | null> {
  const path = `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/installments`;
  const r = await wooviFetch<Record<string, any>>(path);
  if (!r.ok) throw new WooviUnavailable(r.status, path, r.raw);
  const raw = r.data as Record<string, any> | null;
  const list: Record<string, any>[] = Array.isArray(raw?.installments)
    ? raw!.installments
    : Array.isArray(raw)
      ? (raw as unknown as Record<string, any>[])
      : [];
  const today = brtDate();
  const unpaid = list
    .filter((i) => !INSTALLMENT_PAID_STATUSES.includes(String(i?.status || "").toUpperCase()))
    .filter((i) => !!(i?.globalID || i?.id))
    .map(toInstallment)
    // Parcela futura não está em atraso: cobrá-la aqui é cobrar o mês errado.
    .filter((i) => !i.dueDate || i.dueDate <= today)
    .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
  if (unpaid.length === 0) return null;
  return unpaid[0];
}

// ---------------------------------------------------------------------------
// Janela de retentativa de um ciclo vencido.
//
// A autorização do cliente pode ficar viva por meses, mas cada nova tentativa
// vira notificação no app do banco — e notificar todo dia por um ciclo antigo
// desgasta e aumenta o risco de cancelamento. Regra: não retentar o mesmo
// vencimento depois de 60 dias, e nunca com intervalo menor que 3 dias.
// ---------------------------------------------------------------------------
const CYCLE_RETRY_MAX_AGE_DAYS = 60;
const CYCLE_RETRY_MIN_GAP_DAYS = 3;

export async function cycleRetryWindow(
  supabase: any,
  subscriptionId: string,
  dueDate: string | null,
): Promise<{ allowed: boolean; reason?: string; retryAt?: string }> {
  const today = brtDate();
  if (dueDate) {
    const age = Math.round(
      (Date.parse(`${today}T12:00:00-03:00`) - Date.parse(`${dueDate}T12:00:00-03:00`)) /
        86400000,
    );
    if (age > CYCLE_RETRY_MAX_AGE_DAYS) {
      return {
        allowed: false,
        reason: `vencimento ${dueDate} tem ${age} dias (> ${CYCLE_RETRY_MAX_AGE_DAYS})`,
      };
    }
  }

  let lastQuery = supabase
    .from("woovi_charges")
    .select("created_at")
    .eq("subscription_id", subscriptionId)
    .in("status", ["RETRY_REQUESTED", "COBR_CREATED", "COBR_ALREADY_EXISTS"]);
  if (dueDate) lastQuery = lastQuery.eq("due_date", dueDate);
  else lastQuery = lastQuery.is("due_date", null);
  const { data: last } = await lastQuery
    .order("created_at", { ascending: false })
    .limit(1);

  if (Array.isArray(last) && last[0]?.created_at) {
    const ageHours = (Date.now() - Date.parse(String(last[0].created_at))) / 3600000;
    if (ageHours < CYCLE_RETRY_MIN_GAP_DAYS * 24) {
      const retryAt = new Date(
        Date.parse(String(last[0].created_at)) + CYCLE_RETRY_MIN_GAP_DAYS * 86400000,
      ).toISOString();
      return {
        allowed: false,
        reason: `última tentativa há ${Math.round(ageHours)}h`,
        retryAt,
      };
    }
  }

  return { allowed: true };
}

/**
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
  const path = `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/installments`;
  const r = await wooviFetch<Record<string, any>>(path);
  // Indisponibilidade não é "sem parcela": quem chama precisa reconferir depois.
  if (!r.ok) throw new WooviUnavailable(r.status, path, r.raw);
  const raw = r.data as Record<string, any> | null;
  const list: Record<string, any>[] = Array.isArray(raw?.installments)
    ? raw!.installments
    : Array.isArray(raw)
      ? (raw as unknown as Record<string, any>[])
      : [];
  const today = brtDate();
  const scheduled = list
    .filter((i) => ["SCHEDULED", "ACTIVE", "CREATED", "PENDING"].includes(String(i?.status || "").toUpperCase()))
    .filter((i) => !!(i?.globalID || i?.id))
    .map(toInstallment)
    .filter((i) => !i.dueDate || i.dueDate >= today)
    .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
  if (scheduled.length === 0) return null;
  return scheduled[0];
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

/**
 * correlationID do CLIENTE dono do mandato, direto na Woovi.
 *
 * Serve para atribuir com segurança um pagamento do extrato quando quem pagou
 * não é a titular (marido/familiar): o extrato traz `payer.correlationID`, que é
 * o mesmo cliente Woovi do mandato. Sem isso a atribuição seria chute.
 * Indisponibilidade LANÇA `WooviUnavailable`.
 */
export async function getSubscriptionCustomerCorrelation(
  subscriptionId: string,
): Promise<string | null> {
  const path = `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
  const r = await wooviFetch<Record<string, any>>(path);
  if (!r.ok) throw new WooviUnavailable(r.status, path, r.raw);
  const raw = (r.data as Record<string, any>) || {};
  const sub = (raw.subscription || raw) as Record<string, any>;
  const cust = (sub?.customer || {}) as Record<string, any>;
  const id = cust?.correlationID || cust?.correlationId || null;
  return id ? String(id) : null;
}

/**
 * Parcelas cruas do mandato. Usado para PROVAR de quem é um pagamento que
 * apareceu só no extrato: a parcela liquidada aparece aqui no mandato certo,
 * mesmo quando quem pagou foi outra pessoa da família.
 */
export async function listInstallments(
  subscriptionId: string,
): Promise<Record<string, any>[]> {
  const path = `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/installments`;
  const r = await wooviFetch<Record<string, any>>(path);
  if (!r.ok) throw new WooviUnavailable(r.status, path, r.raw);
  const raw = r.data as Record<string, any> | null;
  return Array.isArray(raw?.installments)
    ? raw!.installments
    : Array.isArray(raw) ? (raw as unknown as Record<string, any>[]) : [];
}
