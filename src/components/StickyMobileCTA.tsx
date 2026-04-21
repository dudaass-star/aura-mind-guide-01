import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackCtaClick } from "@/lib/ga4";

const StickyMobileCTA = React.forwardRef<HTMLDivElement>((_, ref) => {
  const isMobile = useIsMobile();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isMobile) return;

    const hero = document.getElementById("hero-section");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [isMobile]);

  if (!isMobile || !show) return null;

  return (
    <div ref={ref} className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-background/90 backdrop-blur-md border-t border-border/50 shadow-lg">
      <Link to="/checkout" className="block" onClick={() => trackCtaClick("sticky", "Começar por R$ 6,90")}>
        <Button variant="sage" size="lg" className="w-full">
          Começar por R$ 6,90
        </Button>
      </Link>
    </div>
  );
});

StickyMobileCTA.displayName = "StickyMobileCTA";

export default StickyMobileCTA;
