// Barra fixa de CTA no mobile: aparece quando o CTA principal sai da viewport.
// Evita perder quem rolou até os depoimentos e não quer voltar pra cima.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface StickyMobileCtaProps {
  /** id do elemento observado (o CTA principal) */
  anchorId: string;
  todayLabel: string;
  ctaLabel: string;
  onClick: () => void;
}

export function StickyMobileCta({ anchorId, todayLabel, ctaLabel, onClick }: StickyMobileCtaProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(anchorId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [anchorId]);

  if (!visible) return null;

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-[hsl(220_35%_10%)]/95 backdrop-blur px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200">
      <div className="min-w-0">
        <p className="text-[10px] text-white/55 leading-none">cobrado hoje</p>
        <p className="text-sm font-semibold text-white leading-tight">{todayLabel}</p>
      </div>
      <Button
        type="button"
        variant="sage"
        onClick={onClick}
        className="flex-1 rounded-full whitespace-normal leading-tight text-sm h-11"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
