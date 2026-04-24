import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const SORO_SCRIPT_SRC = "https://app.trysoro.com/api/embed/93f944b3-dd6b-4e3c-8c42-0c078e169773";

const Blog = () => {
  useEffect(() => {
    // Evita injetar duplicado se o script já estiver presente
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SORO_SCRIPT_SRC}"]`);
    if (existing) return;

    const script = document.createElement("script");
    script.src = SORO_SCRIPT_SRC;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup ao desmontar para evitar duplicação em navegação SPA
      const node = document.querySelector<HTMLScriptElement>(`script[src="${SORO_SCRIPT_SRC}"]`);
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Helmet>
        <title>Blog AURA — Autoconhecimento, Ansiedade e Meditação</title>
        <meta
          name="description"
          content="Artigos sobre autoconhecimento emocional, ansiedade, meditação e bem-estar mental. Reflexões e práticas guiadas pela AURA, sua acompanhante emocional via WhatsApp."
        />
        <link rel="canonical" href="https://olaaura.com.br/blog" />
        <meta property="og:title" content="Blog AURA — Autoconhecimento, Ansiedade e Meditação" />
        <meta
          property="og:description"
          content="Artigos sobre autoconhecimento emocional, ansiedade, meditação e bem-estar mental."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://olaaura.com.br/blog" />
      </Helmet>

      <Header />

      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4">
          <header className="max-w-3xl mx-auto text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Blog AURA
            </h1>
            <p className="text-lg text-muted-foreground">
              Reflexões, práticas e ferramentas sobre autoconhecimento emocional, ansiedade,
              meditação e bem-estar mental.
            </p>
          </header>

          {/* Widget do Soro — os artigos são renderizados aqui */}
          <div className="max-w-4xl mx-auto">
            <div id="soro-blog"></div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
