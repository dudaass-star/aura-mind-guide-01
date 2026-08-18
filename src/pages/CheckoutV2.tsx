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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, CreditCard, Check, Shield, Lock, Gift, QrCode, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackExitIntent,
  getGaClientId,
  trackReturningCustomerMonthly,
} from "@/lib/ga4";
import { getExternalId, setAdvancedMatching, trackMetaViewContent } from "@/lib/meta-pixel";
import { oaiqCheckoutStarted } from "@/lib/openai-pixel";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import "@/styles/v2-theme.css";
import "@/styles/checkout-theme.css";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { logFunnel } from "@/lib/checkout-funnel";
import { AsaasCardForm } from "@/components/checkout/AsaasCardForm";
import { CycleTabs, type CycleTabItem } from "@/components/checkout/CycleTabs";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { TrustRow } from "@/components/checkout/TrustRow";
import { StickyMobileCta } from "@/components/checkout/StickyMobileCta";
import { PaymentMethodToggle, type PayMethod } from "@/components/checkout/PaymentMethodToggle";
import { CheckoutObjections } from "@/components/checkout/CheckoutObjections";

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
    yearlyPrice: "118,80",
    yearlyMonthlyEquivalent: "9,90",
    yearlyDiscount: 67,
    quarterlyPrice: "59,70",
    quarterlyMonthlyEquivalent: "19,90",
    quarterlyDiscount: 33,
    semestralPrice: "89,40",
    semestralMonthlyEquivalent: "14,90",
    semestralDiscount: 50,
    trialPrice: "6,90",
    sessions: 1,
    highlights: ["Conversas ilimitadas 24/7", "1 Sessão Especial/mês", "Check-in diário"],
  },
  direcao: {
    name: "Direção",
    monthlyPrice: "49,90",
    yearlyPrice: "202,80",
    yearlyMonthlyEquivalent: "16,90",
    yearlyDiscount: 66,
    quarterlyPrice: "101,70",
    quarterlyMonthlyEquivalent: "33,90",
    quarterlyDiscount: 32,
    semestralPrice: "149,40",
    semestralMonthlyEquivalent: "24,90",
    semestralDiscount: 50,
    trialPrice: "9,90",
    sessions: 4,
    highlights: ["Tudo do Essencial", "4 Sessões Especiais/mês", "Resumo após cada sessão"],
  },
  transformacao: {
    name: "Transformação",
    monthlyPrice: "79,90",
    yearlyPrice: "322,80",
    yearlyMonthlyEquivalent: "26,90",
    yearlyDiscount: 66,
    quarterlyPrice: "161,70",
    quarterlyMonthlyEquivalent: "53,90",
    quarterlyDiscount: 32,
    semestralPrice: "239,40",
    semestralMonthlyEquivalent: "39,90",
    semestralDiscount: 50,
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
const periodFullMap: Record<BillingPeriod, string> = {
  monthly: "Plano mensal",
  quarterly: "Plano trimestral",
  semestral: "Plano semestral",
  yearly: "Plano anual",
};
// Meses cobrados em cada ciclo — base do cálculo de economia em reais.
const periodMonthsMap: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semestral: 6,
  yearly: 12,
};
/** "118,80" → 118.8 */
const parseBRL = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

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

  const initialPlan = planFromUrl || planFromState || "essencial";
  const initialBilling = billingFromUrl || billingFromState || "monthly";

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBilling);
  // Meio de pagamento escolhido explicitamente (um CTA só, sem preços concorrentes).
  // PIX é o hábito dominante no Brasil: entra pré-selecionado em todos os ciclos.
  const [payMethod, setPayMethod] = useState<PayMethod>("pix");
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
  // Saúde do trilho de PIX recorrente, gravada pela função asaas-health-check.
  // Começa `false` de propósito: se a leitura falhar, o padrão é NÃO oferecer PIX.
  // Oferecer PIX com o trilho fora do ar gera um QR que nunca nasce — o cliente
  // acha que pagou e a venda morre em silêncio.
  const [pixRailUp, setPixRailUp] = useState(false);
  // Enquanto a config não chega, "PIX escondido" é só o estado inicial — não é
  // trilho fora do ar. Sem isso o funil registrava rail_down em todo acesso.
  const [railConfigLoaded, setRailConfigLoaded] = useState(false);
  // Banco que executa o PIX Automático (Bacen). Trocado por system_config.pix_gateway.
  const [pixGateway, setPixGateway] = useState<"asaas" | "inter" | "woovi">("asaas");

  // PIX (Asaas): só aparece pra trim/sem/anual. Modal abre com form de CPF
  // (resto dos dados reusa name/email/phone do form principal) e troca pra
  // tela de QR depois que a edge function retorna.
  const [pixOpen, setPixOpen] = useState(false);
  // Marca se o código foi copiado nessa abertura do modal — usado para
  // qualificar o abandono do PIX (fechou sem copiar vs copiou e não pagou).
  const pixCopiedRef = useRef(false);
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
    authorizationId?: string | null;
    trial?: boolean;
    recurringAmount?: number | null;
    firstRecurringChargeDate?: string | null;
    // Trilho Inter na semana grátis: o QR só autoriza o débito, não cobra hoje.
    authorizationOnly?: boolean;
  } | null>(null);
  // Estado do consentimento de PIX Automático (Bacen): pending → active | expired.
  // O consentimento é a etapa que mais perdemos: o cliente paga/escaneia mas não
  // marca a autorização de cobrança automática no app do banco.
  const [authState, setAuthState] = useState<"pending" | "active" | "expired" | null>(null);
  // Autorização retomada de uma visita anterior (cliente fechou o modal do QR e
  // autorizou no banco depois). Guardamos o id no navegador por 24h.
  const [resumedAuthId, setResumedAuthId] = useState<string | null>(null);
  const [resumedState, setResumedState] = useState<"pending" | "active" | "expired" | null>(null);
  const [resumedPlan, setResumedPlan] = useState<string | null>(null);

  // ViewContent + GA4 begin_checkout no mount.
  // O ViewContent passa pelo helper único (navegador + CAPI com o mesmo
  // event_id) e vai SEM `value`: preço só em InitiateCheckout/Purchase/Subscribe,
  // senão o Meta enxerga sempre o mesmo valor e reclama ("envie mais preços").
  useEffect(() => {
    const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
    trackMetaViewContent({
      content_name: "Checkout Page V2",
      content_category: "checkout",
    });
    trackBeginCheckout({ plan: selectedPlan, value: trialPriceMap[selectedPlan] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca gateway de cartão ativo (só afeta rota do cartão, não do PIX) e a
  // saúde do trilho de PIX. Uma leitura só, dois usos.
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("system_config")
        .select("key, value")
        .in("key", ["card_gateway", "pix_rail_status", "pix_gateway"]);

      const parse = (raw: unknown): unknown => {
        // JSONB pode voltar como string pura ("asaas") ou como JSON string ('"asaas"').
        if (typeof raw === "string") {
          try { return JSON.parse(raw); } catch { return raw; }
        }
        return raw;
      };

      const data = rows?.find((r) => r.key === "card_gateway");
      if (data?.value !== undefined && data?.value !== null) {
        const v = parse(data.value);
        if (v === "asaas" || v === "stripe") setCardGateway(v);
      }

      // Qual banco atende o PIX Automático hoje (system_config.pix_gateway).
      const rail = rows?.find((r) => r.key === "pix_gateway");
      const parsedRail = rail ? parse(rail.value) : null;
      const activeRail =
        parsedRail === "inter" || parsedRail === "asaas" || parsedRail === "woovi" ? parsedRail : null;
      if (activeRail) setPixGateway(activeRail);

      // Saúde só vale se for do trilho que está em uso. Um status antigo de
      // outro gateway (ex.: Asaas com 401) não pode derrubar o trilho atual.
      const health = rows?.find((r) => r.key === "pix_rail_status");
      const parsedHealth = health
        ? (parse(health.value) as { healthy?: boolean; gateway?: string } | null)
        : null;
      const healthMatchesRail =
        !parsedHealth?.gateway || !activeRail || parsedHealth.gateway === activeRail;
      setPixRailUp(parsedHealth?.healthy === true && healthMatchesRail);
      setRailConfigLoaded(true);
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

  // PIX é o padrão em qualquer ciclo (à vista nos longos, PIX Automático no
  // mensal) — desde que exista trilho de PIX no ar. Sem trilho, só cartão.
  useEffect(() => {
    setPayMethod(pixRailUp ? "pix" : "card");
  }, [billingPeriod, pixRailUp]);

  // Registra uma vez, por sessão de checkout, que o PIX foi escondido. É esse
  // número que diz quanto custa o trilho estar fora do ar.
  const railDownLogged = useRef(false);
  useEffect(() => {
    if (!railConfigLoaded || pixRailUp || railDownLogged.current) return;
    railDownLogged.current = true;
    logFunnel("pix_rail_down", { plan: selectedPlan, billing: billingPeriod, paymentMethod: "card" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixRailUp, railConfigLoaded]);

  // Abas de ciclo com preço/mês, total do ciclo e economia em reais (do plano selecionado).
  const cycleItems: CycleTabItem[] = useMemo(
    () =>
      (["monthly", "quarterly", "semestral", "yearly"] as BillingPeriod[]).map((p) => {
        const total = getPeriodPrice(currentPlan, p);
        const monthlyEquiv = getPeriodMonthlyEquivalent(currentPlan, p) || currentPlan.monthlyPrice;
        const months = periodMonthsMap[p];
        const savings =
          p === "monthly" ? 0 : parseBRL(currentPlan.monthlyPrice) * months - parseBRL(total);
        return {
          id: p,
          label: periodShortMap[p],
          monthlyEquivalent: monthlyEquiv,
          total,
          periodLabel: periodLabelMap[p],
          discount: p === "monthly" ? 0 : getPeriodDiscount(currentPlan, p),
          savings: savings > 0 ? savings : 0,
        };
      }),
    [currentPlan],
  );

  // Mensal tem 1ª semana promocional nos DOIS meios (cartão Stripe e PIX
  // Automático Bacen): o valor de hoje é o trial e o débito cheio vem no 8º dia.
  const todayAmount = pixEnabled ? currentPrice : currentPlan.trialPrice;
  const nextChargeLabel = pixEnabled
    ? `Renova automaticamente em R$ ${currentPrice}/${periodLabel}. Cancele quando quiser.`
    : payMethod === "pix"
      ? `Depois R$ ${currentPrice}/mês no débito automático, a partir do 8º dia. Cancele quando quiser.`
      : `Depois R$ ${currentPrice}/mês, a partir do 8º dia. Cancele antes e não paga nada.`;
  const summaryBenefits = useMemo(
    () => [
      ...currentPlan.highlights,
      currentPlan.sessions > 0
        ? `Custo por sessão: R$ ${(
            parseBRL(getPeriodMonthlyEquivalent(currentPlan, billingPeriod) || currentPlan.monthlyPrice) /
            currentPlan.sessions
          ).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "Memória de longo prazo das suas conversas",
    ],
    [currentPlan, billingPeriod],
  );

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

  // ============================================================
  // VELOCIDADE DO CARTÃO
  // O gargalo antigo: só depois do clique é que (1) a edge function acordava,
  // (2) o js.stripe.com começava a baixar e (3) o iframe montava — tudo em fila.
  // Agora: aquecemos a função + carregamos o js.stripe.com no primeiro toque no
  // formulário e pré-criamos a sessão de pagamento enquanto o usuário digita.
  // ============================================================
  const warmedUpRef = useRef(false);
  const prewarmRef = useRef<{
    key: string;
    clientSecret: string;
    sessionId: string | null;
    returning: boolean;
  } | null>(null);
  const prewarmInFlightRef = useRef<string | null>(null);

  /** Chave que identifica a sessão pré-criada. Se qualquer dado muda, descartamos. */
  const prewarmKey = useMemo(
    () =>
      [selectedPlan, billingPeriod, name.trim().toLowerCase(), email.trim().toLowerCase(), phoneDigits].join(
        "|",
      ),
    [selectedPlan, billingPeriod, name, email, phoneDigits],
  );

  /** Aquece a edge function e começa a baixar o js.stripe.com com a chave pública. */
  const warmUp = useCallback(async () => {
    if (warmedUpRef.current) return;
    warmedUpRef.current = true;
    const t0 = Date.now();
    try {
      const { data } = await supabase.functions.invoke("create-checkout", {
        body: { warmup: true },
      });
      const pk = (data as any)?.publishableKey as string | undefined;
      if (pk) {
        setStripePromise((prev) => prev ?? loadStripe(pk));
        logFunnel("warmup", {
          plan: selectedPlan,
          billing: billingPeriod,
          paymentMethod: "card",
          meta: { ms: Date.now() - t0 },
        });
      }
    } catch {
      /* aquecimento é best-effort: o fluxo normal continua funcionando */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan, billingPeriod]);

  // Pré-cria a sessão de pagamento quando os 3 campos já estão válidos.
  // A sessão só vira cobrança quando o cliente confirma o pagamento, então
  // pré-criar é seguro — e economiza todo o tempo de espera após o clique.
  useEffect(() => {
    if (cardGateway !== "stripe" || payMethod !== "card") return;
    if (!isFormValid || hasRedirected || embeddedClientSecret) return;
    if (prewarmRef.current?.key === prewarmKey) return;
    if (prewarmInFlightRef.current === prewarmKey) return;

    const timer = window.setTimeout(async () => {
      prewarmInFlightRef.current = prewarmKey;
      const t0 = Date.now();
      try {
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: {
            plan: selectedPlan,
            billing: billingPeriod,
            trial: billingPeriod === "monthly",
            paymentMethod: "card",
            embedded: true,
            prewarm: true,
            name: name.trim(),
            email: email.trim(),
            phone,
          },
        });
        if (!error && (data as any)?.clientSecret) {
          prewarmRef.current = {
            key: prewarmKey,
            clientSecret: (data as any).clientSecret,
            sessionId: (data as any).sessionId || null,
            returning: !!(data as any).returning_customer,
          };
          if ((data as any).publishableKey) {
            setStripePromise((prev) => prev ?? loadStripe((data as any).publishableKey));
          }
          logFunnel("prewarm_session", {
            plan: selectedPlan,
            billing: billingPeriod,
            paymentMethod: "card",
            meta: { ms: Date.now() - t0, serverMs: (data as any)?.serverMs ?? null },
          });
        }
      } catch {
        /* silencioso: o clique refaz a chamada normalmente */
      } finally {
        prewarmInFlightRef.current = null;
      }
    }, 700);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prewarmKey, isFormValid, cardGateway, payMethod, hasRedirected, embeddedClientSecret]);

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
      logFunnel("form_invalid", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: "card",
        detail: Object.keys(nextErrors).join(","),
      });
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
    logFunnel("form_submit", {
      plan: selectedPlan,
      billing: billingPeriod,
      paymentMethod: "card",
      meta: { gateway: cardGateway },
    });

    try {
      // Se o admin roteou cartão para o Asaas, mostra o AsaasCardForm em vez
      // de disparar o create-checkout do Stripe. Toda a validação/erros dos
      // 3 campos comuns já rodou acima.
      if (cardGateway === "asaas") {
        setAsaasCardOpen(true);
        logFunnel("asaas_card_open", { plan: selectedPlan, billing: billingPeriod, paymentMethod: "card" });
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

      // Fonte única de verdade do início de checkout (Meta pixel + CAPI, GA4 e
      // ChatGPT Ads). Qualquer método novo TEM que chamar esta função.
      fireCheckoutStartTracking("card");

      const gaClientId = getGaClientId();

      const isMonthlyTrial = billingPeriod === "monthly";

      // Sessão pré-criada enquanto o usuário digitava? Então o campo de cartão
      // aparece imediatamente, sem round-trip nenhum após o clique.
      const pre = prewarmRef.current?.key === prewarmKey ? prewarmRef.current : null;
      let clientSecret: string | null = pre?.clientSecret ?? null;
      let publishableKey: string | null = null;
      let outSessionId: string | null = pre?.sessionId ?? null;
      let isReturning = pre?.returning ?? false;
      let serverMs: number | null = null;

      if (pre) {
        logFunnel("prewarm_hit", { plan: selectedPlan, billing: billingPeriod, paymentMethod: "card" });
      } else {
        const t0 = Date.now();
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

        if (error) {
          logFunnel("create_checkout_error", {
            plan: selectedPlan,
            billing: billingPeriod,
            paymentMethod: "card",
            detail: (data as any)?.error || error.message,
          });
          // Já existe assinatura viva (ativa, em teste ou com pagamento pendente):
          // em vez de deixar o lead assinar de novo e ser cobrado duas vezes,
          // mandamos pro espaço dele pra atualizar a forma de pagamento.
          const dupCode = (data as any)?.code as string | undefined;
          if (dupCode === "SUBSCRIPTION_PAST_DUE" || dupCode === "ACTIVE_SUBSCRIPTION_EXISTS") {
            toast.error(
              (data as any)?.error ||
                "Você já tem uma assinatura da AURA. Acesse seu espaço para gerenciar o pagamento.",
              { duration: 9000 },
            );
            logFunnel("duplicate_subscription_blocked", {
              plan: selectedPlan,
              billing: billingPeriod,
              paymentMethod: "card",
              detail: dupCode,
            });
            setIsLoading(false);
            return;
          }
          throw new Error((data as any)?.error || error.message || "Erro ao processar pagamento");
        }
        clientSecret = (data as any)?.clientSecret ?? null;
        publishableKey = (data as any)?.publishableKey ?? null;
        outSessionId = (data as any)?.sessionId ?? null;
        isReturning = !!(data as any)?.returning_customer;
        serverMs = (data as any)?.serverMs ?? Date.now() - t0;
      }

      // Backend rebaixou Semanal → Mensal recorrente pra cliente retornante.
      // O Embedded Checkout já vem com o preço/custom_text corretos; só instrumentamos.
      if (isReturning) {
        trackReturningCustomerMonthly("stripe");
      }

      if (clientSecret && (publishableKey || stripePromise)) {
        // Persistimos os dados pra resgate caso o usuário recarregue durante o pagamento.
        localStorage.setItem(
          "aura_checkout",
          JSON.stringify({
            name,
            phone,
            plan: selectedPlan,
            billing: billingPeriod,
            price: currentPrice,
            returningCustomerMonthly: isReturning,
          }),
        );
        setHasRedirected(true);
        if (publishableKey) setStripePromise((prev) => prev ?? loadStripe(publishableKey as string));
        setEmbeddedClientSecret(clientSecret);
        logFunnel("embedded_requested", {
          plan: selectedPlan,
          billing: billingPeriod,
          paymentMethod: "card",
          meta: { sessionId: outSessionId, serverMs, prewarmed: !!pre },
        });
        // Vai pro topo da página: a PaymentView substitui o form e o widget
        // Stripe fica logo abaixo do header — visível na dobra mobile.
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      } else {
        logFunnel("create_checkout_error", {
          plan: selectedPlan,
          billing: billingPeriod,
          paymentMethod: "card",
          detail: "clientSecret ausente",
        });
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

  // ---- Saúde do widget embedado (Stripe) ----
  // Registro de entrada no checkout (base do funil).
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    logFunnel("page_view", {
      plan: initialPlan,
      billing: initialBilling,
      // `src` vem dos CTAs da landing (?src=hero|pricing|sticky|final|header|demo):
      // permite ligar a posição do clique à conversão real.
      // `lp` separa métricas da landing V2 (padrão) vs V3 (bem-estar).
      meta: {
        src: searchParams.get("src") ?? null,
        lp: searchParams.get("lp") ?? "v2",
      },
    });
    // Baixa o js.stripe.com desde já (o loadStripe reaproveita esta tag) e
    // aquece a edge function — quando o usuário clicar, não sobra latência.
    try {
      if (!document.querySelector('script[src^="https://js.stripe.com/v3"]')) {
        const preload = document.createElement("link");
        preload.rel = "preload";
        preload.as = "script";
        preload.href = "https://js.stripe.com/v3";
        document.head.appendChild(preload);
      }
    } catch {
      /* noop */
    }
    const t = window.setTimeout(() => void warmUp(), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se o iframe não montar em 6s (rede ruim, bloqueio de terceiros, mobile lento),
  // caímos automaticamente no Checkout hospedado da Stripe em vez de deixar o
  // usuário olhando um skeleton infinito.
  const embeddedHostRef = useRef<HTMLDivElement | null>(null);
  const [embeddedMounted, setEmbeddedMounted] = useState(false);
  const [embeddedFallbackLoading, setEmbeddedFallbackLoading] = useState(false);

  const goToHostedCheckout = useCallback(
    async (reason: string) => {
      setEmbeddedFallbackLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: {
            plan: selectedPlan,
            billing: billingPeriod,
            trial: billingPeriod === "monthly",
            paymentMethod: "card",
            embedded: false,
            fallback: true,
            name: name.trim(),
            email: email.trim(),
            phone,
          },
        });
        if (error || !data?.url) {
          throw new Error((data as any)?.error || error?.message || "Fallback indisponível");
        }
        logFunnel("embedded_fallback_redirect", {
          plan: selectedPlan,
          billing: billingPeriod,
          paymentMethod: "card",
          detail: reason,
        });
        window.location.href = data.url as string;
      } catch (err) {
        logFunnel("embedded_fallback_error", {
          plan: selectedPlan,
          billing: billingPeriod,
          paymentMethod: "card",
          detail: err instanceof Error ? err.message : String(err),
        });
        toast.error("Não conseguimos abrir o pagamento. Tente novamente ou pague via PIX.");
      } finally {
        setEmbeddedFallbackLoading(false);
      }
    },
    [selectedPlan, billingPeriod, name, email, phone],
  );

  useEffect(() => {
    if (!embeddedClientSecret) {
      setEmbeddedMounted(false);
      return;
    }
    let done = false;
    const started = Date.now();
    const poll = window.setInterval(() => {
      const iframe = embeddedHostRef.current?.querySelector("iframe");
      if (iframe) {
        done = true;
        window.clearInterval(poll);
        setEmbeddedMounted(true);
        logFunnel("embedded_mounted", {
          plan: selectedPlan,
          billing: billingPeriod,
          paymentMethod: "card",
          meta: { ms: Date.now() - started },
        });
        return;
      }
      if (Date.now() - started > 6000) {
        window.clearInterval(poll);
        if (!done) {
          logFunnel("embedded_timeout", {
            plan: selectedPlan,
            billing: billingPeriod,
            paymentMethod: "card",
            meta: { ms: Date.now() - started },
          });
          void goToHostedCheckout("embedded_timeout");
        }
      }
    }, 200);
    return () => window.clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedClientSecret]);

  const handleResetCheckout = useCallback(() => {
    // Voltar pra editar dados com o widget do Stripe já montado = abandono do
    // formulário de cartão. Sem isso, o funil perdia essas pessoas em silêncio.
    if (embeddedClientSecret) {
      logFunnel("card_abandoned", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: "card",
        detail: embeddedMounted ? "voltou_editar_dados" : "voltou_antes_montar",
      });
    }
    setEmbeddedClientSecret(null);
    setStripePromise(null);
    setAsaasCardOpen(false);
    setHasRedirected(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedClientSecret, embeddedMounted, selectedPlan, billingPeriod]);

  // Saiu da página com o formulário de cartão aberto e sem pagar.
  useEffect(() => {
    if (!embeddedClientSecret) return;
    const onLeave = () => {
      logFunnel("card_abandoned", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: "card",
        detail: "saiu_da_pagina",
      });
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedClientSecret]);

  // Dispara os eventos de início de checkout (Meta pixel + CAPI e ChatGPT Ads).
  // REGRA: TODA forma de pagamento tem que passar por aqui. Se um método novo
  // não chamar esta função, o Meta fica cego pro início de checkout daquele
  // trilho (foi exatamente o furo do PIX em ago/2026).
  const startTrackedRef = useRef<string | null>(null);
  const fireCheckoutStartTracking = (methodLabel: string) => {
    // Um disparo por combinação plano+ciclo+método (evita duplicar em reclique).
    const key = `${selectedPlan}_${billingPeriod}_${methodLabel}`;
    if (startTrackedRef.current === key) return;
    startTrackedRef.current = key;

    const trialPriceMap: Record<string, number> = { essencial: 6.9, direcao: 9.9, transformacao: 19.9 };
    const value = trialPriceMap[selectedPlan];
    const getCookie = (n: string) => {
      const m = document.cookie.match(new RegExp("(^| )" + n + "=([^;]+)"));
      return m ? m[2] : undefined;
    };
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    const fbp = getCookie("_fbp");
    const fbc = getCookie("_fbc") || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);

    // Só InitiateCheckout: o Lead duplicava o mesmo clique e inflava os números
    // do Gerenciador de Eventos (mesma ação contada em dois eventos distintos).
    const icEventId = `ic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const customData = {
      content_name: `Trial ${plans[selectedPlan].name}`,
      content_category: "checkout",
      value,
      currency: "BRL",
    };

    try {
      if (typeof window !== "undefined" && (window as any).fbq) {
        setAdvancedMatching({
          email: email.trim(),
          phone: phone.replace(/\D/g, ""),
          firstName: name.trim().split(" ")[0],
        });
        (window as any).fbq("track", "InitiateCheckout", customData, { eventID: icEventId });
      }

      const capiPayload = {
        event_source_url: window.location.href,
        user_data: {
          email: email.trim(),
          phone: phone.replace(/\D/g, ""),
          first_name: name.trim().split(" ")[0],
          // Dois identificadores: o telefone normalizado (que os webhooks de
          // pagamento também derivam) e o id de 1ª parte do navegador. Isso
          // costura o InitiateCheckout com o Purchase do servidor.
          external_id: [phone.replace(/\D/g, ""), getExternalId()].filter(Boolean),
          client_user_agent: navigator.userAgent,
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
        },
        custom_data: customData,
      };
      void supabase.functions
        .invoke("meta-capi", {
          body: { ...capiPayload, event_name: "InitiateCheckout", event_id: icEventId },
        })
        .catch(() => {});

      trackAddPaymentInfo({ plan: selectedPlan, billing: billingPeriod, value });
      oaiqCheckoutStarted({
        amount: Math.round(value * 100),
        currency: "BRL",
        content_name: `Trial ${plans[selectedPlan].name}`,
      });
    } catch {
      // Tracking nunca bloqueia o pagamento.
    }
  };

  // Abre o modal PIX. Valida os 3 campos comuns antes (mesma regra do CTA cartão).
  // `mode` define se vamos chamar a edge one-time ou a de subscription.
  const handleOpenPix = (mode: "one-time" | "subscription" = "one-time") => {
    // Guarda final: mesmo que a UI escape, nunca abrir o modal de PIX com o
    // trilho fora do ar. Cai pro cartão em vez de gerar QR que não nasce.
    if (!pixRailUp) {
      setPayMethod("card");
      logFunnel("pix_blocked_rail_down", { plan: selectedPlan, billing: billingPeriod, paymentMethod: "pix" });
      return;
    }
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
    setAuthState(null);
    setCpfError(undefined);
    setPixOpen(true);
    logFunnel("pix_modal_open", {
      plan: selectedPlan,
      billing: billingPeriod,
      paymentMethod: mode === "subscription" ? "pix_auto" : "pix",
    });
    // Paridade com o cartão: o Meta precisa ver o início de checkout do PIX.
    fireCheckoutStartTracking(mode === "subscription" ? "pix_auto" : "pix");
  };

  // Gera a cobrança PIX no Asaas e troca o modal pra tela de QR.
  const handleGeneratePix = async () => {
    if (!isValidCpf(cpf)) {
      setCpfError("CPF inválido. Confira os 11 dígitos.");
      return;
    }
    setCpfError(undefined);
    setPixLoading(true);
    logFunnel("pix_qr_requested", {
      plan: selectedPlan,
      billing: billingPeriod,
      paymentMethod: pixMode === "subscription" ? "pix_auto" : "pix",
    });
    try {
      const requestStorageKey = `aura_pix_request_${selectedPlan}_${billingPeriod}_${email.trim().toLowerCase()}`;
      let pixRequestKey = sessionStorage.getItem(requestStorageKey);
      if (!pixRequestKey) {
        pixRequestKey = crypto.randomUUID();
        sessionStorage.setItem(requestStorageKey, pixRequestKey);
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
      const gaClientId = getGaClientId();
      // Recorrente (PIX Automático) vai pro banco ativo; avulso segue no Asaas.
      const edgeName = pixMode === "subscription"
        ? (pixGateway === "woovi"
            ? "criar-pix-recorrente-woovi"
            : pixGateway === "inter"
              ? "criar-pix-recorrente-inter"
              : "criar-pix-recorrente-asaas")
        : "criar-pix-asaas";
      const { data, error } = await supabase.functions.invoke(edgeName, {
        body: {
          plan: selectedPlan,
          billing: billingPeriod,
          name: name.trim(),
          email: email.trim(),
          phone: phone.replace(/\D/g, ""),
          cpf: cpf.replace(/\D/g, ""),
          // Trial semanal também no PIX Automático (só mensal; o backend nega
          // pra retornante e cai no valor cheio sozinho).
          ...(pixMode === "subscription" && billingPeriod === "monthly" ? { trial: true } : {}),
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(gaClientId && { gaClientId }),
           // Idempotência de clique: Inter e Woovi reaproveitam o mandato já criado.
           ...(pixMode === "subscription" && (pixGateway === "inter" || pixGateway === "woovi")
             ? { requestKey: pixRequestKey }
             : {}),
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
        authorizationId: data.authorizationId || null,
        trial: !!data.trial,
        recurringAmount: data.recurringAmount ?? null,
        firstRecurringChargeDate: data.firstRecurringChargeDate ?? null,
        authorizationOnly: !!data.authorizationOnly,
      });
      setAuthState(pixMode === "subscription" && data.authorizationId ? "pending" : null);
      setPixStage("qr");
      if (pixMode === "subscription" && pixGateway === "inter") {
        sessionStorage.setItem(requestStorageKey, pixRequestKey);
      }
      trackAddPaymentInfo({ plan: selectedPlan, billing: billingPeriod, value: data.amount || 0 });
      logFunnel("pix_qr_generated", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: pixMode === "subscription" ? "pix_auto" : "pix",
        meta: { amount: data.amount || 0, authorizationId: data.authorizationId || null },
      });
    } catch (err) {
      console.error("PIX V2 error:", err);
      logFunnel("pix_qr_error", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: pixMode === "subscription" ? "pix_auto" : "pix",
        detail: err instanceof Error ? err.message : String(err),
      });
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PIX. Tente novamente.");
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pixData?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(pixData.copyPaste);
      pixCopiedRef.current = true;
      toast.success("Código PIX copiado!");
      logFunnel("pix_copy", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: pixMode === "subscription" ? "pix_auto" : "pix",
      });
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  // ---- Retomada da autorização PIX Automático ----
  // O consentimento acontece no app do banco, fora da nossa tela. Se o cliente
  // fecha o modal e autoriza depois, sem isso ele nunca vê a confirmação.
  const PIX_AUTH_LS_KEY = "aura_pix_auth_v1";
  const PIX_AUTH_TTL_MS = 24 * 60 * 60 * 1000;

  // Guarda o id da autorização recém-criada.
  useEffect(() => {
    const authId = pixData?.authorizationId;
    if (!authId) return;
    // A retomada só existe no trilho Asaas: o id salvo é consultado em
    // `asaas-pix-auto-status`. Guardar id de outro gateway gera 400 na volta.
    if (pixGateway !== "asaas") return;
    try {
      localStorage.setItem(
        PIX_AUTH_LS_KEY,
        JSON.stringify({ id: authId, plan: selectedPlan, ts: Date.now() }),
      );
    } catch {
      // navegador sem storage: retomada simplesmente não acontece
    }
  }, [pixData?.authorizationId, selectedPlan, pixGateway]);

  // Na montagem: se houver autorização recente, consulta o estado uma vez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: { id?: string; plan?: string; ts?: number } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(PIX_AUTH_LS_KEY) || "null");
      } catch {
        saved = null;
      }
      if (!saved?.id || !saved.ts || Date.now() - saved.ts > PIX_AUTH_TTL_MS) {
        if (saved?.id) {
          try { localStorage.removeItem(PIX_AUTH_LS_KEY); } catch { /* noop */ }
        }
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("asaas-pix-auto-status", {
          body: { authorizationId: saved.id },
        });
        if (error) {
          // id inválido/expirado (ex.: salvo por outro gateway): descarta.
          try { localStorage.removeItem(PIX_AUTH_LS_KEY); } catch { /* noop */ }
          return;
        }
        if (cancelled || !data?.state) return;
        setResumedPlan(data.plan || saved.plan || null);
        setResumedState(data.state);
        if (data.state === "pending") {
          setResumedAuthId(saved.id);
        } else {
          try { localStorage.removeItem(PIX_AUTH_LS_KEY); } catch { /* noop */ }
        }
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling do consentimento: vale tanto para o QR na tela quanto para a
  // autorização retomada. 4s nos 2 primeiros minutos, 10s depois, teto de 20 min.
  useEffect(() => {
    const liveAuthId =
      pixOpen && pixStage === "qr" && authState === "pending" ? pixData?.authorizationId : null;
    const authId = liveAuthId || resumedAuthId;
    if (!authId) return;
    // O status por polling é específico do Asaas; Inter/Woovi confirmam por webhook.
    if (pixGateway !== "asaas") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const finish = (state: "active" | "expired") => {
      if (liveAuthId) setAuthState(state);
      logFunnel(state === "active" ? "pix_authorized" : "pix_qr_error", {
        plan: selectedPlan,
        billing: billingPeriod,
        paymentMethod: "pix_auto",
        detail: state === "active" ? "authorization_active" : "authorization_expired",
      });
      setResumedState(state);
      setResumedAuthId(null);
      try { localStorage.removeItem(PIX_AUTH_LS_KEY); } catch { /* noop */ }
      if (state === "active") {
        toast.success("Cobrança automática autorizada! Sua assinatura está ativa.");
      }
    };

    const tick = async () => {
      const elapsed = Date.now() - startedAt;
      if (cancelled || elapsed > 20 * 60 * 1000) return;
      try {
        const { data } = await supabase.functions.invoke("asaas-pix-auto-status", {
          body: { authorizationId: authId },
        });
        if (cancelled) return;
        if (data?.state === "active" || data?.state === "expired") {
          finish(data.state);
          return;
        }
      } catch {
        // silencioso: polling não deve gerar ruído pro cliente
      }
      if (!cancelled) timer = setTimeout(tick, elapsed < 2 * 60 * 1000 ? 4000 : 10000);
    };

    timer = setTimeout(tick, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pixOpen, pixStage, pixData?.authorizationId, authState, resumedAuthId, pixGateway]);

  const inputCls =
    "ck-field mt-1.5 h-12 text-base sm:text-sm sm:h-11 focus-visible:ring-0 focus-visible:ring-offset-0";

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

      <div className="v2-theme checkout-dark min-h-screen bg-[hsl(var(--ck-bg))] text-white">
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

        <div className="relative container mx-auto px-4 py-8 md:py-12 pb-28 lg:pb-12">
          <div
            className={
              embeddedClientSecret || asaasCardOpen ? "max-w-xl mx-auto" : "max-w-5xl mx-auto"
            }
          >
            {/* Retomada do PIX Automático: fecha o loop pra quem autorizou (ou não)
                depois de sair da tela do QR. */}
            {!pixOpen && resumedState && (
              <div
                className={`mb-6 rounded-xl border p-4 text-sm ${
                  resumedState === "active"
                    ? "border-[hsl(140_22%_45%)]/50 bg-[hsl(140_22%_45%)]/15 text-white"
                    : resumedState === "expired"
                      ? "border-amber-400/40 bg-amber-400/10 text-white"
                      : "border-white/15 bg-white/5 text-white/85"
                }`}
              >
                {resumedState === "active" && (
                  <>
                    <p className="font-semibold">Cobrança automática autorizada</p>
                    <p className="mt-1 text-white/80">
                      Sua assinatura está ativa. Pode continuar a conversa com a AURA no WhatsApp.
                    </p>
                  </>
                )}
                {resumedState === "pending" && (
                  <>
                    <p className="font-semibold">Falta autorizar a cobrança automática</p>
                    <p className="mt-1 text-white/80">
                      Você gerou um PIX
                      {resumedPlan ? ` do plano ${plans[resumedPlan as PlanId]?.name || resumedPlan}` : ""} e ele
                      ainda está aguardando a confirmação da recorrência no app do seu banco. Assim que
                      autorizar, avisamos aqui.
                    </p>
                  </>
                )}
                {resumedState === "expired" && (
                  <>
                    <p className="font-semibold">O PIX anterior expirou</p>
                    <p className="mt-1 text-white/80">
                      A autorização não foi concluída no app do banco. Escolha o plano abaixo e gere um
                      novo PIX — leva menos de um minuto.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Progresso — barra fina em vez de stepper discreto: comunica de longe
                que o fluxo tem só 2 passos e que já está na metade. */}
            <div className="mb-6 max-w-sm mx-auto">
              <div className="flex items-baseline justify-between text-[11px] mb-1.5">
                <span className="font-medium text-[hsl(var(--ck-text))]">
                  {embeddedClientSecret || asaasCardOpen ? "Passo 2 de 2 · Pagamento" : "Passo 1 de 2 · Seus dados"}
                </span>
                <span className="text-[hsl(var(--ck-text-muted))]">
                  {embeddedClientSecret || asaasCardOpen ? "quase lá" : "leva 2 minutos"}
                </span>
              </div>
              <div
                className="h-1.5 w-full rounded-full bg-[hsl(var(--ck-text)/0.1)] overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={embeddedClientSecret || asaasCardOpen ? 2 : 1}
              >
                <div
                  className="h-full rounded-full bg-[hsl(var(--ck-cta))] transition-all duration-500"
                  style={{ width: embeddedClientSecret || asaasCardOpen ? "100%" : "50%" }}
                />
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
                  {!embeddedMounted && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center pointer-events-none">
                      <div className="w-8 h-8 rounded-full border-2 border-[hsl(140_22%_45%)]/30 border-t-[hsl(140_22%_45%)] animate-spin" />
                      <p className="text-sm font-medium text-gray-700">
                        {embeddedFallbackLoading
                          ? "Abrindo o pagamento seguro…"
                          : "Preparando o pagamento seguro…"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {currentPlan.name} · R$ {todayAmount} hoje · leva 1 ou 2 segundos
                      </p>
                    </div>
                  )}
                  <div className="relative z-10" ref={embeddedHostRef}>
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
                  if (m) return decodeURIComponent(m[1]);
                  // Sem cookie ainda: deriva do fbclid da URL (mesma regra do PIX).
                  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
                  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
                })()}
                gaClientId={getGaClientId() || undefined}
                onBack={handleResetCheckout}
                onSuccess={(info) => {
                  // Persiste flag pro /obrigado adaptar headline (retornante).
                  try {
                    localStorage.setItem(
                      "aura_checkout",
                      JSON.stringify({
                        name,
                        phone,
                        plan: selectedPlan,
                        billing: billingPeriod,
                        price: currentPrice,
                        returningCustomerMonthly: !!info?.returningCustomerMonthly,
                      }),
                    );
                  } catch { /* best-effort */ }
                  if (info?.returningCustomerMonthly) {
                    trackReturningCustomerMonthly("asaas");
                  }
                  window.location.href = "/obrigado";
                }}
              />
            ) : (
              <>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8 lg:gap-10 items-start">
              <div className="min-w-0 max-w-xl w-full mx-auto lg:mx-0">
            {/* Cabeçalho enxuto */}
            <div className="text-center lg:text-left mb-6">
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
              {/* Abas de ciclo com preço/mês visível (ver CycleTabs). */}
              <CycleTabs
                items={cycleItems}
                value={billingPeriod}
                onChange={(id) => setBillingPeriod(id as BillingPeriod)}
              />

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
                  const monthlyForSession = parseBRL(
                    getPeriodMonthlyEquivalent(plan, billingPeriod) || plan.monthlyPrice,
                  );
                  const perSession =
                    plan.sessions >= 4
                      ? (monthlyForSession / plan.sessions).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : null;

                  return (
                    <label
                      key={id}
                      className={`relative flex items-center justify-between gap-3 rounded-xl border cursor-pointer transition-all ${
                        isPopular ? "p-5 mt-3" : "p-4"
                      } ${
                        active
                          ? "border-[hsl(140_22%_55%)] bg-[hsl(140_22%_45%/0.16)] shadow-[0_0_0_1px_hsl(140_22%_55%/0.5),0_12px_30px_-18px_hsl(140_22%_45%/0.9)]"
                          : isPopular
                            ? "border-[hsl(140_22%_45%)]/40 bg-white/[0.05] hover:border-[hsl(140_22%_55%)]/70"
                            : "border-white/10 bg-white/[0.03] hover:border-white/25"
                      }`}
                    >
                      {isPopular && (
                        <div className="absolute -top-2 left-4 px-2 py-0.5 bg-[hsl(140_22%_45%)] text-white text-[10px] font-semibold rounded uppercase tracking-wide">
                          Recomendado
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
                              ? `${plan.sessions} ${plan.sessions === 1 ? "sessão" : "sessões"}/mês + chat ilimitado`
                              : "Chat ilimitado 24/7"}
                          </p>
                          {perSession && (
                            <p className="text-[11px] text-[hsl(140_30%_72%)] mt-0.5">
                              R$ {perSession} por sessão
                              {isPopular ? " · melhor custo por sessão" : ""}
                            </p>
                          )}
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

              {/* Confiança acima da dobra, colada na escolha do plano. */}
              <TrustRow />

              {/* Formulário enxuto */}
              <div className="space-y-3 pt-2">
                <div>
                  <Label htmlFor="phone" className="text-white/80 text-sm">WhatsApp</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    onFocus={() => void warmUp()}
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
                      É por aqui que a AURA fala com você. Não enviamos spam.
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="name" className="text-white/80 text-sm">Nome</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onFocus={() => void warmUp()}
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
                    onFocus={() => void warmUp()}
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
                  {!errors.email && (
                    <p className="text-[11px] text-white/60 mt-1">
                      Só para recibo e recuperação de acesso.
                    </p>
                  )}
                </div>
              </div>

              {/* Escolha explícita do meio de pagamento: um CTA só, um preço só.
                  Antes eram dois botões com valores diferentes no rótulo e o PIX
                  parecia custar 5x mais que o cartão. */}
              <div className="space-y-3 pt-1">
                {pixRailUp ? (
                  <PaymentMethodToggle
                  value={payMethod}
                  onChange={setPayMethod}
                  cardHint={
                    pixEnabled
                      ? `R$ ${currentPrice}/${periodLabel}`
                      : `7 dias por R$ ${currentPlan.trialPrice}`
                  }
                  pixHint={
                    pixEnabled
                      ? `R$ ${currentPrice} à vista`
                      : `7 dias por R$ ${currentPlan.trialPrice}`
                  }
                  />
                ) : (
                  // Trilho de PIX oscilando: o método continua visível (esconder
                  // derrubou a conversão de quem só paga por PIX), mas o clique
                  // mantém o cartão selecionado e avisa em uma linha.
                  <>
                    <PaymentMethodToggle
                      value="card"
                      onChange={(m) => {
                        if (m === "pix") {
                          logFunnel("pix_blocked_rail_down", {
                            plan: selectedPlan,
                            billing: billingPeriod,
                            paymentMethod: "pix",
                          });
                          toast.info("PIX voltando em instantes. Por ora, o cartão libera na hora.");
                          return;
                        }
                        setPayMethod("card");
                      }}
                      cardHint={
                        pixEnabled
                          ? `R$ ${currentPrice}/${periodLabel}`
                          : `7 dias por R$ ${currentPlan.trialPrice}`
                      }
                      pixHint="Voltando em instantes"
                    />
                    <p className="text-[11px] leading-tight text-[hsl(var(--ck-text-muted))]">
                      PIX em manutenção rápida. O cartão libera o acesso na hora.
                    </p>
                  </>
                )}

                <div className="ck-num text-center text-sm text-[hsl(var(--ck-text-muted))]">
                  Cobrado hoje{" "}
                  <span className="font-semibold text-[hsl(var(--ck-text))]">
                    R$ {!pixEnabled ? currentPlan.trialPrice : currentPrice}
                  </span>
                  {" · "}
                  {!pixEnabled
                    ? `depois R$ ${currentPrice}/mês`
                    : `renova em R$ ${currentPrice}/${periodLabel}`}
                </div>

                <Button
                  id="checkout-primary-cta"
                  type={payMethod === "card" ? "submit" : "button"}
                  variant={payMethod === "pix" ? "sage" : "sage-solid"}
                  size="cta"
                  onClick={payMethod === "pix" ? () => handleOpenPix("subscription") : undefined}
                  className={`w-full whitespace-normal leading-tight ${!isFormValid ? "opacity-70" : ""}`}
                  disabled={payMethod === "card" && isLoading}
                  aria-disabled={!isFormValid || (payMethod === "card" && isLoading)}
                >
                  {payMethod === "card" ? (
                    <CreditCard className="w-5 h-5" />
                  ) : (
                    <QrCode className="w-5 h-5" />
                  )}
                  <span className="ck-num">
                    {payMethod === "card"
                      ? isLoading
                        ? "Abrindo pagamento seguro..."
                        : pixEnabled
                          ? `Assinar por R$ ${currentPrice}`
                          : `Começar por R$ ${currentPlan.trialPrice}`
                      : pixEnabled
                        ? `Pagar com PIX — R$ ${currentPrice}`
                        : `Pagar com PIX — R$ ${currentPlan.trialPrice}`}
                  </span>
                  <ArrowRight className="w-5 h-5" />
                </Button>

                <p className="text-center text-[11px] text-[hsl(var(--ck-text-muted))]">
                  {payMethod === "card"
                    ? pixEnabled
                      ? "Cobrança única do ciclo • renovação automática • cancele quando quiser"
                      : "7 dias completos • Sem cobrança se cancelar antes do 8º dia"
                    : pixEnabled
                      ? "Autorize 1x no app do banco • renovação automática • cancele quando quiser"
                      : `1ª semana por R$ ${currentPlan.trialPrice} • autorize 1x no app do banco • depois R$ ${currentPrice}/mês`}
                </p>
              </div>

              <TrustRow className="pt-1" />

              {/* Mini-depoimento (o painel lateral cobre o desktop) */}
              <p className="lg:hidden text-center text-xs text-white/55 italic max-w-md mx-auto pt-2">
                "Em 3 dias senti que alguém finalmente me ouvia." — Ana C.
              </p>
            </form>

              {/* Objeções no ponto de decisão (também preenche o vazio do desktop) */}
              <CheckoutObjections className="mt-8" />
              </div>

              <div className="hidden lg:block">
                <OrderSummary
                  planName={currentPlan.name}
                  cycleLabel={`${periodFullMap[billingPeriod]} · R$ ${currentPrice}/${periodLabel}`}
                  todayAmount={todayAmount}
                  nextChargeLabel={nextChargeLabel}
                  benefits={summaryBenefits}
                />
              </div>
            </div>

              </>
            )}
          </div>
        </div>

        {/* CTA fixo no mobile quando o botão principal sai da tela */}
        {!embeddedClientSecret && !asaasCardOpen && (
          <StickyMobileCta
            anchorId="checkout-primary-cta"
            todayLabel={`R$ ${todayAmount}`}
            ctaLabel={
              pixEnabled && pixRailUp ? "Pagar com PIX" : `Começar por R$ ${todayAmount}`
            }
            onClick={() => {
              // Antes esse clique com formulário vazio virava "form_invalid" e
              // poluía a métrica de validação. Agora é um evento próprio e o
              // usuário é levado direto pro primeiro campo em branco.
              const emptyFields = [
                phoneDigits.length < 11 ? "phone" : null,
                !name.trim() ? "name" : null,
                !email.trim() ? "email" : null,
              ].filter(Boolean) as string[];
              if (emptyFields.length === 3) {
                logFunnel("cta_empty_form", {
                  plan: selectedPlan,
                  billing: billingPeriod,
                  paymentMethod: payMethod,
                  detail: emptyFields.join(","),
                });
                requestAnimationFrame(() => {
                  const el = document.getElementById("phone");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.focus({ preventScroll: true });
                });
                return;
              }
              document
                .getElementById("checkout-primary-cta")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        )}

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
            // Fechou com QR na tela e sem pagamento confirmado: é abandono de
            // PIX, não erro técnico. É esse número que explica o buraco entre
            // "gerou QR" e "pagou".
            if (pixStage === "qr" && pixData && authState !== "active") {
              logFunnel("pix_abandoned", {
                plan: selectedPlan,
                billing: billingPeriod,
                paymentMethod: pixMode === "subscription" ? "pix_auto" : "pix",
                detail: pixCopiedRef.current ? "copiou_codigo" : "sem_copia",
              });
            }
            pixCopiedRef.current = false;
            // ao fechar, reseta pra começar limpo na próxima abertura
            setTimeout(() => {
              setPixStage("form");
              setPixData(null);
              setCpfError(undefined);
            }, 200);
          }
        }}>
          <DialogContent className="bg-[hsl(220_35%_12%)] border-white/10 text-white max-w-md max-h-[90vh] overflow-y-auto">
            {pixStage === "form" ? (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display text-xl text-white">
                    Pagar com PIX
                  </DialogTitle>
                  <DialogDescription className="text-white/65">
                    Plano <span className="text-white font-medium">{currentPlan.name}</span> · {periodShortMap[billingPeriod]} —{" "}
                    {pixMode === "subscription" && billingPeriod === "monthly" ? (
                      <>
                        <span className="text-[hsl(140_30%_72%)] font-semibold">
                          1ª semana R$ {currentPlan.trialPrice}
                        </span>{" "}
                        <span className="block text-xs mt-1 text-white/60">
                          Depois R$ {currentPrice}/mês, com autorização única no app do banco.
                          Cancele quando quiser.
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[hsl(140_30%_72%)] font-semibold">R$ {currentPrice}</span> à vista
                      </>
                    )}
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
                      className={`mt-1.5 h-12 text-base sm:text-sm sm:h-11 bg-white/5 text-white placeholder:text-white/40 border-white/15 focus-visible:ring-0 focus-visible:ring-offset-0 ${
                        cpfError ? "border-red-400/70 focus-visible:ring-red-400/60" : ""
                      }`}
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
                    {pixLoading
                      ? "Gerando PIX..."
                      : pixMode === "subscription" && billingPeriod === "monthly"
                        ? `Gerar PIX — R$ ${currentPlan.trialPrice}`
                        : `Gerar PIX — R$ ${currentPrice}`}
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
                    {pixData.authorizationOnly
                      ? "Autorize e comece agora"
                      : "Escaneie ou copie o código"}
                  </DialogTitle>
                  <DialogDescription className="text-white/65">
                    <span className="text-[hsl(140_30%_72%)] font-semibold">
                      {pixData.authorizationOnly
                        ? "7 dias grátis"
                        : `R$ ${pixData.amount.toFixed(2).replace(".", ",")}`}
                    </span>
                    {" "}· {currentPlan.name} {periodShortMap[billingPeriod]}
                    {pixData.authorizationOnly && pixData.recurringAmount ? (
                      <span className="block text-xs mt-1 text-white/60">
                        Nada é cobrado hoje. Você autoriza o débito automático de R${" "}
                        {pixData.recurringAmount.toFixed(2).replace(".", ",")}/mês, que só
                        começa depois dos 7 dias — cancele quando quiser no app do banco.
                      </span>
                    ) : pixData.trial && pixData.recurringAmount ? (
                      <span className="block text-xs mt-1 text-white/60">
                        1ª semana. Depois R${" "}
                        {pixData.recurringAmount.toFixed(2).replace(".", ",")}/mês no débito
                        automático
                        {pixData.firstRecurringChargeDate
                          ? `, a partir de ${new Date(`${pixData.firstRecurringChargeDate}T12:00:00`).toLocaleDateString("pt-BR")}`
                          : ""}
                        {" "}— cancele quando quiser no app do banco.
                      </span>
                    ) : null}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 sm:space-y-4 pt-2">
                  {/* Trava nº1 do PIX Automático: o banco mostra o valor cheio do
                      plano e o lead entende como cobrança de agora. Deixa explícito
                      o que sai hoje e o que é só autorização. */}
                  {pixData.trial && pixData.recurringAmount ? (
                    <div className="bg-[hsl(140_30%_45%)]/15 border border-[hsl(140_30%_60%)]/35 rounded-xl p-3 text-xs text-white/85 leading-relaxed">
                      Hoje sai só{" "}
                      <strong className="text-[hsl(140_30%_78%)]">
                        R$ {pixData.amount.toFixed(2).replace(".", ",")}
                      </strong>
                      . O valor de{" "}
                      <strong>R$ {pixData.recurringAmount.toFixed(2).replace(".", ",")}</strong>{" "}
                      que o app do banco mostra é a autorização das próximas mensalidades — só
                      entra
                      {pixData.firstRecurringChargeDate
                        ? ` em ${new Date(`${pixData.firstRecurringChargeDate}T12:00:00`).toLocaleDateString("pt-BR")}`
                        : " no 8º dia"}
                      , e você pode cancelar antes sem pagar nada.
                    </div>
                  ) : null}
                  <div className="bg-white rounded-xl p-3 sm:p-4 flex justify-center">
                    <img
                      // Asaas devolve base64 puro; o Inter devolve data URI de SVG já pronto.
                      src={pixData.qrImage.startsWith("data:")
                        ? pixData.qrImage
                        : `data:image/png;base64,${pixData.qrImage}`}
                      alt="QR Code PIX"
                      className="w-44 h-44 sm:w-56 sm:h-56"
                    />
                  </div>

                  <div>
                    <Label className="text-white/80 text-sm">Código copia-e-cola</Label>
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        readOnly
                        value={pixData.copyPaste}
                        className="mt-0 h-12 sm:h-11 text-xs font-mono bg-white/5 text-white placeholder:text-white/40 border-white/15 focus-visible:ring-0 focus-visible:ring-offset-0 truncate"
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
                    {/* Ação principal logo abaixo do código: no mobile o botão
                        ficava no fim do modal e quase ninguém copiava. */}
                    <Button
                      variant="sage"
                      size="lg"
                      className="w-full rounded-full mt-2.5"
                      onClick={handleCopyPix}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar código PIX
                    </Button>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white/70 space-y-1.5">
                    <p>1. Abra o app do seu banco e escolha pagar com PIX.</p>
                    <p>2. Escaneie o QR Code ou cole o código copia-e-cola.</p>
                    {pixMode === "subscription" ? (
                      <>
                        <p className="text-white">
                          3. <strong>Marque a autorização de cobrança automática</strong> na tela de
                          confirmação do banco.
                        </p>
                        <p>4. Confirme o pagamento — a liberação chega no WhatsApp em segundos.</p>
                      </>
                    ) : (
                      <p>3. Confirme o pagamento — você recebe a confirmação no WhatsApp em segundos.</p>
                    )}
                  </div>

                  {pixMode === "subscription" && (
                    <div className="bg-[hsl(35_70%_60%)]/15 border border-[hsl(35_70%_60%)]/40 rounded-xl p-3 text-xs space-y-2">
                      <p className="font-semibold text-[hsl(35_70%_75%)]">
                        ⚠️ O passo que a maioria esquece
                      </p>
                      <p className="text-white/80">
                        O app do banco vai pedir <strong>duas confirmações</strong>: o pagamento e a{" "}
                        <strong>autorização da cobrança automática</strong> (pode aparecer como
                        "Pix Automático" ou "autorizar cobranças recorrentes"). Sem marcar a segunda,
                        a assinatura não é ativada.
                      </p>
                      {pixData.trial && pixData.recurringAmount ? (
                        <details className="group">
                          <summary className="cursor-pointer text-white/70 underline decoration-white/30 underline-offset-2 list-none">
                            Como aparece no seu banco
                          </summary>
                          <p className="text-white/80 mt-2">
                            A ordem das telas muda de banco pra banco: alguns mostram o valor de hoje
                            (<strong>R$ {pixData.amount.toFixed(2).replace(".", ",")}</strong>) e a
                            recorrência (<strong>R$ {pixData.recurringAmount.toFixed(2).replace(".", ",")}/mês</strong>)
                            juntos; outros, como o Nubank, mostram primeiro a autorização mensal e só
                            na tela seguinte a cobrança de hoje. <strong>Siga até o fim</strong> — as
                            duas etapas fazem parte do mesmo QR.
                          </p>
                        </details>
                      ) : null}
                      <p className="text-white/60">
                        Você cancela essa autorização quando quiser, no próprio app do banco.
                      </p>
                    </div>
                  )}

                  {authState === "pending" && (
                    <div className="flex items-center justify-center gap-2 text-xs text-white/70">
                      <span className="w-2 h-2 rounded-full bg-[hsl(35_70%_60%)] animate-pulse" />
                      Aguardando a autorização no app do banco...
                    </div>
                  )}

                  {authState === "active" && (
                    <div className="bg-[hsl(140_30%_45%)]/20 border border-[hsl(140_30%_60%)]/40 rounded-xl p-3 text-xs text-white">
                      ✅ Cobrança automática autorizada. Sua assinatura está ativa — o acesso chega no
                      WhatsApp.
                    </div>
                  )}

                  {authState === "expired" && (
                    <div className="bg-destructive/20 border border-destructive/40 rounded-xl p-3 text-xs text-white space-y-2">
                      <p>
                        O código expirou antes da autorização ser concluída. Gere um novo PIX e
                        lembre-se de marcar a autorização de cobrança automática.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          setPixData(null);
                          setAuthState(null);
                          setPixStage("form");
                        }}
                      >
                        Gerar novo PIX
                      </Button>
                    </div>
                  )}

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
