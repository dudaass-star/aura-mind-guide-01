import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { plan: requestedPlan, billing = "monthly", name, email, phone, trial, paymentMethod, fbp, fbc } = await req.json();
    
    const plan = requestedPlan;
    const billingOverride = billing;
    const isBoletoPayment = paymentMethod === "boleto" && billingOverride === "yearly";
    
    logStep("Request received", { plan, billing: billingOverride, name, email, phone, trial: !!trial, paymentMethod, isBoleto: isBoletoPayment, hasFbp: !!fbp, hasFbc: !!fbc });

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

    // Validate billing period
    const billingPeriod = billingOverride === "yearly" ? "yearly" : "monthly";
    
    // Select the correct price ID
    let priceId: string;
    if (isBoletoPayment) {
      priceId = PRICES[plan].boletoYearly;
    } else {
      priceId = PRICES[plan][billingPeriod];
    }

    if (!priceId) {
      throw new Error("Price ID not configured for this plan. Check environment variables.");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

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

    if (existingCustomer) {
      customerId = existingCustomer.id;
      logStep("Found existing customer", { customerId });
      
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

    const origin = req.headers.get("origin") || "https://aura.lovable.app";

    // Build checkout session config
    const sessionConfig: any = {
      customer: customerId,
      locale: "pt-BR",
      success_url: `${origin}/obrigado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
    };

    const planNames: Record<string, string> = { essencial: "Essencial", direcao: "Direção", transformacao: "Transformação" };
    const planDisplayName = planNames[plan] || plan;

    if (trial) {
      // === TRIAL: R$1 validation charge (refunded after card check) ===
      sessionConfig.mode = "payment";
      sessionConfig.line_items = [{
        price_data: {
          currency: 'brl',
          unit_amount: 100,
          product_data: {
            name: `AURA — Ativação do Plano ${planDisplayName}`,
            description: 'Verificação de segurança. Valor estornado automaticamente.',
          },
        },
        quantity: 1,
      }];
      sessionConfig.payment_method_types = ["card"];
      sessionConfig.payment_method_options = {
        card: {
          setup_future_usage: 'off_session',
          request_three_d_secure: 'any',
        },
      };
      sessionConfig.metadata = {
        phone: phoneClean,
        name: name,
        email: email,
        plan: plan,
        billing: billingPeriod,
        trial_validation: "true",
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
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
      };
    } else {
      // Card: subscription
      sessionConfig.mode = "subscription";
      sessionConfig.payment_method_collection = 'always';
      sessionConfig.line_items = [{ price: priceId, quantity: 1 }];
      sessionConfig.payment_method_types = ["card"];
      sessionConfig.payment_method_options = {
        card: {
          setup_future_usage: 'off_session',
        },
      };
      sessionConfig.metadata = {
        phone: phoneClean,
        name: name,
        email: email,
        plan: plan,
        billing: billingPeriod,
        ...(fbp && { fbp }),
        ...(fbc && { fbc }),
      };
      sessionConfig.subscription_data = {
        metadata: {
          phone: phoneClean,
          name: name,
          email: email,
          plan: plan,
          billing: billingPeriod,
        },
      };
    }

    logStep("Creating checkout session", { plan, billing: billingPeriod, priceId: trial ? TRIAL_VALIDATION_PRICE_ID : priceId, mode: sessionConfig.mode, trial: !!trial });
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

    return new Response(JSON.stringify({ url: session.url }), {
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
