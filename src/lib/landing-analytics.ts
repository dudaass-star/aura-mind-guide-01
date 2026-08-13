// Instrumentação de engajamento da landing /v2.
// Objetivo: saber se o lead lê a página ou clica no CTA de cima sem rolar.
// Tudo grava em checkout_funnel_events (mesma tabela do funil) e no GA4,
// sempre fire-and-forget e deduplicado por sessão.
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

/** Registra o clique num CTA da landing (GA4 + banco) com a posição na página. */
export const trackLandingCta = (source: CtaSource, label?: string): void => {
  try {
    trackCtaClick(source as CtaLocation, label);
  } catch {
    /* noop */
  }
  logFunnel("landing_cta_click", {
    detail: source,
    meta: {
      label: label ?? null,
      max_scroll: maxScrollRef,
      seconds: Math.round((Date.now() - mountedAt) / 1000),
      scrolled: maxScrollRef >= 10,
    },
  });
};

/** Link do checkout com a origem do clique preservada. */
export const checkoutHref = (source: CtaSource): string => `/v2/checkout?src=${source}`;

let maxScrollRef = 0;
let mountedAt = Date.now();

/**
 * Mede profundidade de rolagem (25/50/75/100), tempo na página e saída.
 * Cada marco dispara uma única vez por sessão.
 */
export const useLandingEngagement = (): void => {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mountedAt = Date.now();
    maxScrollRef = 0;

    if (markOnce("landing_view")) {
      logFunnel("landing_view", {
        meta: {
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
        if (pct >= m && markOnce(`landing_scroll_${m}`)) {
          logFunnel(`landing_scroll_${m}` as never, {
            meta: { seconds: Math.round((Date.now() - mountedAt) / 1000) },
          });
        }
      }
    };

    const onLeave = () => {
      if (!markOnce("landing_exit")) return;
      logFunnel("landing_exit", {
        detail: `max_${maxScrollRef}`,
        meta: {
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
  }, []);
};
