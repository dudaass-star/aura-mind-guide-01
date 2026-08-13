import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations } from "../_shared/zapi-client.ts";
import { saveMetaIdentity } from "../_shared/meta-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hardening: valida no boot que os secrets do fallback Semanal→Mensal existem.
// Se faltar, loga um aviso alto — o throw só dispara quando alguém tenta usar
// (evita derrubar o boot inteiro por causa do fluxo retornante).
(() => {
  const required = [
    "STRIPE_PRICE_ESSENCIAL_MONTHLY",
    "STRIPE_PRICE_DIRECAO_MONTHLY",
    "STRIPE_PRICE_TRANSFORMACAO_MONTHLY",
  ];
  const missing = required.filter((k) => !Deno.env.get(k));
  if (missing.length > 0) {
    console.error(
      `[CREATE-CHECKOUT][BOOT] Secrets ausentes p/ fallback retornante: ${missing.join(", ")}. ` +
      `Retornantes que escolherem Semanal vão falhar até setar.`,
    );
  }
})();

// Trial price IDs per plan (one-time, paid trial)
const getTrialPrices = (): Record<string, string> => ({
  essencial: Deno.env.get("STRIPE_PRICE_ESSENCIAL_TRIAL") || "",
  direcao: Deno.env.get("STRIPE_PRICE_DIRECAO_TRIAL") || "",
  transformacao: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_TRIAL") || "",
});

// Price IDs from environment variables
const getPrices = (): Record<string, { monthly: string; yearly: string; boletoYearly: string }> => ({
  essencial: {
    monthly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_YEARLY") || "",
    boletoYearly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_PIX_YEARLY") || "",
  },
  direcao: {
    monthly: Deno.env.get("STRIPE_PRICE_DIRECAO_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_DIRECAO_YEARLY") || "",
    boletoYearly: Deno.env.get("STRIPE_PRICE_DIRECAO_PIX_YEARLY") || "",
  },
  transformacao: {
    monthly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_YEARLY") || "",
    boletoYearly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_PIX_YEARLY") || "",
  },
});

// Preços RECORRENTES sem trial para Trim/Sem/Anual (V2).
// Hardcoded aqui pra evitar criar 9 secrets — IDs são públicos (visíveis no dashboard).
// Stripe: interval=month, interval_count=3/6 para trim/sem; interval=year, interval_count=1 para anual.
const RECURRING_PRICES: Record<string, { quarterly: string; semestral: string; yearly: string }> = {
  essencial: {
    quarterly: "price_1U0pUoQU15XnZ7Vvqc4DcNi2",
    semestral: "price_1U0pVHQU15XnZ7VvvCChiLHP",
    yearly:    "price_1U0pW5QU15XnZ7VvBVHvYUnU",
  },
  direcao: {
    quarterly: "price_1U0pWPQU15XnZ7VviqtmRsYR",
    semestral: "price_1U0pWhQU15XnZ7VvEveOB9DP",
    yearly:    "price_1U0pYFQU15XnZ7Vvu6ylUTEM",
  },
  transformacao: {
    quarterly: "price_1U0pa7QU15XnZ7VvEqEFDPWg",
    semestral: "price_1U0paYQU15XnZ7VvmTzRNyGG",
    yearly:    "price_1U0pavQU15XnZ7VvQErVkBV7",
  },
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");
    const reqStart = Date.now();

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const { plan: requestedPlan, billing = "monthly", name, email, phone, trial, paymentMethod, fbp, fbc, gaClientId, embedded, fallback, warmup, prewarm } = await req.json();

    // === WARMUP ===
    // O front chama isso no primeiro foco de campo pra matar o cold start da função
    // e já carregar o js.stripe.com com a chave pública antes do clique no CTA.
    // Não toca na API da Stripe: resposta em milissegundos.
    if (warmup) {
      return new Response(
        JSON.stringify({
          ok: true,
          publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }
    
    const plan = requestedPlan;
    const billingOverride = billing;
    const isBoletoPayment = paymentMethod === "boleto" && billingOverride === "yearly";
    // V2: cartão recorrente sem trial pra Trim/Sem/Anual.
    const isRecurringCardV2 =
      paymentMethod === "card" &&
      !trial &&
      (billingOverride === "quarterly" || billingOverride === "semestral" || billingOverride === "yearly");
    // Trial "efetivo": pode ser rebaixado pra false se o cliente for retornante
    // (Semanal só na 1ª compra) — nesse caso promovemos silenciosamente pra
    // Mensal recorrente sem trial usando STRIPE_PRICE_*_MONTHLY.
    let effectiveTrial = !!trial;
    let returningCustomerMonthly = false;
    
    logStep("Request received", { plan, billing: billingOverride, name, email, phone, trial: !!trial, paymentMethod, isBoleto: isBoletoPayment, isRecurringCardV2, embedded: !!embedded, hasFbp: !!fbp, hasFbc: !!fbc, hasGaClientId: !!gaClientId });

    const PRICES = getPrices();
    
    if (!plan || !PRICES[plan]) {
      throw new Error("Invalid plan selected");
    }

    if (!name || !phone) {
      throw new Error("Name and phone are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error("Valid email is required");
    }

    // Anual com trial não é mais permitido (V2).
    if (trial && billingOverride === "yearly") {
      throw new Error("Invalid billing: trial não disponível para o plano anual");
    }

    // Período usado em metadata/labels — preserva valor cru pra V2 (quarterly/semestral/yearly).
    const billingPeriod = (
      ["monthly", "quarterly", "semestral", "yearly"].includes(billingOverride)
        ? billingOverride
        : "monthly"
    ) as "monthly" | "quarterly" | "semestral" | "yearly";

    // Resolve o price ID conforme o fluxo:
    //   - Boleto: STRIPE_PRICE_*_PIX_YEARLY (legado, só anual)
    //   - Cartão recorrente V2 (trim/sem/anual sem trial): RECURRING_PRICES hardcoded
    //   - Cartão mensal/anual com trial: STRIPE_PRICE_*_MONTHLY ou _YEARLY (legado)
    let priceId: string;
    if (isBoletoPayment) {
      priceId = PRICES[plan].boletoYearly;
    } else if (isRecurringCardV2) {
      const recurring = RECURRING_PRICES[plan];
      if (!recurring) throw new Error("Plano sem preço recorrente configurado");
      priceId = recurring[billingPeriod as "quarterly" | "semestral" | "yearly"];
    } else {
      // Fluxos legados (mensal cartão e anual trial) usam o mapa antigo,
      // que só conhece monthly/yearly.
      const legacyPeriod = billingPeriod === "yearly" ? "yearly" : "monthly";
      priceId = PRICES[plan][legacyPeriod];
    }

    if (!priceId) {
      throw new Error("Price ID not configured for this plan. Check environment variables.");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Clean and validate phone number
    const phoneClean = phone.replace(/\D/g, "");
    // Cache de identidade do Meta: se a compra concluir sem cookie (outro
    // dispositivo, cookie apagado), o webhook recupera fbp/fbc daqui.
    if (fbp || fbc) {
      const supabaseIdentity = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      );
      void saveMetaIdentity(supabaseIdentity, {
        email, phone: phoneClean, fbp, fbc, source: "create-checkout",
      });
    }
    
    if (!/^[0-9]{10,15}$/.test(phoneClean)) {
      logStep("Invalid phone format", { phoneLength: phoneClean.length });
      return new Response(JSON.stringify({ error: "Número de telefone inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Always create or find a customer first
    let customerId: string;
    
    const phoneVariations = getPhoneVariations(phoneClean);
    const lookupStarted = Date.now();

    // === LOOKUP PARALELO (performance) ===
    // Antes: 1 search por variação de telefone em série + search por email +
    // list por email + search por telefone de novo (até 6 chamadas encadeadas).
    // Agora: todas as buscas disparam juntas e o resultado alimenta tanto o
    // "existingCustomer" quanto a anti-duplicação e o histórico do Semanal.
    const [phoneSearchResults, emailListResult] = await Promise.all([
      Promise.all(
        phoneVariations.map((phoneVar) =>
          stripe.customers
            .search({ query: `metadata['phone']:'${phoneVar}'`, limit: 10 })
            .catch(() => ({ data: [] as Stripe.Customer[] })),
        ),
      ),
      email
        ? stripe.customers.list({ email, limit: 10 }).catch(() => ({ data: [] as Stripe.Customer[] }))
        : Promise.resolve({ data: [] as Stripe.Customer[] }),
    ]);

    let existingCustomer: Stripe.Customer | null = null;
    const customersToCheck = new Map<string, true>();
    for (const res of phoneSearchResults) {
      for (const c of res.data) {
        if (!existingCustomer) existingCustomer = c;
        customersToCheck.set(c.id, true);
      }
    }
    for (const c of emailListResult.data) {
      if (!existingCustomer) {
        existingCustomer = c;
        logStep("Found customer by email fallback", { customerId: c.id });
      }
      customersToCheck.set(c.id, true);
    }
    logStep("Customer lookup done", {
      ms: Date.now() - lookupStarted,
      candidates: customersToCheck.size,
      existing: existingCustomer?.id || null,
    });

    // Histórico Stripe (qualquer subscription, inclusive cancelada) — calculado
    // uma única vez aqui e reusado pelo bloqueio do Plano Semanal mais abaixo.
    let hasAnyStripeSubscription = false;

    // === ANTI-DUPLICAÇÃO (roda SEMPRE, mesmo sem existingCustomer) ===
    // Caso real (Jenoelma, 03/04/2026): dois checkouts no mesmo dia criaram dois
    // customers com duas subscriptions ativas. A checagem só rodava quando o
    // customer era encontrado pelo `customers.search` — API com indexação
    // eventual, que pode não retornar um customer criado minutos antes.
    // `customers.list({ email })` é consistente e fecha essa brecha.
    try {
      logStep("Anti-dup: checking subscriptions", { customerCount: customersToCheck.size });

      // Uma chamada por customer (status: all) em paralelo — cobre active,
      // trialing e histórico do Semanal de uma vez.
      const subsResults = await Promise.all(
        [...customersToCheck.keys()].map(async (cid) => ({
          cid,
          subs: await stripe.subscriptions
            .list({ customer: cid, status: "all", limit: 10 })
            .catch(() => ({ data: [] as Stripe.Subscription[] })),
        })),
      );

      for (const { cid, subs } of subsResults) {
        if (subs.data.length > 0) hasAnyStripeSubscription = true;
        const activeSub = subs.data.find((s) => s.status === "active" || s.status === "trialing");
        if (activeSub) {
          logStep("⛔ Anti-dup: active subscription found", {
            customerId: cid,
            subscriptionId: activeSub.id,
            status: activeSub.status,
          });
          return new Response(JSON.stringify({
            error: "Você já possui uma assinatura ativa da AURA. Acesse seu WhatsApp ou entre em contato com o suporte.",
            code: "ACTIVE_SUBSCRIPTION_EXISTS",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          });
        }
      }
      logStep("✅ Anti-dup: no active subscription, OK to proceed", { ms: Date.now() - lookupStarted });
    } catch (dupErr) {
      // Não-bloqueante: se a checagem falhar, prosseguir (não queremos quebrar o checkout por isso)
      const msg = dupErr instanceof Error ? dupErr.message : String(dupErr);
      if (msg.includes("ACTIVE_SUBSCRIPTION_EXISTS")) throw dupErr;
      console.warn("⚠️ Anti-dup check failed (non-blocking):", msg);
    }

    if (existingCustomer) {
      customerId = existingCustomer.id;
      logStep("Found existing customer", { customerId });
      // Fire-and-forget: a sessão só precisa do customerId. Esperar o update
      // aqui adicionava ~300ms no caminho crítico do formulário de cartão.
      void stripe.customers
        .update(customerId, {
          email: email,
          name: name,
          // País fixo em BR: sem isso o Checkout abre com "País ou região"
          // preenchido pelo IP/locale do datacenter (aparecia "Bélgica" pro
          // usuário brasileiro no exato momento de digitar o cartão).
          address: { country: "BR" },
          metadata: { phone: phoneClean },
        })
        .catch((e) => console.warn("⚠️ customers.update falhou (non-blocking):", e?.message || e));
    } else {
      const newCustomer = await stripe.customers.create({
        name: name,
        email: email,
        address: { country: "BR" },
        metadata: {
          phone: phoneClean,
        },
      });
      customerId = newCustomer.id;
      logStep("Created new customer", { customerId });
    }

    const origin = req.headers.get("origin") || "https://olaaura.com.br";

    // Plan display prices for custom_text — agora cobre os 4 períodos.
    const planPrices: Record<string, Record<string, string>> = {
      essencial:     { monthly: "29,90", quarterly: "59,70",  semestral: "89,40",  yearly: "118,80" },
      direcao:       { monthly: "49,90", quarterly: "101,70", semestral: "149,40", yearly: "202,80" },
      transformacao: { monthly: "79,90", quarterly: "161,70", semestral: "239,40", yearly: "322,80" },
    };
    const displayPrice = planPrices[plan]?.[billingPeriod] || "";
    const periodLabelMap: Record<string, string> = {
      monthly: "mês",
      quarterly: "trimestre",
      semestral: "semestre",
      yearly: "ano",
    };
    const periodLabel = periodLabelMap[billingPeriod] || "mês";
    

    // Build checkout session config
    // Modo embedded: renderiza dentro da nossa página (Stripe Embedded Checkout),
    // sem salto pro domínio checkout.stripe.com — resolve a quebra de confiança no momento do cartão.
    const sessionConfig: any = {
      customer: customerId,
      locale: "pt-BR",
      // Desliga o Adaptive Pricing da Stripe (que oferece seletor de moeda US$/R$
      // baseado no IP/locale do browser). Nosso público é 100% Brasil — cobramos
      // sempre em BRL e mostramos só o preço em real, sem ruído cognitivo.
      adaptive_pricing: { enabled: false },
      custom_text: {
        submit: {
          message: `"Eu estava cética, mas em 3 dias já senti que alguém finalmente me ouvia." — Ana C.`,
        },
      },
    };
    if (embedded) {
      sessionConfig.ui_mode = "embedded";
      sessionConfig.return_url = `${origin}/obrigado?session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionConfig.success_url = `${origin}/obrigado?session_id={CHECKOUT_SESSION_ID}`;
      sessionConfig.cancel_url = `${origin}/checkout`;
    }

    const planNames: Record<string, string> = { essencial: "Essencial", direcao: "Direção", transformacao: "Transformação" };
    const planDisplayName = planNames[plan] || plan;

    

    if (effectiveTrial) {
      // === PLANO SEMANAL (legado "trial"): mode=payment + setup_future_usage off_session ===
      // === REGRA: Semanal é 1x por cliente (aquisição). Retornantes vão pro recorrente. ===
      // Consulta direta às fontes de verdade (Stripe + Asaas), sem passar por profiles
      // (schema não tem stripe_customer_id; `plan` fica preenchido mesmo em cancelados).
      // 1) Stripe: reusa o resultado da varredura da anti-duplicação (status: all),
      // que já cobriu email + todas as variações de telefone. Zero chamada extra.
      const hasStripeHistory = hasAnyStripeSubscription;
      let hasAsaasHistory = false;

      // 2) Asaas: qualquer pagamento confirmado por email OU telefone (cobre PIX e cartão)
      try {
        const supabaseCheck = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          { auth: { persistSession: false } },
        );
        const { data: asaasPays, error: asaasErr } = await supabaseCheck
          .from("asaas_payments")
          .select("id")
          .or(`customer_email.eq.${email},customer_phone.eq.${phoneClean}`)
          .in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])
          .limit(1);
        if (asaasErr) {
          // Fail-open explícito: logamos e seguimos. Não queremos derrubar checkout
          // por falha transitória do banco, mas o warning fica visível pra ops.
          console.warn("⚠️ Asaas history check failed (non-blocking):", asaasErr.message);
        } else {
          hasAsaasHistory = !!(asaasPays && asaasPays.length > 0);
        }
      } catch (asaasCatch) {
        const msg = asaasCatch instanceof Error ? asaasCatch.message : String(asaasCatch);
        console.warn("⚠️ Asaas history check threw (non-blocking):", msg);
      }

      if (hasStripeHistory || hasAsaasHistory) {
        // Retornante detectado → promoção silenciosa pro Mensal recorrente sem trial.
        // Usa STRIPE_PRICE_*_MONTHLY (recorrente cheio) e cai no else-branch de subscription.
        // O front NÃO recebe 409; o cliente vê o preço real no Embedded Checkout.
        const monthlyPriceId = PRICES[plan].monthly;
        if (!monthlyPriceId) {
          throw new Error("STRIPE_PRICE_*_MONTHLY não configurado — não foi possível promover retornante pra Mensal recorrente.");
        }
        logStep("↩️ Returning customer: promovendo Semanal → Mensal recorrente", {
          email,
          hasStripeHistory,
          hasAsaasHistory,
          fromPlan: plan,
          toPriceId: monthlyPriceId,
        });
        effectiveTrial = false;
        returningCustomerMonthly = true;
        priceId = monthlyPriceId;
      }
    }

    if (effectiveTrial) {

      // Estratégia CIT→MIT: a 1ª cobrança (R$ 6,90/9,90/19,90) já estabelece um mandato
      // off_session reusável. Quando o webhook criar a Subscription com o MESMO PaymentMethod
      // como default, o banco enxerga a 2ª cobrança como continuidade autorizada do mesmo merchant
      // (e não como tentativa órfã), reduzindo do_not_honor.
      const trialPriceIds = getTrialPrices();
      const trialPriceId = trialPriceIds[plan];
      if (!trialPriceId) {
        throw new Error("Trial price ID not configured for this plan. Check STRIPE_PRICE_*_TRIAL env vars.");
      }

      sessionConfig.mode = "payment";
      sessionConfig.payment_method_types = ["card"];

      // Valores do Plano Semanal são fixos e conhecidos — não vale gastar um
      // round-trip `prices.retrieve` no caminho crítico do checkout.
      const TRIAL_AMOUNTS: Record<string, number> = { essencial: 690, direcao: 990, transformacao: 1990 };
      const trialUnitAmount = TRIAL_AMOUNTS[plan] ?? 0;
      if (!trialUnitAmount) {
        throw new Error("Valor do Plano Semanal não configurado para este plano.");
      }
      const trialCurrency = "brl";
      const productName = `AURA — 7 dias ${planDisplayName}`;

      // Usamos product_data inline (name + description) para que a descrição
      // customizada apareça no painel esquerdo (verde) do Stripe Checkout,
      // logo abaixo do preço — exatamente onde o usuário pediu para ver
      // a info de renovação automática.
      sessionConfig.line_items = [{
        quantity: 1,
        price_data: {
          currency: trialCurrency,
          unit_amount: trialUnitAmount,
          product_data: {
            name: productName,
            description: `7 dias de acesso ao plano ${planDisplayName}. Após o período, renova automaticamente por R$ ${displayPrice}/${periodLabel}. Cancele quando quiser.`,
          },
        },
      }];

      // Aviso de renovação já aparece no painel esquerdo (product_data.description),
      // então não duplicamos no custom_text do botão "Pagar".
      sessionConfig.payment_method_options = {
        card: {
          request_three_d_secure: 'automatic',
        },
      };
      // Flag-chave: estabelece mandato MIT desde a 1ª autorização.
      // O PaymentMethod salvo aqui poderá ser cobrado off_session pela Subscription criada no webhook.
      sessionConfig.payment_intent_data = {
        setup_future_usage: 'off_session',
        // === REFORÇO MIT #2: statement_descriptor_suffix ===
        // Padrão estável "AURA*" na fatura é sinal forte de legitimidade
        // pros algoritmos antifraude dos bancos BR (Itaú, Bradesco, Nubank).
        statement_descriptor_suffix: 'SEMANAL',
        description: `AURA ${planDisplayName} — Plano Semanal (7 dias), depois R$ ${displayPrice}/${periodLabel}.`,
        metadata: {
          phone: phoneClean,
          name: name,
          email: email,
          plan: plan,
          billing: billingPeriod,
          trial: "true",
          cit_mit_reinforced: "true",
          mandate_reference: `aura-${customerId}`,
          ...(gaClientId && { ga_client_id: gaClientId }),
        },
      };
      sessionConfig.metadata = {
        phone: phoneClean,
        name: name,
        email: email,
        plan: plan,
        billing: billingPeriod,
        trial_validation: "true",
        cit_mit_reinforced: "true",
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
        ...(gaClientId && { ga_client_id: gaClientId }),
      };
    } else if (isBoletoPayment) {
      // Boleto: one-time payment
      sessionConfig.mode = "payment";
      sessionConfig.line_items = [{ price: priceId, quantity: 1 }];
      sessionConfig.payment_method_types = ["boleto"];
      sessionConfig.payment_method_options = {
        boleto: {
          expires_after_days: 3,
        },
      };
      sessionConfig.metadata = {
        phone: phoneClean,
        name: name,
        email: email,
        plan: plan,
        billing: billingPeriod,
        payment_method: "boleto",
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
        ...(gaClientId && { ga_client_id: gaClientId }),
      };
    } else {
      // Card: subscription
      sessionConfig.mode = "subscription";
      sessionConfig.payment_method_collection = 'always';
      sessionConfig.line_items = [{ price: priceId, quantity: 1 }];
      sessionConfig.payment_method_types = ["card"];
      // Retornante rebaixado do Semanal → deixa claro no botão de pagar
      // que o valor cobrado é o mensal cheio recorrente, sem período de teste.
      if (returningCustomerMonthly) {
        sessionConfig.custom_text = {
          submit: {
            message: `Você já foi cliente da AURA. Esta é a assinatura mensal recorrente de R$ ${displayPrice}/mês. Cancele quando quiser.`,
          },
        };
      }
      sessionConfig.metadata = {
        phone: phoneClean,
        name: name,
        email: email,
        plan: plan,
        billing: billingPeriod,
        ...(isRecurringCardV2 && { payment_method: "card_recurring_v2", v2_no_trial: "true" }),
        ...(returningCustomerMonthly && {
          payment_method: "card_recurring_monthly",
          returning_customer: "true",
          original_flow: "weekly_blocked",
        }),
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
        ...(gaClientId && { ga_client_id: gaClientId }),
      };
      sessionConfig.subscription_data = {
        metadata: {
          phone: phoneClean,
          name: name,
          email: email,
          plan: plan,
          billing: billingPeriod,
          ...(isRecurringCardV2 && { payment_method: "card_recurring_v2", v2_no_trial: "true" }),
          ...(returningCustomerMonthly && {
            payment_method: "card_recurring_monthly",
            returning_customer: "true",
            original_flow: "weekly_blocked",
          }),
          ...(gaClientId && { ga_client_id: gaClientId }),
        },
      };
    }

    logStep("Creating checkout session", { plan, billing: billingPeriod, priceId: effectiveTrial ? getTrialPrices()[plan] : priceId, mode: sessionConfig.mode, trial: effectiveTrial, citMitReinforced: effectiveTrial, returningCustomerMonthly });
    const session = await stripe.checkout.sessions.create(sessionConfig);
    logStep("Checkout session created", { sessionId: session.id });

    // Log checkout session for funnel tracking.
    // `fallback: true` = 2ª chamada do mesmo usuário (widget embedado não montou e
    // caímos no Checkout hospedado). Não duplicamos a linha do funil nesse caso.
    // Gravação fire-and-forget: não faz o cliente esperar pelo log do funil.
    if (fallback) {
      logStep("Fallback session — funnel log skipped");
    } else {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        void (async () => {
          try {
            // Sessão pré-criada enquanto o usuário digitava: se ele corrigiu um
            // dado e geramos outra, limpamos a anterior ainda "created" da última
            // hora pra não duplicar linha de funil nem e-mail de recuperação.
            if (prewarm) {
              await supabase
                .from("checkout_sessions")
                .delete()
                .eq("phone", phoneClean)
                .eq("status", "created")
                .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
            }
            await supabase.from("checkout_sessions").insert({
              phone: phoneClean,
              email: email || null,
              name: name,
              plan: plan,
              billing: billingPeriod,
              payment_method: isBoletoPayment ? "boleto" : "card",
              stripe_session_id: session.id,
              status: "created",
            });
            logStep("Checkout session logged to DB");
          } catch (e) {
            console.warn("⚠️ Failed to log checkout session (non-blocking):", (e as Error)?.message || e);
          }
        })();
      } catch (dbErr) {
        console.warn("⚠️ Failed to log checkout session (non-blocking):", dbErr);
      }
    }

    // Para modo embedded devolvemos client_secret + chave publicável (pra montar <EmbeddedCheckoutProvider>).
    // Para modo hospedado tradicional, mantemos o comportamento atual (url do Checkout Stripe).
    const responseBody: Record<string, unknown> = embedded
      ? {
          clientSecret: (session as any).client_secret,
          publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") || null,
          sessionId: session.id,
          returning_customer: returningCustomerMonthly,
          serverMs: Date.now() - reqStart,
        }
      : { url: session.url, returning_customer: returningCustomerMonthly, serverMs: Date.now() - reqStart };
    logStep("Done", { serverMs: Date.now() - reqStart });

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    
    const isValidationError = errorMessage.includes("Invalid plan") || 
                              errorMessage.includes("Name and phone") ||
                              errorMessage.includes("Invalid billing");
    
    return new Response(JSON.stringify({ 
      error: isValidationError ? errorMessage : "Erro ao processar pagamento. Tente novamente." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isValidationError ? 400 : 500,
    });
  }
});
