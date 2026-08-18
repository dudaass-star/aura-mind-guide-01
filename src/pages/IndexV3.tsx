import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import { useLandingEngagement } from "@/lib/landing-analytics";
import { trackViewItem } from "@/lib/ga4";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import "@/styles/v2-theme.css";

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

const IndexV3 = () => {
  useLandingEngagement("v3");

  useEffect(() => {
    trackMetaViewContent({
      content_name: "Landing V3",
      content_category: "homepage_v3",
    });
    trackViewItem({ item_id: "landing_v3", item_name: "Landing V3" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Apoio no WhatsApp para sua cabeça parar</title>
        <meta
          name="description"
          content="AURA é companhia inteligente no WhatsApp. Conversa contínua, encontros guiados e memória do seu percurso. Comece por R$ 6,90 por 7 dias."
        />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://olaaura.com.br/v3" />
        <meta property="og:url" content="https://olaaura.com.br/v3" />
        <meta property="og:title" content="Olá AURA — Apoio no WhatsApp para sua cabeça parar" />
        <meta property="og:description" content="Companhia inteligente no WhatsApp. Conversa contínua, encontros guiados e memória do seu percurso. Comece por R$ 6,90." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {"@type": "Question", "name": "O que muda em ter a AURA no seu WhatsApp?", "acceptedAnswer": {"@type": "Answer", "text": "Ela lembra da sua história, entende seu momento e vai te conhecendo mais a cada conversa. Está disponível 24/7, por texto ou áudio — e quando você precisa ir mais fundo, tem encontro guiado de 45 minutos com resumo escrito no final."}},
              {"@type": "Question", "name": "Como é a primeira conversa?", "acceptedAnswer": {"@type": "Answer", "text": "Simples: você manda uma mensagem contando o que está sentindo, do jeito que sair. A AURA não aplica formulário nem entrega respostas prontas — ela pergunta, escuta e ajuda você a organizar o que está embaralhado."}},
              {"@type": "Question", "name": "A AURA substitui atendimento profissional?", "acceptedAnswer": {"@type": "Answer", "text": "Não. A AURA é apoio no dia a dia: conversa contínua, memória do seu percurso e direção prática. Ela não faz diagnóstico, não substitui atendimento profissional e não se apresenta como tratamento."}},
              {"@type": "Question", "name": "Como funciona o período de teste?", "acceptedAnswer": {"@type": "Answer", "text": "Você experimenta a AURA por 7 dias com acesso completo ao plano escolhido, pagando apenas uma taxa simbólica (a partir de R$ 6,90). Se não fizer sentido, cancele a qualquer momento antes do 8º dia e não será cobrado mais nada."}},
              {"@type": "Question", "name": "Posso pausar minha assinatura?", "acceptedAnswer": {"@type": "Answer", "text": "Sim! Se você precisar dar um tempo, pode pausar sua assinatura por até 30 dias sem perder seu histórico ou progresso."}},
              {"@type": "Question", "name": "O que são os Encontros Guiados?", "acceptedAnswer": {"@type": "Answer", "text": "São encontros de 45 minutos com metodologia estruturada. Você escolhe o tema: Clareza (decisões), Padrões (comportamentos repetitivos), Propósito (sentido de vida) ou Livre. Depois, recebe um resumo escrito com os principais insights."}},
              {"@type": "Question", "name": "Posso enviar áudio?", "acceptedAnswer": {"@type": "Answer", "text": "Sim! Você pode mandar áudio e também receber respostas em áudio. Fale do jeito que for mais natural pra você."}},
              {"@type": "Question", "name": "Meus dados ficam seguros?", "acceptedAnswer": {"@type": "Answer", "text": "Sim. Seus dados são criptografados e usados apenas para a AURA lembrar do seu histórico e melhorar seu acompanhamento. Seguimos todas as normas da LGPD."}},
              {"@type": "Question", "name": "Posso cancelar quando quiser?", "acceptedAnswer": {"@type": "Answer", "text": "Sim. No plano mensal você cancela quando quiser, sem fidelidade ou multa."}},
              {"@type": "Question", "name": "O que é a Cápsula do Tempo?", "acceptedAnswer": {"@type": "Answer", "text": "É um recurso exclusivo da AURA. Em momentos especiais da conversa, a AURA te convida a gravar um áudio para o seu eu do futuro. Daqui a 3 meses, você recebe essa mensagem de volta — de surpresa."}}
            ]
          })}
        </script>
      </Helmet>

      <div className="theme-v2 min-h-screen bg-background text-foreground antialiased selection:bg-primary/30">
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
    </>
  );
};

export default IndexV3;
