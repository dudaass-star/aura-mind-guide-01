// Helpers do Meta Pixel — atribuição de cliques de anúncio e PageView em SPA.
// O código base do pixel vive em index.html; este módulo só dispara eventos
// e garante a persistência dos identificadores de navegador (_fbp / _fbc).

import { supabase } from "@/integrations/supabase/client";

/** Rotas privadas onde o pixel NÃO deve rodar (espelha o gate do index.html). */
const PRIVATE_PREFIXES = ["/admin", "/meu-espaco"];

export const isPixelRoute = (path: string): boolean =>
  !PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

const hasFbq = (): boolean =>
  typeof window !== "undefined" && typeof (window as any).fbq === "function";

export const getCookie = (name: string): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : undefined;
};

const setCookie = (name: string, value: string, days: number): void => {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

/**
 * Captura o fbclid da URL e persiste como cookie _fbc de 1º nível (90 dias).
 * Sem isso, o vínculo com o clique do anúncio se perde em qualquer navegação,
 * recarregamento ou retorno posterior do usuário.
 */
export const persistFbclid = (): void => {
  if (typeof window === "undefined") return;
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid) return;
  const existing = getCookie("_fbc");
  // Clique novo sempre sobrescreve o cookie antigo.
  if (existing && existing.endsWith(`.${fbclid}`)) return;
  setCookie("_fbc", `fb.1.${Date.now()}.${fbclid}`, 90);
};

export const getFbp = (): string | undefined => getCookie("_fbp");
export const getFbc = (): string | undefined => getCookie("_fbc");

/** event_id compartilhado entre navegador e servidor, para deduplicação no Meta. */
const newEventId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Envia o mesmo evento pelo servidor (CAPI), com event_id idêntico ao do navegador. */
const sendCapi = (
  eventName: string,
  eventId: string,
  customData?: Record<string, unknown>,
  attempt = 0,
): void => {
  const fbp = getFbp();
  const fbc = getFbc();
  // Sem identificador de navegador o CAPI seria descartado pelo Meta.
  // No primeiro carregamento o _fbp pode ainda não existir: tenta de novo.
  if (!fbp && !fbc) {
    if (attempt < 3) {
      window.setTimeout(() => sendCapi(eventName, eventId, customData, attempt + 1), 1500);
    }
    return;
  }
  void supabase.functions
    .invoke("meta-capi", {
      body: {
        event_name: eventName,
        event_id: eventId,
        event_source_url: window.location.href,
        source: "browser_top_funnel",
        user_data: { fbp, fbc, client_user_agent: navigator.userAgent },
        custom_data: customData,
      },
    })
    .catch(() => {
      /* fire-and-forget: falha no CAPI nunca deve afetar a página */
    });
};

/** Rotas onde o PageView não deve sair (conversão já é medida por Purchase). */
const NO_PAGEVIEW_ROUTES = ["/obrigado"];

/** PageView (navegador + CAPI) — chamado no carregamento e em toda troca de rota. */
export const trackMetaPageView = (path: string): void => {
  if (!isPixelRoute(path) || NO_PAGEVIEW_ROUTES.includes(path)) return;
  persistFbclid();
  const eventId = newEventId();
  if (hasFbq()) {
    (window as any).fbq("track", "PageView", {}, { eventID: eventId });
  }
  sendCapi("PageView", eventId);
};

/** ViewContent da landing (navegador + CAPI) com dedupe por event_id. */
export const trackMetaViewContent = (
  customData: Record<string, unknown>,
): void => {
  if (!isPixelRoute(window.location.pathname)) return;
  const eventId = newEventId();
  if (hasFbq()) {
    (window as any).fbq("track", "ViewContent", customData, { eventID: eventId });
  }
  sendCapi("ViewContent", eventId, customData);
};
