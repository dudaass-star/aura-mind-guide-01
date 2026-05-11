import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackCtaClick } from "@/lib/ga4";

const StickyMobileCTAV2 = () => {
  const isMobile = useIsMobile();
  const [pastHero, setPastHero] = useState(false);
  const [nearCta, setNearCta] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    const hero = document.getElementById("hero-section");
    const pricing = document.getElementById("precos");
    const finalCta = document.getElementById("final-cta");

    const observers: IntersectionObserver[] = [];

    if (hero) {
      const o = new IntersectionObserver(
        ([entry]) => setPastHero(!entry.isIntersecting),
        { threshold: 0 },
      );
      o.observe(hero);
      observers.push(o);
    }

    const ctaCallback = () => {
      const pVisible = pricing ? isInView(pricing) : false;
      const fVisible = finalCta ? isInView(finalCta) : false;
      setNearCta(pVisible || fVisible);
    };

    [pricing, finalCta].forEach((el) => {
      if (!el) return;
      const o = new IntersectionObserver(ctaCallback, { threshold: 0.05 });
      o.observe(el);
      observers.push(o);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [isMobile]);

  if (!isMobile || !pastHero || nearCta) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-background/85 backdrop-blur-md border-t border-border/40">
      <Link to="/checkout" className="block" onClick={() => trackCtaClick("sticky", "Começar por R$ 6,90 (v2)")}>
        <Button variant="sage" size="lg" className="w-full rounded-full">
          Começar por R$ 6,90
        </Button>
      </Link>
    </div>
  );
};

export default StickyMobileCTAV2;
