import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import ForWho from "@/components/ForWho";
import HowItWorks from "@/components/HowItWorks";
import Demo from "@/components/Demo";
import Benefits from "@/components/Benefits";
import Meditations from "@/components/Meditations";
import Testimonials from "@/components/Testimonials";
import Pricing from "@/components/Pricing";
import Comparison from "@/components/Comparison";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import StickyMobileCTA from "@/components/StickyMobileCTA";
import { trackViewItem } from "@/lib/ga4";
import { useScrollDepth } from "@/hooks/useScrollDepth";

const Index = () => {
  useScrollDepth();

  useEffect(() => {
    // Tracking do Meta REMOVIDO desta página (landing antiga, hoje fora de rota):
    // era `fbq` cru, sem event_id e sem CAPI, e com preço no ViewContent.
    // A fonte única é `trackMetaViewContent` em @/lib/meta-pixel.
    trackViewItem({ item_id: "landing_page", item_name: "Landing Page" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Acompanhamento emocional no seu aplicativo</title>
        <meta
          name="description"
          content="Converse por texto ou áudio no app Olá Aura, conecte o que acontece na sua vida e encontre clareza em encontros guiados. Experimente por 7 dias."
        />
        <meta
          name="keywords"
          content="acompanhamento emocional, aplicativo de bem-estar, ansiedade, autoconhecimento, clareza mental, direção prática, suporte emocional"
        />
        <link rel="canonical" href="https://olaaura.com.br" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <Hero />
          <Problem />
          <ForWho />
          <HowItWorks />
          <Demo />
          <Benefits />
          <Meditations />
          <Testimonials />
          <Pricing />
          <Comparison />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
        <StickyMobileCTA />
      </div>
    </>
  );
};

export default Index;
