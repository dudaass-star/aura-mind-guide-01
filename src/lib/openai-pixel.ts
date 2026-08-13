// Helpers do pixel do ChatGPT Ads (OpenAI).
// O código base vive em index.html; aqui só disparamos eventos com guarda,
// para que bloqueadores de script nunca quebrem a página.

/** Rotas privadas onde o pixel NÃO deve rodar (espelha o gate do index.html). */
const PRIVATE_PREFIXES = ["/admin", "/meu-espaco"];

export const isOaiqRoute = (path: string): boolean =>
  !PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

const hasOaiq = (): boolean =>
  typeof window !== "undefined" && typeof (window as any).oaiq === "function";

/** event_id estável, usado para deduplicar navegador x servidor na OpenAI. */
export const newOaiqEventId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Dispara um evento de medição no pixel da OpenAI.
 * `type` segue a documentação: "customer_action" para navegação e
 * "contents" para eventos de funil (checkout_started / purchase).
 */
export const oaiqMeasure = (
  eventName: string,
  payload: Record<string, unknown> = {},
  options: { type?: string; eventId?: string } = {},
): void => {
  if (!hasOaiq()) return;
  try {
    (window as any).oaiq(
      "measure",
      eventName,
      { type: options.type ?? "customer_action", ...payload },
      ...(options.eventId ? [{ eventId: options.eventId }] : []),
    );
  } catch {
    /* noop: rastreamento nunca deve afetar a experiência */
  }
};

/** PageView em troca de rota da SPA (o pixel só dispara sozinho na 1ª carga). */
export const oaiqPageView = (path: string): void => {
  if (!isOaiqRoute(path)) return;
  oaiqMeasure("page_view", {}, { type: "customer_action" });
};

/** Início de checkout: evento de funil (type "contents"). */
export const oaiqCheckoutStarted = (
  payload: Record<string, unknown> = {},
): string => {
  const eventId = newOaiqEventId();
  oaiqMeasure("checkout_started", payload, { type: "contents", eventId });
  return eventId;
};
