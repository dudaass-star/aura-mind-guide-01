import { Helmet } from "react-helmet-async";
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

const Index = () => {
  return (
    <>
      <Helmet>
        <title>AURA - Acompanhamento Emocional Acessível no WhatsApp</title>
        <meta
          name="description"
          content="Acompanhamento emocional profundo por menos de R$2/dia. Suporte 24/7 no WhatsApp com memória de longo prazo, sessões estruturadas e metodologia. Comece grátis."
        />
        <meta
          name="keywords"
          content="acompanhamento emocional, saúde mental acessível, WhatsApp, ansiedade, autoconhecimento, clareza mental, terapia acessível, suporte emocional"
        />
        <link rel="canonical" href="https://aura.app" />
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
      </div>
    </>
  );
};

export default Index;
