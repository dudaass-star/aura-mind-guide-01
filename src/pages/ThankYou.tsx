import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { useLocation, Link } from "react-router-dom";
import { CheckCircle, MessageCircle, Sparkles } from "lucide-react";

const ThankYou = () => {
  const location = useLocation();
  const { name, plan } = location.state || { name: "", plan: "anual" };

  const firstName = name?.split(" ")[0] || "você";

  const whatsappNumber = "5511999999999"; // Replace with actual number
  const whatsappMessage = encodeURIComponent(
    `Oi, AURA! Acabei de assinar e quero começar minha jornada.`
  );
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  return (
    <>
      <Helmet>
        <title>Bem-vindo à AURA!</title>
        <meta name="description" content="Sua assinatura foi confirmada. Comece sua jornada de evolução emocional agora." />
      </Helmet>

      <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-glow rounded-full blur-3xl opacity-50 animate-pulse-soft" />
          <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-glow rounded-full blur-3xl opacity-30 animate-pulse-soft delay-200" />
        </div>

        <div className="relative z-10 max-w-lg w-full text-center">
          {/* Success icon */}
          <div className="mb-8 animate-fade-up">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-teal/20 mb-4">
              <CheckCircle className="w-10 h-10 text-teal" />
            </div>
          </div>

          {/* Content */}
          <div className="animate-fade-up delay-100">
            <h1 className="font-display text-4xl md:text-5xl font-semibold text-foreground mb-4">
              Parabéns, {firstName}!
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Sua assinatura do plano <span className="text-primary font-medium">{plan}</span> foi confirmada.
              <br />
              Agora é só começar sua conversa com a AURA.
            </p>
          </div>

          {/* CTA */}
          <div className="space-y-4 animate-fade-up delay-200">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="whatsapp" size="xl" className="w-full">
                <MessageCircle className="w-5 h-5" />
                Abrir WhatsApp e começar
              </Button>
            </a>

            <p className="text-sm text-muted-foreground">
              A AURA já está esperando por você
            </p>
          </div>

          {/* Tips */}
          <div className="mt-12 p-6 bg-card/50 rounded-2xl border border-border/50 text-left animate-fade-up delay-300">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="font-display text-lg font-semibold text-foreground">
                Como aproveitar ao máximo
              </h3>
            </div>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">1</span>
                <span>Responda as 4 perguntas do onboarding com sinceridade</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">2</span>
                <span>Converse como falaria com uma amiga — sem filtros</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">3</span>
                <span>Faça os check-ins diários para acompanhar seu progresso</span>
              </li>
            </ul>
          </div>

          {/* Back link */}
          <div className="mt-8 animate-fade-up delay-400">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Voltar para o site
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default ThankYou;
