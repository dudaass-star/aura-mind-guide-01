import { Link } from "react-router-dom";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const FooterV2 = () => (
  <footer className="v2-dark-section border-t border-white/10 py-12">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-4 gap-8 mb-10">
        <div>
          <Link to="/" className="flex items-center mb-4">
            <img src={logoOlaAura} alt="Olá AURA" className="h-16 w-auto brightness-0 invert" />
          </Link>
          <p className="text-xs text-white/55 max-w-[220px]">
            Acompanhamento emocional inteligente no WhatsApp.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/45 mb-3">AURA</p>
          <ul className="space-y-2 text-sm text-white/75">
            <li><a href="#como-funciona" className="hover:text-white">Como funciona</a></li>
            <li><a href="#recursos" className="hover:text-white">Recursos</a></li>
            <li><a href="#depoimentos" className="hover:text-white">Depoimentos</a></li>
            <li><a href="#precos" className="hover:text-white">Planos</a></li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/45 mb-3">Suporte</p>
          <ul className="space-y-2 text-sm text-white/75">
            <li><a href="#faq" className="hover:text-white">Perguntas frequentes</a></li>
            <li><a href="mailto:suporte@olaaura.com.br" className="hover:text-white">Fale conosco</a></li>
            <li><Link to="/privacidade" className="hover:text-white">Privacidade</Link></li>
            <li><Link to="/termos" className="hover:text-white">Termos de uso</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/45 mb-3">Siga a AURA</p>
          <ul className="space-y-2 text-sm text-white/75">
            <li><a href="https://instagram.com/olaaura.app" target="_blank" rel="noreferrer" className="hover:text-white">Instagram</a></li>
            <li><Link to="/cancelar" className="hover:text-white">Cancelar assinatura</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 pt-6 text-center">
        <p className="text-xs text-white/55">
          © {new Date().getFullYear()} Olá AURA. Todos os direitos reservados.
        </p>
        <p className="text-xs text-white/40 mt-2">
          AURA é acompanhamento emocional e não substitui atendimento psicológico profissional.
        </p>
      </div>
    </div>
  </footer>
);

export default FooterV2;
