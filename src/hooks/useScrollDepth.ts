import { useEffect, useRef } from "react";
import { trackScrollDepth } from "@/lib/ga4";

/**
 * Fires GA4 scroll_depth events at 25%, 50%, 75% and 100% of page height.
 * Each milestone fires only once per mount.
 */
export const useScrollDepth = (): void => {
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    const milestones: Array<25 | 50 | 75 | 100> = [25, 50, 75, 100];

    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));

      for (const m of milestones) {
        if (pct >= m && !fired.current.has(m)) {
          fired.current.add(m);
          trackScrollDepth(m);
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
};