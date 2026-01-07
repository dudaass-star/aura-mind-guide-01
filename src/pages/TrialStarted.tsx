import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { CheckCircle, MessageCircle, Sparkles, ArrowRight } from "lucide-react";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const TrialStarted = () => {
  const [name, setName] = useState("");

  useEffect(() => {
    const storedName = localStorage.getItem("trialName");
    if (storedName) {
      setName(storedName);
    }
  }, []);

  return (
    <>
      <Helmet>
        <title>Trial Iniciado | AURA</title>
        <meta name="description" content="Seu trial gratuito da AURA foi iniciado! Olhe seu WhatsApp." />
      </Helmet>

      <div className="min-h-screen bg-gradient-hero flex flex-col">
        {/* Header */}
        <header className="py-4 px-4">
          <div className="container mx-auto flex justify-center">
            <Link to="/">
              <img src={logoOlaAura} alt="AURA" className="h-8" />
            </Link>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="max-w-md mx-auto text-center">
            {/* Success Icon */}
            <div className="relative inline-block mb-6">
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-primary" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-primary-foreground" />
              </div>
            </div>

            {/* Message */}
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-3">
              Prontinho{name ? `, ${name}` : ""}! 💜
            </h1>
            <p className="text-muted-foreground mb-8">
              Olha seu WhatsApp — a AURA já te mandou uma mensagem de boas-vindas.
            </p>

            {/* What to expect */}
            <div className="bg-card rounded-2xl p-6 text-left mb-8 border border-border/50">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                O que esperar
              </h2>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">1</span>
                  <span>Responda a mensagem da AURA no WhatsApp</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">2</span>
                  <span>Converse sobre o que quiser, sem julgamento</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">3</span>
                  <span>Você tem 5 conversas pra conhecer a AURA</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium">4</span>
                  <span>Depois, escolha um plano pra continuar</span>
                </li>
              </ul>
            </div>

            {/* CTA */}
            <Link to="/">
              <Button variant="glass" size="lg" className="gap-2">
                Voltar para o site
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </main>
      </div>
    </>
  );
};

export default TrialStarted;
