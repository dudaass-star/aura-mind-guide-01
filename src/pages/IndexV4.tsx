import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { trackViewItem } from "@/lib/ga4";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import { useLandingEngagement } from "@/lib/landing-analytics";
import {
  ClosingV4, FaqV4, FooterV4, HeaderV4, HeroV4, HowItWorksV4,
  PortraitV4, PricingV4, ProductExperienceV4, StickyCtaV4, TransformationV4,
} from "@/components/v4/LandingV4";
import "@/styles/v4-theme.css";

const IndexV4 = () => {
  useLandingEngagement("v4");

  useEffect(() => {
    trackMetaViewContent({ content_name: "Landing V4", content_category: "homepage_v4" });
    trackViewItem({ item_id: "landing_v4", item_name: "Landing V4" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Enxergue o que está te prendendo</title>
        <meta name="description" content="A AURA acompanha sua história e ajuda você a transformar confusão em decisões, padrões em consciência e consciência em movimento." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://olaaura.com.br/v4" />
        <meta property="og:url" content="https://olaaura.com.br/v4" />
        <meta property="og:title" content="Olá AURA — Enxergue o que está te prendendo" />
        <meta property="og:description" content="Uma inteligência que acompanha sua história e ajuda você a mudar o que não quer mais repetir." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      <div className="theme-v4 min-h-screen bg-background text-foreground antialiased selection:bg-primary/25">
        <HeaderV4 />
        <main>
          <HeroV4 />
          <TransformationV4 />
          <ProductExperienceV4 />
          <HowItWorksV4 />
          <PortraitV4 />
          <PricingV4 />
          <FaqV4 />
          <ClosingV4 />
        </main>
        <FooterV4 />
        <StickyCtaV4 />
      </div>
    </>
  );
};

export default IndexV4;