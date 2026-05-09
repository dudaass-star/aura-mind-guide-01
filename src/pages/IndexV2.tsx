import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import "@/styles/v2-theme.css";

import HeaderV2 from "@/components/v2/HeaderV2";
import HeroV2 from "@/components/v2/HeroV2";
import EmotionalMirror from "@/components/v2/EmotionalMirror";
import ConversationShowcase from "@/components/v2/ConversationShowcase";
import TransformationsV2 from "@/components/v2/TransformationsV2";
import ComparisonV2 from "@/components/v2/ComparisonV2";
import TestimonialsV2 from "@/components/v2/TestimonialsV2";
import PricingV2 from "@/components/v2/PricingV2";
import FAQV2 from "@/components/v2/FAQV2";
import FinalCTAV2 from "@/components/v2/FinalCTAV2";
import FooterV2 from "@/components/v2/FooterV2";
import StickyMobileCTAV2 from "@/components/v2/StickyMobileCTAV2";
import { trackViewItem } from "@/lib/ga4";

const IndexV2 = () => {
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "ViewContent", {
        content_name: "Landing V2",
        content_category: "homepage_v2",
      });
    }
    trackViewItem({ item_id: "landing_v2", item_name: "Landing V2" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Aura — Quando sua mente acelera, a Aura responde</title>
        <meta
          name="description"
          content="Converse, descarregue pensamentos e reorganize sua mente — direto no WhatsApp. 7 dias por R$ 6,90."
        />
        {/* V2 é página de teste — não competir com / no índice de busca */}
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://olaaura.com.br" />
      </Helmet>

      <div className="theme-v2 min-h-screen bg-background text-foreground antialiased selection:bg-primary/30">
        <HeaderV2 />
        <main>
          <HeroV2 />
          <EmotionalMirror />
          <ConversationShowcase />
          <TransformationsV2 />
          <ComparisonV2 />
          <TestimonialsV2 />
          <PricingV2 />
          <FAQV2 />
          <FinalCTAV2 />
        </main>
        <FooterV2 />
        <StickyMobileCTAV2 />
      </div>
    </>
  );
};

export default IndexV2;
