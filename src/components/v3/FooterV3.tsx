import { Link } from "react-router-dom";
import { Shield, Lock } from "lucide-react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const FooterV3 = () => (
  <footer className="v2-dark-section border-t border-white/10 py-12">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-4 gap-8 mb-10">
        <div>
          <Link to="/v3" className="flex items-center mb-4">
            <img src={logoOlaAura} alt="Olá AURA" className="h-16 w-auto brightness-0 invert" />
          </Link>
          <p className="text-xs text-white/65 max-w-[220px]">
            Apoio inteligente no WhatsApp para organizar sua cabeça e encontrar direção.
          </p>
          <a
            href="mailto:suporte@olaaura.com.br"
            className="inline-block mt-3 text-sm text-white hover:text-white/80 transition-colors"
          >
            suporte@olaaura.com.br
          </a>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/65 mb-3">AURA</p>
          <ul className="space-y-2 text-sm text-white/75">
            <li><a href="#como-funciona" className="hover:text-white">Como funciona</a></li>
            <li><a href="#depoimentos" className="hover:text-white">Depoimentos</a></li>
            <li><a href="#precos" className="hover:text-white">Planos</a></li>
            <li><Link to="/blog" className="hover:text-white">Blog</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/65 mb-3">Suporte</p>
          <ul className="space-y-2 text-sm text-white/75">
            <li><a href="#faq" className="hover:text-white">Perguntas frequentes</a></li>
            <li><a href="mailto:suporte@olaaura.com.br" className="hover:text-white">Fale conosco</a></li>
            <li><Link to="/privacidade" className="hover:text-white">Privacidade</Link></li>
            <li><Link to="/termos" className="hover:text-white">Termos de uso</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/65 mb-3">Siga a AURA</p>
          <ul className="space-y-2 text-sm text-white/75">
            <li><a href="https://instagram.com/olaaura.app" target="_blank" rel="noreferrer" className="hover:text-white">Instagram</a></li>
            <li><Link to="/cancelar" className="hover:text-white">Cancelar assinatura</Link></li>
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-4 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/85">
          <Shield className="w-4 h-4 text-white/70" />
          <span>Conforme LGPD</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/85">
          <Lock className="w-4 h-4 text-white/70" />
          <span>Dados criptografados</span>
        </div>
      </div>

      <div className="border-t border-white/10 pt-6 text-center">
        <p className="text-xs text-white/65">
          © {new Date().getFullYear()} Olá AURA. Todos os direitos reservados.
        </p>
        <p className="text-xs text-white/60 mt-2">
          AURA é apoio no dia a dia e não substitui atendimento psicológico profissional.
        </p>
      </div>
    </div>
  </footer>
);

export default FooterV3;
