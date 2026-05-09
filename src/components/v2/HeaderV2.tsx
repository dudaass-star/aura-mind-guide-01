import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/ga4";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const HeaderV2 = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const linkBase =
    "text-sm text-muted-foreground hover:text-foreground transition-colors font-medium";

  return (
    <header
      className={`absolute top-0 left-0 right-0 z-30 ${
        isMenuOpen ? "bg-background/80 backdrop-blur-md" : ""
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between py-4">
          <Link to="/" className="flex items-center">
            <img
              src={logoOlaAura}
              alt="Olá AURA"
              className="h-24 w-auto brightness-0 invert"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link to="/guia" className={linkBase}>Guia</Link>
            <Link to="/blog" className={linkBase}>Blog</Link>
            <a href="#precos" className={linkBase}>Preços</a>
            <a href="#faq" className={linkBase}>FAQ</a>
            <Link
              to="/checkout"
              onClick={() => trackCtaClick("header", "Começar agora (v2 desktop)")}
            >
              <Button variant="sage" size="sm" className="rounded-full px-5">
                Começar agora
              </Button>
            </Link>
          </nav>

          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Abrir menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border/40 animate-fade-in">
            <div className="flex flex-col gap-4">
              <Link to="/guia" className={linkBase} onClick={() => setIsMenuOpen(false)}>
                Guia
              </Link>
              <Link to="/blog" className={linkBase} onClick={() => setIsMenuOpen(false)}>
                Blog
              </Link>
              <a href="#precos" className={linkBase} onClick={() => setIsMenuOpen(false)}>
                Preços
              </a>
              <a href="#faq" className={linkBase} onClick={() => setIsMenuOpen(false)}>
                FAQ
              </a>
              <Link
                to="/checkout"
                onClick={() => {
                  trackCtaClick("header", "Começar agora (v2 mobile)");
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

export default HeaderV2;
