import { Link } from "react-router-dom";
import { Shield, Lock } from "lucide-react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const Footer = () => {
  return (
    <footer className="py-12 bg-card border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          {/* Logo */}
          <Link to="/">
            <img src={logoOlaAura} alt="Olá AURA" className="h-24 w-auto" />
          </Link>

          {/* Links */}
          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link to="/termos" className="hover:text-foreground transition-colors">
              Termos de Uso
            </Link>
            <Link to="/privacidade" className="hover:text-foreground transition-colors">
              Política de Privacidade
            </Link>
            <Link to="/cancelar" className="hover:text-foreground transition-colors">
              Cancelar Assinatura
            </Link>
            <a href="mailto:suporte@aura.app" className="hover:text-foreground transition-colors">
              Suporte
            </a>
          </nav>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-6 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-sage-soft/50 text-sm text-foreground">
            <Shield className="w-4 h-4 text-primary" />
            <span>Conforme LGPD</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-sage-soft/50 text-sm text-foreground">
            <Lock className="w-4 h-4 text-primary" />
            <span>Dados criptografados</span>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AURA. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            AURA é acompanhamento emocional e não substitui atendimento psicológico profissional.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
