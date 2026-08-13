// Helpers do pixel do ChatGPT Ads (OpenAI).
// O código base vive em index.html; aqui só disparamos eventos com guarda,
// para que bloqueadores de script nunca quebrem a página.

/** Rotas privadas onde o pixel NÃO deve rodar (espelha o gate do index.html). */
const PRIVATE_PREFIXES = ["/admin", "/meu-espaco"];

export const isOaiqRoute = (path: string): boolean =>
  !PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

const hasOaiq = (): boolean =>
  typeof window !== "undefined" && typeof (window as any).oaiq === "function";

/** Dispara um evento de medição no pixel da OpenAI. */
export const oaiqMeasure = (
  eventName: string,
  payload: Record<string, unknown> = {},
): void => {
  if (!hasOaiq()) return;
  try {
    (window as any).oaiq("measure", eventName, {
      type: "customer_action",
      ...payload,
    });
  } catch {
    /* noop: rastreamento nunca deve afetar a experiência */
  }
};

/** PageView em troca de rota da SPA (o pixel só dispara sozinho na 1ª carga). */
export const oaiqPageView = (path: string): void => {
  if (!isOaiqRoute(path)) return;
  oaiqMeasure("page_view", { type: "customer_action" });
};