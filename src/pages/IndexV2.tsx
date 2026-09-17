import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import "@/styles/v2-theme.css";

import HeaderV2 from "@/components/v2/HeaderV2";
import HeroV2 from "@/components/v2/HeroV2";
import HowItWorksV2 from "@/components/v2/HowItWorksV2";
import DemoV2 from "@/components/v2/DemoV2";
import BenefitsGridV2 from "@/components/v2/BenefitsGridV2";
import TestimonialsV2 from "@/components/v2/TestimonialsV2";
import PricingV2 from "@/components/v2/PricingV2";
import FAQV2 from "@/components/v2/FAQV2";
import FinalCTAV2 from "@/components/v2/FinalCTAV2";
import FooterV2 from "@/components/v2/FooterV2";
import StickyMobileCTAV2 from "@/components/v2/StickyMobileCTAV2";
import { trackViewItem } from "@/lib/ga4";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import { useLandingEngagement } from "@/lib/landing-analytics";

const IndexV2 = () => {
  // Rastreia rolagem, tempo e saída — base pra saber quem lê e quem clica de cima.
  useLandingEngagement();

  useEffect(() => {
    // ViewContent com deduplicação navegador + CAPI.
    // SEM `value`/`currency`: preço só em InitiateCheckout/Purchase/Subscribe.
    // Mandar sempre o mesmo preço aqui é o que dispara o alerta "envie mais
    // preços" do Meta.
    trackMetaViewContent({
      content_name: "Landing V2",
      content_category: "homepage_v2",
    });
    trackViewItem({ item_id: "landing_v2", item_name: "Landing V2" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Uma inteligência que acompanha seu percurso</title>
        <meta
          name="description"
          content="Converse por texto ou áudio no WhatsApp, conecte o que acontece na sua vida e encontre clareza em encontros guiados. 7 dias por R$ 6,90."
        />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://olaaura.com.br/v2" />
        <meta property="og:url" content="https://olaaura.com.br/v2" />
        <meta property="og:title" content="Olá AURA — Uma inteligência que acompanha seu percurso" />
        <meta property="og:description" content="Converse por texto ou áudio no WhatsApp, conecte o que acontece na sua vida e encontre clareza em encontros guiados. 7 dias por R$ 6,90." />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {"@type": "Question", "name": "O que é a AURA e como ela funciona?", "acceptedAnswer": {"@type": "Answer", "text": "A AURA é uma inteligência de acompanhamento emocional pelo WhatsApp. Você conversa por texto ou áudio, ela conecta acontecimentos e ajuda a transformar o que está confuso em clareza e direção."}},
              {"@type": "Question", "name": "O que a AURA constrói ao longo do tempo?", "acceptedAnswer": {"@type": "Answer", "text": "As conversas formam um percurso com capítulos mensais, temas, mudanças percebidas, marcos, resumos de encontros e trechos das suas próprias palavras."}},
              {"@type": "Question", "name": "A AURA substitui atendimento psicológico?", "acceptedAnswer": {"@type": "Answer", "text": "A AURA é uma experiência própria de acompanhamento emocional, clareza e direção prática. Ela não realiza diagnóstico nem substitui atendimento psicológico profissional."}},
              {"@type": "Question", "name": "Como funciona o período de teste?", "acceptedAnswer": {"@type": "Answer", "text": "Você experimenta a Aura por 7 dias com acesso completo ao plano escolhido, pagando apenas uma taxa simbólica (a partir de R$ 6,90). Se não fizer sentido, cancele a qualquer momento antes do 8º dia e não será cobrado mais nada."}},
              {"@type": "Question", "name": "Posso pausar minha assinatura?", "acceptedAnswer": {"@type": "Answer", "text": "Sim! Se você precisar dar um tempo, pode pausar sua assinatura por até 30 dias sem perder seu histórico ou progresso. Quando voltar, a Aura continua de onde parou."}},
              {"@type": "Question", "name": "O que são os encontros guiados?", "acceptedAnswer": {"@type": "Answer", "text": "São 45 minutos dedicados a aprofundar um tema importante com método, nova perspectiva, fechamento e resumo escrito no seu espaço pessoal."}},
              {"@type": "Question", "name": "Posso enviar áudio?", "acceptedAnswer": {"@type": "Answer", "text": "Sim! Você pode mandar áudio e também receber respostas em áudio. Fale do jeito que for mais natural pra você."}},
              {"@type": "Question", "name": "Meus dados ficam seguros?", "acceptedAnswer": {"@type": "Answer", "text": "Sim. Seus dados são criptografados e usados apenas para a Aura lembrar do seu histórico e melhorar seu acompanhamento. Seguimos todas as normas da LGPD."}},
              {"@type": "Question", "name": "Posso cancelar quando quiser?", "acceptedAnswer": {"@type": "Answer", "text": "Sim. No plano mensal você cancela quando quiser, sem fidelidade ou multa."}},
              {"@type": "Question", "name": "O que é a Cápsula do Tempo?", "acceptedAnswer": {"@type": "Answer", "text": "É um recurso exclusivo da Aura. Em momentos especiais da conversa, a Aura te convida a gravar um áudio para o seu eu do futuro. Você grava, confirma que ficou do jeito que queria, e a Aura guarda com carinho. Daqui a 3 meses, você recebe essa mensagem de volta — de surpresa."}}
            ]
          })}
        </script>
      </Helmet>

      <div className="theme-v2 min-h-screen bg-background text-foreground antialiased selection:bg-primary/30">
        <HeaderV2 />
        <main>
          <HeroV2 />
          <DemoV2 />
          <BenefitsGridV2 />
          <HowItWorksV2 />
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
