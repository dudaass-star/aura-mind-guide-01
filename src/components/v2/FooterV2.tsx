import { Link } from "react-router-dom";
import { Shield, Lock } from "lucide-react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const FooterV2 = () => (
  <footer className="border-t border-border/40 bg-background py-12">
    <div className="container mx-auto px-6">
      <div className="flex flex-col items-center gap-6 mb-8">
        <Link to="/" className="flex items-center">
          <img src={logoOlaAura} alt="Olá AURA" className="h-16 md:h-20 w-auto" />
        </Link>

        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/blog" className="hover:text-foreground transition-colors">
            Blog
          </Link>
          <Link to="/termos" className="hover:text-foreground transition-colors">
            Termos de Uso
          </Link>
          <Link to="/privacidade" className="hover:text-foreground transition-colors">
            Política de Privacidade
          </Link>
          <Link to="/cancelar" className="hover:text-foreground transition-colors">
            Cancelar Assinatura
          </Link>
        </nav>

        <a
          href="mailto:suporte@olaaura.com.br"
          className="text-sm text-primary hover:text-primary/80 transition-colors"
        >
          suporte@olaaura.com.br
        </a>
      </div>

      <div className="flex flex-wrap justify-center gap-4 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/60 border border-border/40 text-sm text-foreground">
          <Shield className="w-4 h-4 text-primary" />
          <span>Conforme LGPD</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/60 border border-border/40 text-sm text-foreground">
          <Lock className="w-4 h-4 text-primary" />
          <span>Dados criptografados</span>
        </div>
      </div>

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

export default FooterV2;
