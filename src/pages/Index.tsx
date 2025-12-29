import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Benefits from "@/components/Benefits";
import Pricing from "@/components/Pricing";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>AURA - Sua Mentora Emocional no WhatsApp</title>
        <meta
          name="description"
          content="AURA é sua mentora emocional baseada em Estoicismo e Logoterapia. Tenha clareza mental, controle emocional e direção na vida através de conversas no WhatsApp."
        />
        <meta
          name="keywords"
          content="mentora emocional, estoicismo, logoterapia, saúde mental, WhatsApp, ansiedade, autoconhecimento"
        />
        <link rel="canonical" href="https://aura.app" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <Hero />
          <HowItWorks />
          <Benefits />
          <Pricing />
          <FAQ />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
