import { Helmet } from "react-helmet-async";
import { useLandingEngagement } from "@/lib/landing-analytics";
import { trackLandingPageView } from "@/lib/ga4";
import { logMetaPageView } from "@/lib/meta-capi";
import { useEffect } from "react";
import HeaderV3 from "@/components/v3/HeaderV3";
import HeroV3 from "@/components/v3/HeroV3";
import DemoV3 from "@/components/v3/DemoV3";
import HowItWorksV3 from "@/components/v3/HowItWorksV3";
import BenefitsGridV3 from "@/components/v3/BenefitsGridV3";
import TestimonialsV3 from "@/components/v3/TestimonialsV3";
import PricingV3 from "@/components/v3/PricingV3";
import FAQV3 from "@/components/v3/FAQV3";
import FinalCTAV3 from "@/components/v3/FinalCTAV3";
import FooterV3 from "@/components/v3/FooterV3";
import StickyMobileCTAV3 from "@/components/v3/StickyMobileCTAV3";
import "@/styles/v2-theme.css";

const IndexV3 = () => {
  useLandingEngagement("v3");

  useEffect(() => {
    trackLandingPageView("v3");
    logMetaPageView({ lp: "v3" });
  }, []);

  return (
    <div className="theme-v2 min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Olá AURA — Apoio no WhatsApp para sua cabeça parar</title>
        <meta
          name="description"
          content="AURA é companhia inteligente no WhatsApp. Conversa contínua, encontros guiados e memória do seu percurso. Comece por R$ 6,90 por 7 dias."
        />
        <meta
          property="og:title"
          content="Olá AURA — Apoio no WhatsApp para sua cabeça parar"
        />
        <meta
          property="og:description"
          content="Companhia inteligente no WhatsApp. Conversa contínua, encontros guiados e memória do seu percurso. Comece por R$ 6,90."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <HeaderV3 />
      <main>
        <HeroV3 />
        <DemoV3 />
        <HowItWorksV3 />
        <BenefitsGridV3 />
        <TestimonialsV3 />
        <PricingV3 />
        <FAQV3 />
        <FinalCTAV3 />
      </main>
      <FooterV3 />
      <StickyMobileCTAV3 />
    </div>
  );
};

export default IndexV3;
