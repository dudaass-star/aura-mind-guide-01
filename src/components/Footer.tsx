import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="py-12 bg-card border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <span className="text-primary font-display font-bold text-lg">A</span>
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              AURA
            </span>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link to="/termos" className="hover:text-foreground transition-colors">
              Termos
            </Link>
            <Link to="/privacidade" className="hover:text-foreground transition-colors">
              Privacidade
            </Link>
            <Link to="/cancelar" className="hover:text-foreground transition-colors">
              Cancelar Assinatura
            </Link>
            <a href="mailto:suporte@aura.app" className="hover:text-foreground transition-colors">
              Suporte
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AURA
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;