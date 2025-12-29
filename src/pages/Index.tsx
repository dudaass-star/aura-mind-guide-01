import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Economy from "@/components/Economy";
import Problem from "@/components/Problem";
import HowItWorks from "@/components/HowItWorks";
import Benefits from "@/components/Benefits";
import Comparison from "@/components/Comparison";
import Pricing from "@/components/Pricing";
import FinalCTA from "@/components/FinalCTA";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>AURA - Acompanhamento Emocional no WhatsApp</title>
        <meta
          name="description"
          content="AURA te ajuda a recuperar clareza mental, controle emocional e direção prática através de conversas no WhatsApp. 5 conversas grátis."
        />
        <meta
          name="keywords"
          content="acompanhamento emocional, saúde mental, WhatsApp, ansiedade, autoconhecimento, clareza mental"
        />
        <link rel="canonical" href="https://aura.app" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <Hero />
          <Economy />
          <Problem />
          <HowItWorks />
          <Benefits />
          <Comparison />
          <Pricing />
          <FinalCTA />
          <FAQ />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;