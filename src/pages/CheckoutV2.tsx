import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CreditCard, Check, Shield, Lock, Gift, QrCode, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { trackBeginCheckout, trackAddPaymentInfo, trackExitIntent, getGaClientId } from "@/lib/ga4";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import "@/styles/v2-theme.css";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AsaasCardForm } from "@/components/checkout/AsaasCardForm";

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingPeriod = "monthly" | "quarterly" | "semestral" | "yearly";

interface PlanConfig {
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  yearlyMonthlyEquivalent: string;
  yearlyDiscount: number;
  quarterlyPrice: string;
  quarterlyMonthlyEquivalent: string;
  quarterlyDiscount: number;
  semestralPrice: string;
  semestralMonthlyEquivalent: string;
  semestralDiscount: number;
  trialPrice: string;
  sessions: number;
  highlights: string[];
}

const plans: Record<PlanId, PlanConfig> = {
  essencial: {
    name: "Essencial",
    monthlyPrice: "29,90",
    yearlyPrice: "214,90",
    yearlyMonthlyEquivalent: "17,91",
    yearlyDiscount: 40,
    quarterlyPrice: "79,90",
    quarterlyMonthlyEquivalent: "26,63",
    quarterlyDiscount: 11,
    semestralPrice: "125,90",
    semestralMonthlyEquivalent: "20,98",
    semestralDiscount: 30,
    trialPrice: "6,90",
    sessions: 0,
    highlights: ["Conversas ilimitadas 24/7", "Check-in diário", "Review semanal"],
  },
  direcao: {
    name: "Direção",
    monthlyPrice: "49,90",
    yearlyPrice: "359,90",
    yearlyMonthlyEquivalent: "29,99",
    yearlyDiscount: 40,
    quarterlyPrice: "133,90",
    quarterlyMonthlyEquivalent: "44,63",
    quarterlyDiscount: 11,
    semestralPrice: "209,90",
    semestralMonthlyEquivalent: "34,98",
    semestralDiscount: 30,
    trialPrice: "9,90",
    sessions: 4,
    highlights: ["Tudo do Essencial", "4 Sessões Especiais/mês", "Resumo após cada sessão"],
  },
  transformacao: {
    name: "Transformação",
    monthlyPrice: "79,90",
    yearlyPrice: "574,90",
    yearlyMonthlyEquivalent: "47,91",
    yearlyDiscount: 40,
    quarterlyPrice: "213,90",
    quarterlyMonthlyEquivalent: "71,30",
    quarterlyDiscount: 11,
    semestralPrice: "335,90",
    semestralMonthlyEquivalent: "55,98",
    semestralDiscount: 30,
    trialPrice: "19,90",
    sessions: 8,
    highlights: ["Tudo do Direção", "8 Sessões Especiais/mês", "Prioridade no agendamento"],
  },
};

// Helpers de período: PIX é one-time pros 3 planos longos.
// Cartão (com trial 7 dias) só faz sentido em Mensal/Anual hoje.
const isPixPeriod = (b: BillingPeriod) => b !== "monthly";
const periodLabelMap: Record<BillingPeriod, string> = {
  monthly: "mês",
  quarterly: "trimestre",
  semestral: "semestre",
  yearly: "ano",
};
const periodShortMap: Record<BillingPeriod, string> = {
  monthly: "Mensal",
  quarterly: "Trim",
  semestral: "Sem",
  yearly: "Anual",
};

function getPeriodPrice(plan: PlanConfig, b: BillingPeriod): string {
  switch (b) {
    case "monthly": return plan.monthlyPrice;
    case "quarterly": return plan.quarterlyPrice;
    case "semestral": return plan.semestralPrice;
    case "yearly": return plan.yearlyPrice;
  }
}
function getPeriodDiscount(plan: PlanConfig, b: BillingPeriod): number {
  switch (b) {
    case "quarterly": return plan.quarterlyDiscount;
    case "semestral": return plan.semestralDiscount;
    case "yearly": return plan.yearlyDiscount;
    default: return 0;
  }
}
function getPeriodMonthlyEquivalent(plan: PlanConfig, b: BillingPeriod): string | null {
  switch (b) {
    case "quarterly": return plan.quarterlyMonthlyEquivalent;
    case "semestral": return plan.semestralMonthlyEquivalent;
    case "yearly": return plan.yearlyMonthlyEquivalent;
    default: return null;
  }
}

function formatCpf(value: string): string {
  const c = value.replace(/\D/g, "").slice(0, 11);
  if (c.length <= 3) return c;
  if (c.length <= 6) return `${c.slice(0, 3)}.${c.slice(3)}`;
  if (c.length <= 9) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}
function isValidCpf(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11) return false;
  if (/^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

const CheckoutV2 = () => {
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const planFromUrl = searchParams.get("plan") as PlanId | null;
  const billingFromUrl = searchParams.get("billing") as BillingPeriod | null;
  const planFromState = location.state?.plan as PlanId | undefined;
  const billingFromState = location.state?.billing as BillingPeriod | undefined;

  const initialPlan = planFromUrl || planFromState || "direcao";
  const initialBilling = billingFromUrl || billingFromState || "monthly";

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBilling);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  // Erros inline de validação dos 3 campos do formulário. Substituem o toast,
  // que sumia em 3s e deixava o usuário perdido (especialmente no mobile, onde
  // o campo WhatsApp ficava abaixo da dobra e o usuário clicava no CTA sem ver).
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
  // Estado do checkout embedado: clientSecret + promise da Stripe.js carregada com a chave pública
  // devolvida pela edge function. Quando setados, renderizamos <EmbeddedCheckout /> inline,
  // sem salto pro domínio checkout.stripe.com.
  const [embeddedClientSecret, setEmbeddedClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeJs | null> | null>(null);
  // Gateway de cartão vindo do system_config. Default stripe até carregar.
  const [cardGateway, setCardGateway] = useState<"stripe" | "asaas">("stripe");
  // Quando gateway=asaas, submit do form abre o AsaasCardForm ao invés do embed Stripe.
  const [asaasCardOpen, setAsaasCardOpen] = useState(false);

  // PIX (Asaas): só aparece pra trim/sem/anual. Modal abre com form de CPF
  // (resto dos dados reusa name/email/phone do form principal) e troca pra
  // tela de QR depois que a edge function retorna.
  const [pixOpen, setPixOpen] = useState(false);
  const [pixStage, setPixStage] = useState<"form" | "qr">("form");
  // Modo do PIX no modal: one-time (criar-pix-asaas) ou subscription (criar-pix-recorrente-asaas).
  // Mensal usa subscription; Trim/Sem/Anual usam one-time (à vista).
  const [pixMode, setPixMode] = useState<"one-time" | "subscription">("one-time");
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState<string | undefined>(undefined);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixData, setPixData] = useState<{
    qrImage: string;
    copyPaste: string;
    expiresAt: string | null;
    invoiceUrl: string | null;
    amount: number;
  } | null>(null);

  // ViewContent + GA4 begin_checkout no mount
  useEffect(() => {
    const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "ViewContent", {
        content_name: "Checkout Page V2",
        content_category: "checkout",
        value: trialPriceMap[selectedPlan],
        currency: "BRL",
      });
    }
    trackBeginCheckout({ plan: selectedPlan, value: trialPriceMap[selectedPlan] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca gateway de cartão ativo (só afeta rota do cartão, não do PIX).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "card_gateway")
        .maybeSingle();
      if (data?.value !== undefined && data?.value !== null) {
        // JSONB pode voltar como string pura ("asaas") ou como JSON string ('"asaas"').
        // Tenta parse; se falhar, usa o valor cru.
        let v: unknown = data.value;
        if (typeof v === "string") {
          try { v = JSON.parse(v); } catch { /* mantém string crua */ }
        }
        if (v === "asaas" || v === "stripe") setCardGateway(v);
      }
    })();
  }, []);

  // Exit-intent (mesma regra do V1: desktop >= 768px)
  useEffect(() => {
    const exitShown = sessionStorage.getItem("aura_exit_popup_shown");
    if (exitShown) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (
        e.clientY <= 0 &&
        !hasRedirected &&
        !embeddedClientSecret &&
        !sessionStorage.getItem("aura_exit_popup_shown")
      ) {
        sessionStorage.setItem("aura_exit_popup_shown", "true");
        setShowExitPopup(true);
        trackExitIntent("open");
      }
    };

    const handleVisibilityChange = () => {
      if (
        window.innerWidth >= 768 &&
        document.visibilityState === "hidden" &&
        !hasRedirected &&
        !embeddedClientSecret &&
        !sessionStorage.getItem("aura_exit_popup_shown")
      ) {
        sessionStorage.setItem("aura_exit_popup_shown", "true");
        setShowExitPopup(true);
        trackExitIntent("open");
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasRedirected, embeddedClientSecret]);

  const currentPlan = plans[selectedPlan];
  const currentPrice = getPeriodPrice(currentPlan, billingPeriod);
  const periodLabel = periodLabelMap[billingPeriod];
  const currentDiscount = getPeriodDiscount(currentPlan, billingPeriod);
  const currentMonthlyEquivalent = getPeriodMonthlyEquivalent(currentPlan, billingPeriod);
  const pixEnabled = isPixPeriod(billingPeriod);

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigits = phone.replace(/\D/g, "");
  const isFormValid =
    name.trim().length > 0 && emailRegex.test(email.trim()) && phoneDigits.length >= 11;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Submit padrão: cartão. Mensal = trial 7d; Trim/Sem/Anual = recorrente sem trial.
    // (CTAs PIX em qualquer período chamam handleOpenPix direto, não passam por aqui.)

    // Valida tudo de uma vez e mostra os erros inline. Auto-scroll para o
    // primeiro campo inválido — o WhatsApp costuma estar abaixo da dobra no mobile.
    const nextErrors: { name?: string; email?: string; phone?: string } = {};
    if (phoneDigits.length < 11) nextErrors.phone = "Digite seu WhatsApp com DDD (11 dígitos).";
    if (!name.trim()) nextErrors.name = "Por favor, digite seu nome.";
    if (!email.trim() || !emailRegex.test(email)) nextErrors.email = "Digite um email válido.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const order = ["phone", "name", "email"] as const;
      const firstInvalid = order.find((field) => nextErrors[field]);
      if (firstInvalid) {
        requestAnimationFrame(() => {
          const el = document.getElementById(firstInvalid);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          el?.focus({ preventScroll: true });
        });
      }
      return;
    }
    setErrors({});

    setIsLoading(true);

    try {
      // Se o admin roteou cartão para o Asaas, mostra o AsaasCardForm em vez
      // de disparar o create-checkout do Stripe. Toda a validação/erros dos
      // 3 campos comuns já rodou acima.
      if (cardGateway === "asaas") {
        setAsaasCardOpen(true);
        setHasRedirected(true);
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        setIsLoading(false);
        return;
      }

      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return match ? match[2] : undefined;
      };
      const fbp = getCookie("_fbp");
      const fbc =
        getCookie("_fbc") ||
        (new URLSearchParams(window.location.search).get("fbclid")
          ? `fb.1.${Date.now()}.${new URLSearchParams(window.location.search).get("fbclid")}`
          : undefined);

      const leadEventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const icEventId = `ic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const userData = {
        email: email.trim(),
        phone: phone.replace(/\D/g, ""),
        first_name: name.trim().split(" ")[0],
        client_user_agent: navigator.userAgent,
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
      };

      if (typeof window !== "undefined" && (window as any).fbq) {
        (window as any).fbq(
          "track",
          "Lead",
          {
            content_name: `Trial ${plans[selectedPlan].name}`,
            content_category: "checkout",
            value: ({ essencial: 6.9, direcao: 9.9, transformacao: 19.9 } as Record<string, number>)[selectedPlan],
            currency: "BRL",
          },
          { eventID: leadEventId },
        );
        (window as any).fbq(
          "track",
          "InitiateCheckout",
          {
            content_name: `Trial ${plans[selectedPlan].name}`,
            content_category: "checkout",
            value: ({ essencial: 6.9, direcao: 9.9, transformacao: 19.9 } as Record<string, number>)[selectedPlan],
            currency: "BRL",
          },
          { eventID: icEventId },
        );
      }

      const capiPayload = {
        event_source_url: window.location.href,
        user_data: userData,
        custom_data: {
          content_name: `Trial ${plans[selectedPlan].name}`,
          content_category: "checkout",
          value: ({ essencial: 6.9, direcao: 9.9, transformacao: 19.9 } as Record<string, number>)[selectedPlan],
          currency: "BRL",
        },
      };

      Promise.all([
        supabase.functions.invoke("meta-capi", {
          body: { ...capiPayload, event_name: "Lead", event_id: leadEventId },
        }),
        supabase.functions.invoke("meta-capi", {
          body: { ...capiPayload, event_name: "InitiateCheckout", event_id: icEventId },
        }),
      ]).catch(() => {});

      const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
      trackAddPaymentInfo({ plan: selectedPlan, billing: billingPeriod, value: trialPriceMap[selectedPlan] });

      const gaClientId = getGaClientId();

      const isMonthlyTrial = billingPeriod === "monthly";
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan: selectedPlan,
          billing: billingPeriod,
          trial: isMonthlyTrial,
          paymentMethod: "card",
          embedded: true,
          name: name.trim(),
          email: email.trim(),
          phone: phone,
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(gaClientId && { gaClientId }),
        },
      });

      // 409 c/ body JSON (ex.: WEEKLY_NOT_AVAILABLE_FOR_RETURNING) chega em error.context (Response)
      if (error) {
        let errBody: any = (data as any) ?? null;
        const ctx = (error as any)?.context;
        if (!errBody && ctx && typeof ctx.json === "function") {
          try { errBody = await ctx.json(); } catch { /* ignore */ }
        }
        if (errBody?.code === "WEEKLY_NOT_AVAILABLE_FOR_RETURNING") {
          toast.info(errBody.error, { duration: 7000 });
          setBillingPeriod("monthly");
          requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
          return;
        }
        throw new Error(errBody?.error || error.message || "Erro ao processar pagamento");
      }

      if (data?.clientSecret && data?.publishableKey) {
        // Persistimos os dados pra resgate caso o usuário recarregue durante o pagamento.
        localStorage.setItem(
          "aura_checkout",
          JSON.stringify({ name, phone, plan: selectedPlan, billing: billingPeriod, price: currentPrice }),
        );
        setHasRedirected(true);
        setStripePromise(loadStripe(data.publishableKey as string));
        setEmbeddedClientSecret(data.clientSecret as string);
        // Vai pro topo da página: a PaymentView substitui o form e o widget
        // Stripe fica logo abaixo do header — visível na dobra mobile.
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } else {
        throw new Error("clientSecret não recebido");
      }
    } catch (err) {
      console.error("Checkout V2 error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Options memoizado pra evitar re-mount do EmbeddedCheckoutProvider a cada render.
  const embeddedOptions = useMemo(
    () => (embeddedClientSecret ? { clientSecret: embeddedClientSecret } : null),
    [embeddedClientSecret],
  );

  const handleResetCheckout = useCallback(() => {
    setEmbeddedClientSecret(null);
    setStripePromise(null);
    setAsaasCardOpen(false);
    setHasRedirected(false);
  }, []);

  // Abre o modal PIX. Valida os 3 campos comuns antes (mesma regra do CTA cartão).
  // `mode` define se vamos chamar a edge one-time ou a de subscription.
  const handleOpenPix = (mode: "one-time" | "subscription" = "one-time") => {
    const nextErrors: { name?: string; email?: string; phone?: string } = {};
    if (phoneDigits.length < 11) nextErrors.phone = "Digite seu WhatsApp com DDD (11 dígitos).";
    if (!name.trim()) nextErrors.name = "Por favor, digite seu nome.";
    if (!email.trim() || !emailRegex.test(email)) nextErrors.email = "Digite um email válido.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const order = ["phone", "name", "email"] as const;
      const firstInvalid = order.find((f) => nextErrors[f]);
      if (firstInvalid) {
        requestAnimationFrame(() => {
          const el = document.getElementById(firstInvalid);
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          el?.focus({ preventScroll: true });
        });
      }
      return;
    }
    setErrors({});
    setPixMode(mode);
    setPixStage("form");
    setPixData(null);
    setCpfError(undefined);
    setPixOpen(true);
  };

  // Gera a cobrança PIX no Asaas e troca o modal pra tela de QR.
  const handleGeneratePix = async () => {
    if (!isValidCpf(cpf)) {
      setCpfError("CPF inválido. Confira os 11 dígitos.");
      return;
    }
    setCpfError(undefined);
    setPixLoading(true);
    try {
      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return match ? match[2] : undefined;
      };
      const fbp = getCookie("_fbp");
      const fbc =
        getCookie("_fbc") ||
        (new URLSearchParams(window.location.search).get("fbclid")
          ? `fb.1.${Date.now()}.${new URLSearchParams(window.location.search).get("fbclid")}`
          : undefined);
      const gaClientId = getGaClientId();
      const edgeName = pixMode === "subscription" ? "criar-pix-recorrente-asaas" : "criar-pix-asaas";
      const { data, error } = await supabase.functions.invoke(edgeName, {
        body: {
          plan: selectedPlan,
          billing: billingPeriod,
          name: name.trim(),
          email: email.trim(),
          phone: phone.replace(/\D/g, ""),
          cpf: cpf.replace(/\D/g, ""),
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(gaClientId && { gaClientId }),
        },
      });
      if (error) throw new Error(error.message || "Erro ao gerar PIX");
      if (!data?.qrCodeImage || !data?.copyPaste) {
        throw new Error("PIX não retornado pelo provedor");
      }
      setPixData({
        qrImage: data.qrCodeImage,
        copyPaste: data.copyPaste,
        expiresAt: data.expiresAt || null,
        invoiceUrl: data.invoiceUrl || null,
        amount: data.amount || 0,
      });
      setPixStage("qr");
      trackAddPaymentInfo({ plan: selectedPlan, billing: billingPeriod, value: data.amount || 0 });
    } catch (err) {
      console.error("PIX V2 error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PIX. Tente novamente.");
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pixData?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(pixData.copyPaste);
      toast.success("Código PIX copiado!");
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  const inputCls =
    "mt-1.5 bg-white/5 border-white/15 text-white placeholder:text-white/55 focus-visible:ring-1 focus-visible:ring-[hsl(140_18%_55%)]";

  return (
    <>
      <Helmet>
        <title>Checkout - AURA</title>
        <meta
          name="description"
          content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional."
        />
        <link rel="canonical" href="https://olaaura.com.br/v2/checkout" />
        <meta property="og:url" content="https://olaaura.com.br/v2/checkout" />
        <meta property="og:title" content="Checkout - AURA" />
        <meta property="og:description" content="Finalize sua assinatura da AURA e comece sua jornada de evolução emocional." />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="v2-theme min-h-screen bg-[hsl(220_35%_8%)] text-white">
        {/* Glow decorativo no topo */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, hsl(140 22% 35% / 0.35) 0%, transparent 70%)",
          }}
          aria-hidden
        />

        <header className="relative py-5 border-b border-white/10">
          <div className="container mx-auto px-6 flex items-center justify-between">
            <Link
              to="/v2"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Voltar</span>
            </Link>
            <Link to="/v2" className="flex items-center">
              <img
                src={logoOlaAura}
                alt="Olá AURA"
                className="h-14 w-auto brightness-0 invert"
              />
            </Link>
            <div className="w-16" />
          </div>
        </header>

        <div className="relative container mx-auto px-4 py-8 md:py-12 pb-12">
          <div className="max-w-xl mx-auto">
            {/* Stepper — orienta o usuário sobre o tamanho real do fluxo (só 2 passos).
                Reduz a ansiedade de "será que tem mais etapa depois?". */}
            <div className="flex items-center justify-center gap-3 mb-6 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-semibold transition-colors ${
                    embeddedClientSecret
                      ? "bg-[hsl(140_22%_45%)] border-[hsl(140_22%_45%)] text-white"
                      : "bg-[hsl(140_22%_45%)] border-[hsl(140_22%_45%)] text-white"
                  }`}
                >
                  {embeddedClientSecret ? <Check className="w-3 h-3" /> : "1"}
                </span>
                <span className={embeddedClientSecret ? "text-white/55" : "text-white font-medium"}>
                  Seus dados
                </span>
              </div>
              <span className="w-6 h-px bg-white/20" />
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-semibold transition-colors ${
                    embeddedClientSecret
                      ? "bg-[hsl(140_22%_45%)] border-[hsl(140_22%_45%)] text-white"
                      : "bg-transparent border-white/30 text-white/50"
                  }`}
                >
                  2
                </span>
                <span className={embeddedClientSecret ? "text-white font-medium" : "text-white/50"}>
                  Pagamento
                </span>
              </div>
            </div>

            {embeddedClientSecret && stripePromise && embeddedOptions ? (
              /* PaymentView — tela dedicada de pagamento.
                 Form some completamente; usuário vê só o widget Stripe + contexto mínimo.
                 Isso elimina a ambiguidade dos dois CTAs e do form duplicado embaixo. */
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={handleResetCheckout}
                  className="inline-flex items-center gap-1.5 text-sm text-white/65 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Editar dados
                </button>

                <div className="text-center">
                  <h1 className="font-display text-2xl md:text-3xl font-semibold mb-2 tracking-tight">
                    Confirme e pague
                  </h1>
                  <p className="text-white/70 text-sm">
                    Plano <span className="text-white font-medium">{currentPlan.name}</span> •{" "}
                    <span className="text-[hsl(140_30%_72%)] font-semibold">R$ {currentPlan.trialPrice}</span>{" "}
                    agora • depois R$ {currentPrice}/{periodLabel}
                  </p>
                </div>

                <div className="text-center">
                  <p className="font-display text-base md:text-lg font-semibold text-[hsl(140_30%_72%)]">
                    Preencha seu cartão abaixo para finalizar ↓
                  </p>
                  <p className="text-[11px] text-white/55 mt-1">
                    Pagamento seguro processado pela Stripe
                  </p>
                </div>

                {/* Trust signals colados ao widget — ficam no campo de visão exato
                    do momento em que o usuário vai digitar o cartão. */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] text-white/75 bg-white/5 border border-white/10 rounded-full px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                    Pagamento seguro Stripe
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                    Garantia 7 dias
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                    Cancele em 1 clique
                  </div>
                </div>

                <div className="relative rounded-2xl bg-white p-2 md:p-4 shadow-2xl min-h-[480px]">
                  {/* Skeleton enquanto o iframe da Stripe carrega (~2-3s).
                      O EmbeddedCheckout pinta por cima quando estiver pronto. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                    <div className="w-8 h-8 rounded-full border-2 border-[hsl(140_22%_45%)]/30 border-t-[hsl(140_22%_45%)] animate-spin" />
                    <p className="text-xs text-gray-500">Carregando pagamento seguro…</p>
                  </div>
                  <div className="relative z-10">
                    <EmbeddedCheckoutProvider stripe={stripePromise} options={embeddedOptions}>
                      <EmbeddedCheckout />
                    </EmbeddedCheckoutProvider>
                  </div>
                </div>
              </div>
            ) : asaasCardOpen ? (
              <AsaasCardForm
                plan={selectedPlan}
                billing={billingPeriod}
                name={name}
                email={email}
                phone={phone}
                amountLabel={`R$ ${currentPrice}`}
                periodLabel={periodLabel}
                installmentMax={12}
                trial={billingPeriod === "monthly"}
                fbp={(() => {
                  const m = document.cookie.match(/(?:^|; )_fbp=([^;]+)/);
                  return m ? decodeURIComponent(m[1]) : undefined;
                })()}
                fbc={(() => {
                  const m = document.cookie.match(/(?:^|; )_fbc=([^;]+)/);
                  return m ? decodeURIComponent(m[1]) : undefined;
                })()}
                gaClientId={getGaClientId() || undefined}
                onBack={handleResetCheckout}
                onSuccess={() => {
                  window.location.href = "/obrigado";
                }}
                onWeeklyBlocked={() => {
                  // Retornante tentando Semanal via Asaas cartão: fecha o form,
                  // volta ao topo pro usuário escolher um plano recorrente (Trim/Sem/Anual).
                  handleResetCheckout();
                  setBillingPeriod("monthly");
                  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
                }}
              />
            ) : (
              <>
            {/* Cabeçalho enxuto */}
            <div className="text-center mb-6">
              <h1 className="font-display text-2xl md:text-3xl font-semibold mb-2 tracking-tight">
                Comece em 2 minutos
              </h1>
              <p className="text-white/65 text-sm">
                {pixEnabled
                  ? `Pagamento único à vista no PIX • economia de ${currentDiscount}%`
                  : `7 dias por R$ ${currentPlan.trialPrice} • cancele quando quiser`}
              </p>
            </div>

            <form
              id="checkout-form"
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Toggle de período: 4 opções. Mensal = cartão com trial.
                  Trim/Sem/Anual = PIX à vista (com card só no anual). */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-2xl border border-white/10">
                {(["monthly", "quarterly", "semestral", "yearly"] as BillingPeriod[]).map((p) => {
                  const active = billingPeriod === p;
                  const discount = p === "monthly" ? 0 : getPeriodDiscount(currentPlan, p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBillingPeriod(p)}
                      className={`relative flex flex-col items-center justify-center px-2 py-2 rounded-xl text-xs font-medium transition-all ${
                        active
                          ? "bg-[hsl(140_22%_45%)] text-white shadow-md"
                          : "text-white/70 hover:text-white"
                      }`}
                    >
                      <span>{periodShortMap[p]}</span>
                      {discount > 0 && (
                        <span
                          className={`mt-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${
                            active
                              ? "bg-white/20 text-white"
                              : "bg-[hsl(35_70%_60%)] text-[hsl(220_35%_12%)]"
                          }`}
                        >
                          -{discount}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Planos slim */}
              <RadioGroup
                value={selectedPlan}
                onValueChange={(value) => setSelectedPlan(value as PlanId)}
                className="space-y-2.5"
              >
                {(Object.entries(plans) as [PlanId, PlanConfig][]).map(([id, plan]) => {
                  const price = getPeriodPrice(plan, billingPeriod);
                  const period = periodLabelMap[billingPeriod];
                  const monthlyEquiv = getPeriodMonthlyEquivalent(plan, billingPeriod);
                  const active = selectedPlan === id;
                  const isPopular = id === "direcao";

                  return (
                    <label
                      key={id}
                      className={`relative flex items-center justify-between gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                        active
                          ? "border-[hsl(140_22%_55%)] bg-[hsl(140_22%_45%/0.14)] shadow-[0_0_0_1px_hsl(140_22%_55%/0.4)]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/25"
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-2 left-4 px-2 py-0.5 bg-[hsl(140_22%_45%)] text-white text-[10px] font-semibold rounded uppercase tracking-wide">
                          Mais popular
                        </div>
                      )}
                      <div className="flex items-center gap-3 min-w-0">
                        <RadioGroupItem
                          value={id}
                          id={id}
                          className="border-white/40 text-[hsl(140_22%_55%)] shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-white">{plan.name}</p>
                          <p className="text-xs text-white/65 truncate">
                            {plan.sessions > 0
                              ? `${plan.sessions} sessões/mês + chat ilimitado`
                              : "Chat ilimitado 24/7"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {pixEnabled ? (
                          <>
                            <p className="font-display text-lg font-semibold text-[hsl(140_30%_72%)] whitespace-nowrap leading-tight">
                              R$ {price}
                            </p>
                            <p className="text-[11px] text-white/65 leading-tight">
                              {monthlyEquiv ? `≈ R$ ${monthlyEquiv}/mês` : `por ${period}`}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-display text-lg font-semibold text-[hsl(140_30%_72%)] whitespace-nowrap leading-tight">
                              R$ {plan.trialPrice}
                            </p>
                            <p className="text-[11px] text-white/65 leading-tight">
                              depois R$ {price}/{period}
                            </p>
                          </>
                        )}
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>

              {/* Formulário enxuto */}
              <div className="space-y-3 pt-2">
                <div>
                  <Label htmlFor="phone" className="text-white/80 text-sm">WhatsApp</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="(11) 99999-9999"
                    className={`${inputCls} ${errors.phone ? "border-red-400/70 focus-visible:ring-red-400/60" : ""}`}
                    maxLength={15}
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                    inputMode="numeric"
                    autoComplete="tel-national"
                  />
                  {errors.phone ? (
                    <p id="phone-error" className="text-[11px] text-red-300 mt-1">{errors.phone}</p>
                  ) : (
                    <p id="phone-hint" className="text-[11px] text-white/60 mt-1">
                      A AURA conversa com você por aqui
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="name" className="text-white/80 text-sm">Nome</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="Seu nome"
                    className={`${inputCls} ${errors.name ? "border-red-400/70 focus-visible:ring-red-400/60" : ""}`}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    autoComplete="name"
                    autoCapitalize="words"
                  />
                  {errors.name && (
                    <p id="name-error" className="text-[11px] text-red-300 mt-1">{errors.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email" className="text-white/80 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="seu@email.com"
                    className={`${inputCls} ${errors.email ? "border-red-400/70 focus-visible:ring-red-400/60" : ""}`}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  {errors.email && (
                    <p id="email-error" className="text-[11px] text-red-300 mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              {/* Resumo único acima do CTA */}
              <div className="text-center text-sm text-white/65 pt-1">
                {pixEnabled ? (
                  <>
                    À vista no PIX:{" "}
                    <span className="text-white font-semibold">R$ {currentPrice}</span>
                    {currentMonthlyEquivalent && (
                      <span className="text-white/60"> (≈ R$ {currentMonthlyEquivalent}/mês)</span>
                    )}
                  </>
                ) : (
                  <>
                    Hoje{" "}
                    <span className="text-white font-semibold">R$ {currentPlan.trialPrice}</span>
                    {" "}• depois{" "}
                    <span className="text-white/85">R$ {currentPrice}/{periodLabel}</span>
                  </>
                )}
              </div>

              {/* Mensal: cartão trial principal + PIX recorrente secundário.
                  Trim/Sem/Anual: PIX à vista principal + cartão recorrente secundário (sem trial). */}
              {billingPeriod === "monthly" ? (
                <>
                  <Button
                    type="submit"
                    variant="sage"
                    size="xl"
                    className={`w-full rounded-full transition-opacity whitespace-normal leading-tight px-4 sm:px-10 text-base sm:text-lg ${!isFormValid ? "opacity-70" : ""}`}
                    disabled={isLoading}
                    aria-disabled={!isFormValid || isLoading}
                  >
                    <CreditCard className="w-5 h-5 mr-2" />
                    {isLoading ? "Processando..." : `Começar trial por R$ ${currentPlan.trialPrice}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => handleOpenPix("subscription")}
                    className="w-full rounded-full bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white whitespace-normal leading-tight px-3 sm:px-8 text-sm sm:text-base h-auto min-h-11 py-2"
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    PIX Automático — R$ {currentPrice}/mês
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="sage"
                    size="xl"
                    onClick={() => handleOpenPix("subscription")}
                    className={`w-full rounded-full transition-opacity whitespace-normal leading-tight px-4 sm:px-10 text-base sm:text-lg h-auto min-h-14 py-3 ${!isFormValid ? "opacity-70" : ""}`}
                    aria-disabled={!isFormValid}
                  >
                    <QrCode className="w-5 h-5 mr-2" />
                    PIX Automático — R$ {currentPrice}/{periodLabel}
                  </Button>
                  <Button
                    type="submit"
                    variant="outline"
                    size="lg"
                    disabled={isLoading}
                    className="w-full rounded-full bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white whitespace-normal leading-tight px-3 sm:px-8 text-sm sm:text-base h-auto min-h-11 py-2"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {isLoading ? "Processando..." : `Cartão — R$ ${currentPrice}/${periodLabel}`}
                  </Button>
                </>
              )}

              <p className="text-center text-[11px] text-white/50 -mt-2">
                {billingPeriod === "monthly"
                  ? "7 dias completos • Sem cobrança se cancelar antes do 8º dia"
                  : "Autorize 1x no app do banco • renovação automática • cancele quando quiser"}
              </p>

              {/* Faixa única de confiança */}
              <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/55 pt-1">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                  Garantia 7 dias
                </div>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                  Pagamento Stripe
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-[hsl(140_30%_72%)]" />
                  Cancele quando quiser
                </div>
              </div>

              {/* Mini-depoimento */}
              <p className="text-center text-xs text-white/55 italic max-w-md mx-auto pt-2">
                "Em 3 dias senti que alguém finalmente me ouvia." — Ana C.
              </p>
            </form>

              </>
            )}
          </div>
        </div>

        {/* Exit-intent popup */}
        {showExitPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setShowExitPopup(false)}
          >
            <div
              className="bg-[hsl(220_35%_12%)] rounded-2xl p-8 max-w-md w-full shadow-2xl border border-white/10 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center">
                <Gift className="w-10 h-10 text-[hsl(140_30%_72%)]" />
              </div>
              <h2 className="font-display text-xl font-semibold text-white">Espera!</h2>
              <p className="text-white/70 text-sm leading-relaxed">
                Sua oferta de trial ainda está ativa:{" "}
                <span className="font-semibold text-[hsl(140_30%_72%)]">
                  7 dias por apenas R$ {currentPlan.trialPrice}
                </span>{" "}
                (plano {currentPlan.name})
              </p>
              <ul className="space-y-2 text-sm text-white/70 text-left mx-auto max-w-xs">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)] flex-shrink-0" />
                  Garantia de satisfação
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)] flex-shrink-0" />
                  Cancele quando quiser
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(140_30%_72%)] flex-shrink-0" />
                  +5.000 pessoas já começaram
                </li>
              </ul>
              <Button
                variant="sage"
                size="lg"
                className="w-full rounded-full"
                onClick={() => {
                  setShowExitPopup(false);
                  trackExitIntent("convert");
                  document.getElementById("checkout-form")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Quero experimentar por R$ {currentPlan.trialPrice}
              </Button>
            </div>
          </div>
        )}

        {/* Modal PIX: form de CPF → QR code + copia-e-cola */}
        <Dialog open={pixOpen} onOpenChange={(open) => {
          setPixOpen(open);
          if (!open) {
            // ao fechar, reseta pra começar limpo na próxima abertura
            setTimeout(() => {
              setPixStage("form");
              setPixData(null);
              setCpfError(undefined);
            }, 200);
          }
        }}>
          <DialogContent className="bg-[hsl(220_35%_12%)] border-white/10 text-white max-w-md">
            {pixStage === "form" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-xl text-white">
                    Pagar com PIX
                  </DialogTitle>
                  <DialogDescription className="text-white/65">
                    Plano <span className="text-white font-medium">{currentPlan.name}</span> · {periodShortMap[billingPeriod]} —{" "}
                    <span className="text-[hsl(140_30%_72%)] font-semibold">R$ {currentPrice}</span> à vista
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="cpf" className="text-white/80 text-sm">CPF</Label>
                    <Input
                      id="cpf"
                      type="text"
                      value={cpf}
                      onChange={(e) => {
                        setCpf(formatCpf(e.target.value));
                        if (cpfError) setCpfError(undefined);
                      }}
                      placeholder="000.000.000-00"
                      className={`${inputCls} ${cpfError ? "border-red-400/70 focus-visible:ring-red-400/60" : ""}`}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                    />
                    {cpfError ? (
                      <p className="text-[11px] text-red-300 mt-1">{cpfError}</p>
                    ) : (
                      <p className="text-[11px] text-white/55 mt-1">
                        Obrigatório pra emissão da cobrança PIX no banco.
                      </p>
                    )}
                  </div>

                  <Button
                    variant="sage"
                    size="lg"
                    className="w-full rounded-full"
                    onClick={handleGeneratePix}
                    disabled={pixLoading}
                  >
                    {pixLoading ? "Gerando PIX..." : `Gerar PIX — R$ ${currentPrice}`}
                  </Button>

                  <p className="text-[11px] text-white/55 text-center">
                    Liberação automática assim que o pagamento for confirmado.
                  </p>
                </div>
              </>
            ) : pixData ? (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-xl text-white">
                    Escaneie ou copie o código
                  </DialogTitle>
                  <DialogDescription className="text-white/65">
                    <span className="text-[hsl(140_30%_72%)] font-semibold">
                      R$ {pixData.amount.toFixed(2).replace(".", ",")}
                    </span>
                    {" "}· {currentPlan.name} {periodShortMap[billingPeriod]}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  <div className="bg-white rounded-xl p-4 flex justify-center">
                    <img
                      src={`data:image/png;base64,${pixData.qrImage}`}
                      alt="QR Code PIX"
                      className="w-56 h-56"
                    />
                  </div>

                  <div>
                    <Label className="text-white/80 text-sm">Código copia-e-cola</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        readOnly
                        value={pixData.copyPaste}
                        className={`${inputCls} text-xs font-mono`}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopyPix}
                        className="bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white shrink-0"
                        title="Copiar código"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white/70 space-y-1.5">
                    <p>1. Abra o app do seu banco e escolha pagar com PIX.</p>
                    <p>2. Escaneie o QR Code ou cole o código copia-e-cola.</p>
                    <p>3. Confirme o pagamento — você recebe a confirmação no WhatsApp em segundos.</p>
                  </div>

                  {pixMode === "subscription" && (
                    <div className="bg-[hsl(35_70%_60%)]/15 border border-[hsl(35_70%_60%)]/40 rounded-xl p-3 text-xs space-y-2">
                      <p className="font-semibold text-[hsl(35_70%_75%)]">
                        ⚠️ Ação obrigatória no app do banco
                      </p>
                      <p className="text-white/80">
                        Ao confirmar o pagamento, <strong>marque "Autorizar Pix Automático"</strong>. Sem isso, a assinatura não será ativada.
                      </p>
                    </div>
                  )}

                  <Button
                    variant="sage"
                    size="lg"
                    className="w-full rounded-full"
                    onClick={handleCopyPix}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar código PIX
                  </Button>

                  {pixData.invoiceUrl && (
                    <a
                      href={pixData.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-center text-xs text-white/60 hover:text-white underline"
                    >
                      Ver fatura em nova aba
                    </a>
                  )}
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default CheckoutV2;
