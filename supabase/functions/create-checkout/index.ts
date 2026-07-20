import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

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
    quarterly: "price_1TZyoCQU15XnZ7VvyI45t8um",
    semestral: "price_1TZyoDQU15XnZ7VvOegMIXQi",
    yearly:    "price_1TZyoEQU15XnZ7Vvx02qKKPF",
  },
  direcao: {
    quarterly: "price_1TZyoFQU15XnZ7VvAfRFoTOh",
    semestral: "price_1TZyoGQU15XnZ7VvZiGk2ifY",
    yearly:    "price_1TZyoHQU15XnZ7VvwUFUX9Bm",
  },
  transformacao: {
    quarterly: "price_1TZyoIQU15XnZ7VvCMjzuaZr",
    semestral: "price_1TZyoJQU15XnZ7Vv3FqH75Nb",
    yearly:    "price_1TZyoKQU15XnZ7VvJzJNnub7",
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const { plan: requestedPlan, billing = "monthly", name, email, phone, trial, paymentMethod, fbp, fbc, gaClientId, embedded } = await req.json();
    
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
    logStep("Searching with phone variations", { phoneVariations });
    
    let existingCustomer = null;
    for (const phoneVar of phoneVariations) {
      const customers = await stripe.customers.search({
        query: `metadata['phone']:'${phoneVar}'`,
        limit: 1,
      });
      if (customers.data.length > 0) {
        existingCustomer = customers.data[0];
        break;
      }
    }

    // Fallback: search by email if not found by phone
    if (!existingCustomer && email) {
      const customersByEmail = await stripe.customers.search({
        query: `email:'${email}'`,
        limit: 1,
      });
      if (customersByEmail.data.length > 0) {
        existingCustomer = customersByEmail.data[0];
        logStep("Found customer by email fallback", { customerId: existingCustomer.id });
      }
    }

    if (existingCustomer) {
      customerId = existingCustomer.id;
      logStep("Found existing customer", { customerId });

      // === ANTI-DUPLICAÇÃO: bloquear se já existe assinatura ativa ===
      // Verifica TODOS os customers que batem por phone OU email (não só o primeiro)
      // para evitar caso de customers duplicados com sub ativa em qualquer um deles.
      try {
        const customersToCheck = new Map<string, true>();
        customersToCheck.set(customerId, true);

        // Buscar TODOS por email (pode haver mais de um customer com mesmo email)
        if (email) {
          const allByEmail = await stripe.customers.list({ email, limit: 10 });
          for (const c of allByEmail.data) customersToCheck.set(c.id, true);
        }
        // Buscar TODOS por variações de telefone
        for (const phoneVar of phoneVariations) {
          const allByPhone = await stripe.customers.search({
            query: `metadata['phone']:'${phoneVar}'`,
            limit: 10,
          });
          for (const c of allByPhone.data) customersToCheck.set(c.id, true);
        }

        logStep("Anti-dup: checking active subscriptions", { customerCount: customersToCheck.size });

        for (const cid of customersToCheck.keys()) {
          const subs = await stripe.subscriptions.list({
            customer: cid,
            status: 'active',
            limit: 5,
          });
          const trialing = await stripe.subscriptions.list({
            customer: cid,
            status: 'trialing',
            limit: 5,
          });
          if (subs.data.length > 0 || trialing.data.length > 0) {
            const activeSub = subs.data[0] || trialing.data[0];
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
        logStep("✅ Anti-dup: no active subscription, OK to proceed");
      } catch (dupErr) {
        // Não-bloqueante: se a checagem falhar, prosseguir (não queremos quebrar o checkout por isso)
        const msg = dupErr instanceof Error ? dupErr.message : String(dupErr);
        if (msg.includes("ACTIVE_SUBSCRIPTION_EXISTS")) throw dupErr;
        console.warn("⚠️ Anti-dup check failed (non-blocking):", msg);
      }

      await stripe.customers.update(customerId, {
        email: email,
        name: name,
        metadata: {
          phone: phoneClean,
        },
      });
    } else {
      const newCustomer = await stripe.customers.create({
        name: name,
        email: email,
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
      essencial:     { monthly: "29,90", quarterly: "79,90",  semestral: "125,90", yearly: "214,90" },
      direcao:       { monthly: "49,90", quarterly: "133,90", semestral: "209,90", yearly: "359,90" },
      transformacao: { monthly: "79,90", quarterly: "213,90", semestral: "335,90", yearly: "574,90" },
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
      let hasStripeHistory = false;
      let hasAsaasHistory = false;

      // 1) Stripe: reusa varredura por email + variações de telefone (mesma da anti-dup)
      const stripeCustomersToScan = new Map<string, true>();
      const byEmail = await stripe.customers.list({ email, limit: 10 });
      for (const c of byEmail.data) stripeCustomersToScan.set(c.id, true);
      for (const phoneVar of phoneVariations) {
        const byPhone = await stripe.customers.search({
          query: `metadata['phone']:'${phoneVar}'`,
          limit: 10,
        });
        for (const c of byPhone.data) stripeCustomersToScan.set(c.id, true);
      }
      for (const cid of stripeCustomersToScan.keys()) {
        const anySubs = await stripe.subscriptions.list({
          customer: cid,
          status: "all",
          limit: 3,
        });
        if (anySubs.data.length > 0) {
          hasStripeHistory = true;
          break;
        }
      }

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

      // Buscar o trial Price do Stripe para extrair unit_amount/currency e reusar product_id.
      // Em seguida, montamos um price_data inline com product_data.description customizada
      // para que o Stripe Checkout exiba "Após 7 dias: R$ XX/mês" sob o nome do produto.
      const trialPriceObj = await stripe.prices.retrieve(trialPriceId, { expand: ["product"] });
      const trialUnitAmount = trialPriceObj.unit_amount ?? 0;
      const trialCurrency = trialPriceObj.currency || "brl";
      const trialProductObj = typeof trialPriceObj.product === "string"
        ? null
        : (trialPriceObj.product as Stripe.Product);
      const productName = trialProductObj?.name || `AURA — 7 dias ${planDisplayName}`;

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

    // Log checkout session for funnel tracking
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
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
    } catch (dbErr) {
      console.warn("⚠️ Failed to log checkout session (non-blocking):", dbErr);
    }

    // Para modo embedded devolvemos client_secret + chave publicável (pra montar <EmbeddedCheckoutProvider>).
    // Para modo hospedado tradicional, mantemos o comportamento atual (url do Checkout Stripe).
    const responseBody: Record<string, unknown> = embedded
      ? {
          clientSecret: (session as any).client_secret,
          publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") || null,
          sessionId: session.id,
          returning_customer: returningCustomerMonthly,
        }
      : { url: session.url, returning_customer: returningCustomerMonthly };

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
