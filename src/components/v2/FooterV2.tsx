import { Link } from "react-router-dom";

const FooterV2 = () => (
  <footer className="border-t border-border/40 bg-background py-10">
    <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
      <p>© {new Date().getFullYear()} Aura · olaaura.com.br</p>
      <div className="flex gap-6">
        <Link to="/termos" className="hover:text-foreground transition-colors">Termos</Link>
        <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
        <Link to="/" className="hover:text-foreground transition-colors">Versão clássica</Link>
      </div>
    </div>
  </footer>
);

export default FooterV2;
