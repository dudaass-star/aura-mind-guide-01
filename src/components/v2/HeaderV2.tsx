import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/ga4";

const HeaderV2 = () => (
  <header className="absolute top-0 left-0 right-0 z-30">
    <div className="container mx-auto px-6 py-6 flex items-center justify-between">
      <Link to="/v2" className="font-display text-xl tracking-wide text-foreground">
        AURA
      </Link>
      <Link
        to="/checkout"
        onClick={() => trackCtaClick("header", "Começar por R$ 6,90 (v2)")}
      >
        <Button variant="sage" size="sm" className="rounded-full px-5">
          Começar
        </Button>
      </Link>
    </div>
  </header>
);

export default HeaderV2;
