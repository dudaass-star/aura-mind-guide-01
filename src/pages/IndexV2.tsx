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

const IndexV2 = () => {
  useEffect(() => {
    // ViewContent com deduplicação navegador + CAPI.
    trackMetaViewContent({
      content_name: "Landing V2",
      content_category: "homepage_v2",
      value: 6.90,
      currency: "BRL",
    });
    trackViewItem({ item_id: "landing_v2", item_name: "Landing V2" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Presente quando sua mente precisa</title>
        <meta
          name="description"
          content="Acompanhamento emocional no WhatsApp. Converse, desabafe e organize seus pensamentos a qualquer hora. 7 dias por R$ 6,90."
        />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://olaaura.com.br/v2" />
        <meta property="og:url" content="https://olaaura.com.br/v2" />
        <meta property="og:title" content="Olá AURA — Presente quando sua mente precisa" />
        <meta property="og:description" content="Acompanhamento emocional no WhatsApp. Converse, desabafe e organize seus pensamentos a qualquer hora. 7 dias por R$ 6,90." />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {"@type": "Question", "name": "Por que é tão mais barato que terapia?", "acceptedAnswer": {"@type": "Answer", "text": "A Aura consegue oferecer acompanhamento emocional de qualidade a um custo muito menor porque está disponível 24/7 e escala com tecnologia. Não é terapia — é suporte emocional contínuo, com metodologia, memória do seu histórico e direção prática."}},
              {"@type": "Question", "name": "A Aura substitui terapia com psicólogo?", "acceptedAnswer": {"@type": "Answer", "text": "Aura é acompanhamento emocional e direção prática — não substitui atendimento psicológico profissional. Muita gente usa como complemento entre sessões ou como ponto de partida para quem não tem acesso à terapia. Se você está em crise severa, procure ajuda especializada."}},
              {"@type": "Question", "name": "Como funciona o período de teste?", "acceptedAnswer": {"@type": "Answer", "text": "Você experimenta a Aura por 7 dias com acesso completo ao plano escolhido, pagando apenas uma taxa simbólica (a partir de R$ 6,90). Se não fizer sentido, cancele a qualquer momento antes do 8º dia e não será cobrado mais nada."}},
              {"@type": "Question", "name": "Posso pausar minha assinatura?", "acceptedAnswer": {"@type": "Answer", "text": "Sim! Se você precisar dar um tempo, pode pausar sua assinatura por até 30 dias sem perder seu histórico ou progresso. Quando voltar, a Aura continua de onde parou."}},
              {"@type": "Question", "name": "O que são as Sessões Especiais?", "acceptedAnswer": {"@type": "Answer", "text": "São encontros de 45 minutos com metodologia estruturada (Investigação Socrática + Logoterapia). Você escolhe o tema: Clareza (decisões), Padrões (comportamentos repetitivos), Propósito (sentido de vida) ou Livre. Depois, recebe um resumo escrito com os principais insights."}},
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
          <HowItWorksV2 />
          <BenefitsGridV2 />
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
