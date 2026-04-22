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
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'ViewContent', {
        content_name: 'Landing Page',
        content_category: 'homepage',
      });
    }
    // GA4 view_item — espelha o ViewContent do Meta Pixel
    trackViewItem({ item_id: "landing_page", item_name: "Landing Page" });
  }, []);

  return (
    <>
      <Helmet>
        <title>AURA - Acompanhamento Emocional Acessível no WhatsApp</title>
        <meta
          name="description"
          content="Acompanhamento emocional profundo por menos de R$2/dia. Suporte 24/7 no WhatsApp com memória de longo prazo, sessões estruturadas e metodologia. Experimente por 7 dias."
        />
        <meta
          name="keywords"
          content="acompanhamento emocional, saúde mental acessível, WhatsApp, ansiedade, autoconhecimento, clareza mental, terapia acessível, suporte emocional"
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
