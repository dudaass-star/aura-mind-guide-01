// GA4 helpers — all calls are no-ops when gtag is not loaded (non-marketing routes)
// Measurement ID is hardcoded in index.html; this module just dispatches events.

const MARKETING_ROUTES = [
  "/",
  "/checkout",
  "/obrigado",
  "/experimentar",
  "/trial-iniciado",
];

export const isMarketingRoute = (path: string): boolean =>
  MARKETING_ROUTES.includes(path);

const hasGtag = (): boolean =>
  typeof window !== "undefined" && typeof (window as any).gtag === "function";

const GA4_ID = "G-2G7T7SJWBK";

/**
 * Reads the GA client_id from the _ga cookie (format: GA1.1.<client_id>).
 * Returns undefined if the cookie is missing or malformed.
 */
export const getGaClientId = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
  if (!match) return undefined;
  // _ga cookie format: GA1.1.1234567890.1234567890 → client_id is "1234567890.1234567890"
  const parts = match[1].split(".");
  if (parts.length < 4) return undefined;
  return `${parts[2]}.${parts[3]}`;
};

export const trackPageView = (path: string): void => {
  if (!hasGtag() || !isMarketingRoute(path)) return;
  (window as any).gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    send_to: GA4_ID,
  });
};

export const trackEvent = (
  name: string,
  params: Record<string, unknown> = {}
): void => {
  if (!hasGtag()) return;
  (window as any).gtag("event", name, params);
};

// === Standard ecommerce events ===

export const trackViewItem = (params?: {
  item_id?: string;
  item_name?: string;
  value?: number;
}): void =>
  trackEvent("view_item", {
    currency: "BRL",
    value: params?.value,
    items: params?.item_id
      ? [{ item_id: params.item_id, item_name: params.item_name }]
      : undefined,
  });

export const trackBeginCheckout = (params?: {
  plan?: string;
  value?: number;
}): void =>
  trackEvent("begin_checkout", {
    currency: "BRL",
    value: params?.value,
    items: params?.plan
      ? [{ item_id: params.plan, item_name: params.plan }]
      : undefined,
  });

export const trackAddPaymentInfo = (params?: {
  plan?: string;
  billing?: string;
  value?: number;
}): void =>
  trackEvent("add_payment_info", {
    currency: "BRL",
    value: params?.value,
    payment_type: "card",
    items: params?.plan
      ? [
          {
            item_id: params.plan,
            item_name: params.plan,
            item_variant: params.billing,
          },
        ]
      : undefined,
  });

// === Custom events ===

export type CtaLocation =
  | "hero"
  | "pricing"
  | "final"
  | "sticky"
  | "header"
  | "faq";

export const trackCtaClick = (location: CtaLocation, label?: string): void =>
  trackEvent("cta_click", {
    cta_location: location,
    cta_label: label,
  });

export const trackFaqOpen = (question: string): void =>
  trackEvent("faq_open", { faq_question: question });

export const trackScrollDepth = (percent: 25 | 50 | 75 | 100): void =>
  trackEvent("scroll_depth", { percent });

export const trackExitIntent = (
  action: "open" | "convert" | "dismiss"
): void => trackEvent("exit_intent", { action });