import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";

const StickyMobileCTAV3 = () => {
  const isMobile = useIsMobile();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    const hero = document.getElementById("hero-section");
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [isMobile]);

  if (!isMobile || !show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-background/85 backdrop-blur-md border-t border-border/40">
      <Link
        to={checkoutHref("sticky", "v3")}
        className="block"
        onClick={() => trackLandingCta("sticky", "Começar por R$ 6,90 (v3)", "v3")}
      >
        <Button variant="sage" size="lg" className="w-full rounded-full">
          Começar por R$ 6,90
        </Button>
      </Link>
    </div>
  );
};

export default StickyMobileCTAV3;
