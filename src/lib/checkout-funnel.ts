// Instrumentação granular do funil de checkout.
// Cada evento vai pro banco (checkout_funnel_events) e pro GA4, sem bloquear a UI.
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/ga4";

export type FunnelStep =
  | "page_view"
  | "landing_view"
  | "landing_scroll_25"
  | "landing_scroll_50"
  | "landing_scroll_75"
  | "landing_scroll_100"
  | "landing_cta_click"
  | "landing_exit"
  | "form_submit"
  | "form_invalid"
  | "cta_empty_form"
  | "warmup"
  | "prewarm_session"
  | "prewarm_hit"
  | "create_checkout_error"
  | "embedded_requested"
  | "embedded_mounted"
  | "embedded_timeout"
  | "embedded_fallback_redirect"
  | "embedded_fallback_error"
  | "card_action_required"
  | "card_abandoned"
  | "pix_modal_open"
  | "pix_qr_requested"
  | "pix_qr_generated"
  | "pix_qr_error"
  | "pix_copy"
  | "pix_authorized"
  | "pix_abandoned"
  | "pix_rail_down"
  | "pix_blocked_rail_down"
  | "asaas_card_open"
  | "purchase";

const SESSION_KEY = "aura_funnel_sid";

const getAnonSessionId = (): string => {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return "s_unavailable";
  }
};

export interface FunnelContext {
  plan?: string;
  billing?: string;
  paymentMethod?: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

/** Fire-and-forget: nunca lança e nunca atrasa o fluxo do usuário. */
export const logFunnel = (step: FunnelStep, ctx: FunnelContext = {}): void => {
  try {
    trackEvent(`ckt_${step}`, {
      plan: ctx.plan,
      billing: ctx.billing,
      payment_method: ctx.paymentMethod,
      detail: ctx.detail,
    });
  } catch {
    /* noop */
  }

  try {
    void supabase
      .from("checkout_funnel_events")
      .insert({
        anon_session_id: getAnonSessionId(),
        step,
        plan: ctx.plan ?? null,
        billing: ctx.billing ?? null,
        payment_method: ctx.paymentMethod ?? null,
        detail: ctx.detail ? ctx.detail.slice(0, 500) : null,
        meta: {
          ...(ctx.meta || {}),
          ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
          viewport:
            typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
          path: typeof window !== "undefined" ? window.location.pathname : null,
        },
      })
      .then(() => undefined, () => undefined);
  } catch {
    /* noop */
  }
};
