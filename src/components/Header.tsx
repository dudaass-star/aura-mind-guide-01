import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img src={logoOlaAura} alt="Olá AURA" className="h-8" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#precos"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Preços
            </a>
            <a
              href="#faq"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              FAQ
            </a>
            <Link to="/checkout">
              <Button variant="sage" size="sm">
                Começar agora
              </Button>
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile nav */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border/50 animate-fade-in">
            <div className="flex flex-col gap-4">
              <a
                href="#precos"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Preços
              </a>
              <a
                href="#faq"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                FAQ
              </a>
              <Link to="/checkout" onClick={() => setIsMenuOpen(false)}>
                <Button variant="sage" className="w-full">
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

export default Header;