import { Helmet } from "react-helmet-async";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { CheckCircle, Loader2, MessageCircle, BookOpen, CalendarDays, Headphones, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { logFunnel } from "@/lib/checkout-funnel";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import logoOlaAura from "@/assets/logo-ola-aura.png";

const ThankYou = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [userData, setUserData] = useState({ name: "", plan: "anual", returning: false });
  const [accessState, setAccessState] = useState<"checking" | "pending" | "ready" | "unavailable">("checking");

  useEffect(() => {
    // Nada de desligar o autoConfig aqui: isso também matava a Correspondência
    // Avançada Automática (AAM) nesta página. O Purchase real é enviado pelos
    // webhooks de pagamento (servidor), e a página não expõe valor/pedido que o
    // Meta possa interpretar como compra automática.

    // Try to get data from location state first, then localStorage
    let checkoutData = { name: "", plan: "anual", returning: false };

    if (location.state?.name) {
      checkoutData = {
        name: location.state.name,
        plan: location.state.plan || "anual",
        returning: !!location.state.returningCustomerMonthly,
      };
    } else {
      const stored = localStorage.getItem('aura_checkout');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          checkoutData = {
            name: parsed.name || "",
            plan: parsed.plan || "anual",
            returning: !!parsed.returningCustomerMonthly,
          };
          localStorage.removeItem('aura_checkout');
        } catch (e) {
          console.error('Error parsing checkout data:', e);
        }
      }
    }

    setUserData(checkoutData);
    // Registra somente a volta do navegador. Compra confirmada vem do servidor.
    try {
      if (!sessionStorage.getItem("aura_funnel_return_logged")) {
        sessionStorage.setItem("aura_funnel_return_logged", "1");
        logFunnel("return_view", {
          plan: checkoutData.plan,
          detail: checkoutData.returning ? "retornante" : "novo",
        });
      }
    } catch {
      /* noop */
    }
    // Purchase event is sent server-side only (CAPI via stripe-webhook)
    // to avoid double-counting by Meta

    // ChatGPT Ads: o purchase é enviado APENAS pelo servidor (openai-capi, a
    // partir dos webhooks de pagamento). Disparar aqui também duplicaria a
    // conversão, porque o event_id do navegador não coincide com o do webhook.
  }, [location.state]);

  useEffect(() => {
    const token = localStorage.getItem("aura_checkout_access");
    if (!token) {
      setAccessState("unavailable");
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      const { data, error } = await supabase.functions.invoke("checkout-app-access", {
        body: { action: "status", token },
      });
      if (cancelled) return;
      if (error) {
        setAccessState("unavailable");
        return;
      }
      if (!data?.paid) {
        setAccessState("pending");
        if (attempts < 20) window.setTimeout(check, 3000);
        return;
      }
      setAccessState("ready");
      const consumed = await supabase.functions.invoke("checkout-app-access", {
        body: { action: "consume", token },
      });
      if (cancelled) return;
      if (consumed.error || !consumed.data?.token_hash) {
        setAccessState("unavailable");
        return;
      }
      const verified = await supabasePortal.auth.verifyOtp({
        token_hash: consumed.data.token_hash,
        type: consumed.data.type || "magiclink",
      });
      if (!verified.error) {
        localStorage.removeItem("aura_checkout_access");
        navigate("/meu-espaco?tab=conversar&open=1&onboarding=new", { replace: true });
      } else {
        setAccessState("unavailable");
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [navigate]);

  const firstName = userData.name?.split(" ")[0] || "você";

  return (
    <>
      <Helmet>
        <title>Seu app está sendo liberado | Olá Aura</title>
        <meta name="description" content="Seu acesso ao app Olá Aura está sendo liberado." />
        <meta property="og:url" content="https://olaaura.com.br/obrigado" />
        <meta property="og:title" content="Seu app está sendo liberado | Olá Aura" />
        <meta property="og:description" content="Seu acesso ao app Olá Aura está sendo liberado." />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="portal-chat-theme min-h-dvh bg-background text-foreground">
        <header className="border-b border-border/70 bg-card/90">
          <div className="mx-auto flex max-w-lg justify-center px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <img src={logoOlaAura} alt="Olá Aura" className="h-12 w-auto" />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-lg flex-col items-center px-5 py-8 text-center sm:py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            {accessState === "ready" ? <CheckCircle className="h-8 w-8 text-primary" /> : <Loader2 className="h-7 w-7 animate-spin text-primary" />}
          </div>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">App Olá Aura</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">
            {userData.returning ? `Que bom ter você de volta, ${firstName}` : `Seu app está quase pronto, ${firstName}`}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {accessState === "ready"
              ? "Pagamento confirmado. Estamos abrindo o app Olá Aura neste aparelho."
              : accessState === "unavailable"
                ? "Seu pagamento retornou, mas a entrada automática não ficou disponível neste aparelho."
                : "Estamos confirmando seu pagamento com segurança. Assim que estiver tudo certo, o app abre automaticamente."}
          </p>

          <div className="mt-8 w-full border-y border-border/70 py-5">
            <p className="mb-4 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Tudo que acompanha você</p>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Conversa", icon: MessageCircle, tone: "portal-area-conversation" },
                { label: "Sessões", icon: CalendarDays, tone: "portal-area-sessions" },
                { label: "Jornadas", icon: BookOpen, tone: "portal-area-content" },
                { label: "Percurso", icon: Sparkles, tone: "portal-area-journey" },
                { label: "Meditações", icon: Headphones, tone: "portal-area-audio" },
              ].map(({ label, icon: Icon, tone }) => (
                <div key={label} className="flex min-w-0 flex-col items-center gap-2">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                  <span className="w-full text-[10px] font-semibold text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 w-full space-y-3">
            {accessState === "unavailable" && (
              <Button asChild className="h-11 w-full">
                <Link to="/meu-espaco/entrar">Entrar no app Olá Aura</Link>
              </Button>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Você também receberá uma confirmação por mensagem e por email. Esses canais servem como alternativa caso precise entrar em outro aparelho.
            </p>
          </div>
        </main>
      </div>
    </>
  );
};

export default ThankYou;
