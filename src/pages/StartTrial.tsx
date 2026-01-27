import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MessageCircle, CreditCard, Clock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const StartTrial = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanPhone = phone.replace(/\D/g, "");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!name.trim()) {
      toast({
        title: "Nome é obrigatório",
        description: "Por favor, digite seu nome.",
        variant: "destructive",
      });
      return;
    }

    if (!emailRegex.test(email)) {
      toast({
        title: "Email inválido",
        description: "Por favor, insira um email válido.",
        variant: "destructive",
      });
      return;
    }

    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      toast({
        title: "WhatsApp inválido",
        description: "Por favor, digite um número válido com DDD.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("start-trial", {
        body: { name: name.trim(), email: email.trim(), phone: cleanPhone },
      });

      if (error) throw error;

      if (data.alreadyExists) {
        toast({
          title: "Você já usou seu trial",
          description: "Esse número já tem um cadastro. Escolha um plano para continuar!",
          variant: "default",
        });
        navigate("/checkout");
        return;
      }

      // Salvar no localStorage para a página de confirmação
      localStorage.setItem("trialName", name.trim());
      localStorage.setItem("trialPhone", cleanPhone);

      navigate("/trial-iniciado");
    } catch (error: any) {
      console.error("Trial error:", error);
      toast({
        title: "Erro ao iniciar trial",
        description: error.message || "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Experimentar Grátis | AURA</title>
        <meta name="description" content="Experimente a AURA gratuitamente. 5 conversas sem compromisso, sem cartão de crédito." />
      </Helmet>

      <div className="min-h-screen bg-gradient-hero">
        {/* Header */}
        <header className="py-4 px-4">
          <div className="container mx-auto flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Voltar</span>
            </Link>
            <Link to="/">
              <img src={logoOlaAura} alt="AURA" className="h-8" />
            </Link>
            <div className="w-16" />
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto">
            {/* Hero */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
                <Sparkles className="w-4 h-4" />
                100% Grátis
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-3">
                Experimente a AURA
              </h1>
              <p className="text-muted-foreground">
                5 conversas pra você conhecer sua nova amiga.
              </p>
            </div>

            {/* Benefícios */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="bg-card/50 rounded-xl p-3 text-center">
                <MessageCircle className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">5 conversas</p>
              </div>
              <div className="bg-card/50 rounded-xl p-3 text-center">
                <CreditCard className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Sem cartão</p>
              </div>
              <div className="bg-card/50 rounded-xl p-3 text-center">
                <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Sem prazo</p>
              </div>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-foreground">Seu nome</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Como posso te chamar?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-foreground">Seu email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="text-foreground">WhatsApp</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={handlePhoneChange}
                    className="mt-1.5"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    A AURA vai te mandar uma mensagem por lá
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                variant="sage"
                size="lg"
                className="w-full mt-6"
                disabled={isLoading}
              >
                {isLoading ? "Iniciando..." : "Começar Grátis"}
              </Button>
            </form>

            {/* Trust */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              Ao continuar, você concorda com nossos{" "}
              <Link to="/termos" className="underline">Termos</Link> e{" "}
              <Link to="/privacidade" className="underline">Privacidade</Link>.
            </p>
          </div>
        </main>
      </div>
    </>
  );
};

export default StartTrial;
