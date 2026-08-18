import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const HeaderV3 = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkBase =
    "text-sm font-medium transition-colors text-white/75 hover:text-white";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-30 transition-all ${
        scrolled ? "bg-[hsl(220_35%_10%/0.85)] backdrop-blur-md" : ""
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between py-3">
          <Link to="/v3" className="flex items-center">
            <img
              src={logoOlaAura}
              alt="Olá AURA"
              className="h-20 w-auto brightness-0 invert"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            <a href="#como-funciona" className={linkBase}>Como funciona</a>
            <a href="#depoimentos" className={linkBase}>Depoimentos</a>
            <a href="#precos" className={linkBase}>Preços</a>
            <a href="#faq" className={linkBase}>FAQ</a>
            <Link
              to={checkoutHref("header", "v3")}
              onClick={() => trackLandingCta("header", "Começar agora (v3 desktop)", "v3")}
            >
              <Button variant="sage" size="sm" className="rounded-full px-5">
                Começar agora
              </Button>
            </Link>
          </nav>

          <button
            className="md:hidden p-2 text-white/85"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Abrir menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-white/10 bg-[hsl(220_35%_10%/0.95)] backdrop-blur-md -mx-6 px-6">
            <div className="flex flex-col gap-4">
              <a href="#como-funciona" className={linkBase} onClick={() => setIsMenuOpen(false)}>Como funciona</a>
              <a href="#depoimentos" className={linkBase} onClick={() => setIsMenuOpen(false)}>Depoimentos</a>
              <a href="#precos" className={linkBase} onClick={() => setIsMenuOpen(false)}>Preços</a>
              <a href="#faq" className={linkBase} onClick={() => setIsMenuOpen(false)}>FAQ</a>
              <Link
                to={checkoutHref("header", "v3")}
                onClick={() => {
                  trackLandingCta("header", "Começar agora (v3 mobile menu)", "v3");
                  setIsMenuOpen(false);
                }}
              >
                <Button variant="sage" className="w-full rounded-full">
                  Começar agora
                </Button>
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default HeaderV3;
