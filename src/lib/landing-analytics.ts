import { useEffect, useRef } from "react";
import { logFunnel } from "@/lib/checkout-funnel";
import { trackCtaClick, type CtaLocation } from "@/lib/ga4";

/** Posição do CTA na página — vira `?src=` no link do checkout. */
export type CtaSource = "hero" | "pricing" | "sticky" | "header" | "final" | "demo";

const DONE_KEY = "aura_landing_marks";

const readMarks = (): Set<string> => {
  try {
    return new Set<string>(JSON.parse(sessionStorage.getItem(DONE_KEY) || "[]"));
  } catch {
    return new Set();
  }
};

const markOnce = (key: string): boolean => {
  const marks = readMarks();
  if (marks.has(key)) return false;
  marks.add(key);
  try {
    sessionStorage.setItem(DONE_KEY, JSON.stringify([...marks]));
  } catch {
    /* noop */
  }
  return true;
};

/** Registra o clique num CTA da landing (GA4 + banco) com a posição na página e a variante da landing. */
export const trackLandingCta = (source: CtaSource, label?: string, variant: LandingVariant = "v2"): void => {
  try {
    trackCtaClick(source as CtaLocation, label);
  } catch {
    /* noop */
  }
  logFunnel("landing_cta_click", {
    detail: source,
    meta: {
      label: label ?? null,
      lp: variant,
      max_scroll: maxScrollRef,
      seconds: Math.round((Date.now() - mountedAt) / 1000),
      scrolled: maxScrollRef >= 10,
    },
  });
};

export type LandingVariant = "v2" | "v3";

/** Link do checkout com a origem do clique e a variante da landing preservadas. */
export const checkoutHref = (source: CtaSource, variant: LandingVariant = "v2"): string =>
  `/v2/checkout?src=${source}&lp=${variant}`;

let maxScrollRef = 0;
let mountedAt = Date.now();

/**
 * Mede profundidade de rolagem (25/50/75/100), tempo na página e saída.
 * Cada marco dispara uma única vez por sessão. Aceita variante da landing para
 * separar métricas da V2 e V3 no painel.
 */
export const useLandingEngagement = (variant: LandingVariant = "v2"): void => {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mountedAt = Date.now();
    maxScrollRef = 0;

    if (markOnce(`landing_view_${variant}`)) {
      logFunnel("landing_view", {
        meta: {
          lp: variant,
          referrer: typeof document !== "undefined" ? document.referrer.slice(0, 200) : null,
          search: typeof window !== "undefined" ? window.location.search.slice(0, 200) : null,
        },
      });
    }

    const milestones = [25, 50, 75, 100] as const;

    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));
      if (pct > maxScrollRef) maxScrollRef = pct;

      for (const m of milestones) {
        if (pct >= m && markOnce(`landing_scroll_${m}_${variant}`)) {
          logFunnel(`landing_scroll_${m}` as never, {
            meta: {
              lp: variant,
              seconds: Math.round((Date.now() - mountedAt) / 1000),
            },
          });
        }
      }
    };

    const onLeave = () => {
      if (!markOnce(`landing_exit_${variant}`)) return;
      logFunnel("landing_exit", {
        detail: `max_${maxScrollRef}`,
        meta: {
          lp: variant,
          max_scroll: maxScrollRef,
          seconds: Math.round((Date.now() - mountedAt) / 1000),
        },
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onLeave);
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [variant]);
};
