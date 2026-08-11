// Cliente compartilhado do Banco Inter — trilho de PIX Automático (Bacen).
//
// Duas responsabilidades, e só duas:
//   1. Montar o `Deno.HttpClient` com mTLS (o Inter exige certificado de cliente
//      em TODAS as rotas, inclusive no OAuth).
//   2. Emitir e cachear o token OAuth `client_credentials`.
//
// Nomenclatura de escopos: o Inter segue o BACEN (`rec`, `solicrec`, `cobr`,
// `webhookrec`, `payloadlocationrec`) — NÃO existe `pix.automatico.*`. Isso já
// custou uma rodada inteira de diagnóstico; não trocar sem sonda.
//
// Certificado: a integração "Ola Aura" expira em 11/08/2027. Certificado vencido
// derruba TODA a cobrança recorrente de uma vez — a rotação é obrigatória e
// vigiada pelo `inter-health-check`.

export const INTER_API_BASE = "https://cdpj.partners.bancointer.com.br";
const OAUTH_URL = `${INTER_API_BASE}/oauth/v2/token`;

// Todos os escopos concedidos à integração. Pedimos o conjunto inteiro num único
// token: o Inter devolve só os registrados e aplica rate limit agressivo no
// OAuth, então um token largo e cacheado é mais seguro que vários específicos.
export const INTER_SCOPES = [
  "rec.read",
  "rec.write",
  "solicrec.read",
  "solicrec.write",
  "cobr.read",
  "cobr.write",
  "webhookrec.read",
  "webhookrec.write",
  "webhookcobr.read",
  "webhookcobr.write",
  "payloadlocationrec.read",
  "payloadlocationrec.write",
  // Pix Cobrança: a Jornada 2 exige criar um `cob` imediato com `loc` para que o
  // QR Code carregue o 1º pagamento E a autorização do mandato no mesmo scan.
  "cob.read",
  "cob.write",
  "pix.read",
  "pix.write",
  "payloadlocation.read",
  "payloadlocation.write",
  "webhook.read",
  "webhook.write",
].join(" ");

/**
 * Normaliza cert/chave para PEM. O Inter às vezes entrega base64 puro (DER sem
 * armadura); `createHttpClient` só aceita PEM.
 */
function toPem(raw: string | undefined, label: string): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (v.includes("-----BEGIN")) {
    return v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join("\n") + "\n";
  }
  const b64 = v.replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

let cachedClient: unknown | null = null;

/** HttpClient com mTLS, reaproveitado entre chamadas da mesma instância. */
export function getInterHttpClient(): unknown {
  if (cachedClient) return cachedClient;
  const cert = toPem(Deno.env.get("INTER_CERT_PEM"), "CERTIFICATE");
  const key = toPem(Deno.env.get("INTER_KEY_PEM"), "PRIVATE KEY");
  if (!cert || !key) {
    throw new Error("INTER_CERT_PEM/INTER_KEY_PEM ausentes — mTLS impossível");
  }
  const factory = (Deno as unknown as { createHttpClient?: (o: unknown) => unknown })
    .createHttpClient;
  if (typeof factory !== "function") {
    throw new Error("Runtime sem Deno.createHttpClient — mTLS indisponível");
  }
  cachedClient = factory({ cert, key });
  return cachedClient;
}

// Cache de token em memória do isolate. O OAuth do Inter dá 429 com facilidade,
// então nunca pedimos token por requisição.
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getInterToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const clientId = Deno.env.get("INTER_CLIENT_ID");
  const clientSecret = Deno.env.get("INTER_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("INTER_CLIENT_ID/INTER_CLIENT_SECRET ausentes");
  }

  const resp = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: INTER_SCOPES,
    }),
    client: getInterHttpClient(),
  } as RequestInit);

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Inter OAuth ${resp.status}: ${text.slice(0, 300) || "(body vazio)"}`);
  }
  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Inter OAuth devolveu body não-JSON: ${text.slice(0, 200)}`);
  }
  if (!json.access_token) throw new Error("Inter OAuth sem access_token");

  // Margem de 60s pra não usar token no limiar da expiração.
  const ttl = Math.max(60, (json.expires_in ?? 3600) - 60);
  tokenCache = { token: json.access_token, expiresAt: Date.now() + ttl * 1000 };
  return json.access_token;
}

export type InterResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  /** Corpo cru truncado — usado no log quando o Inter devolve erro. */
  raw: string;
};

/**
 * Chamada autenticada à API do Inter. Não lança em erro HTTP: devolve
 * `{ ok:false, status, raw }` para quem chamou decidir. Dinheiro real em cima —
 * o chamador precisa ver o status, não só uma exceção genérica.
 */
export async function interFetch<T = unknown>(
  path: string,
  init: RequestInit & { body?: unknown } = {},
): Promise<InterResponse<T>> {
  const token = await getInterToken();
  const { body, headers, ...rest } = init;
  const resp = await fetch(`${INTER_API_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    },
    ...(body !== undefined
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
    client: getInterHttpClient(),
  } as RequestInit);

  const raw = await resp.text();
  let data: T | null = null;
  try {
    data = raw ? (JSON.parse(raw) as T) : null;
  } catch {
    data = null;
  }
  if (!resp.ok) {
    console.error(`[inter-pix] ${init.method || "GET"} ${path} → ${resp.status}: ${raw.slice(0, 500)}`);
  }
  return { ok: resp.ok, status: resp.status, data, raw: raw.slice(0, 2000) };
}

/** txid do Bacen: 26–35 chars, apenas [A-Za-z0-9]. */
export function buildTxid(prefix = "aura"): string {
  const rand = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}${rand}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 35);
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
