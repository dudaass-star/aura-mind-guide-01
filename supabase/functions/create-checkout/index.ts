import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs from environment variables (configurable for sandbox/production)
const getPrices = (): Record<string, { monthly: string; yearly: string }> => ({
  essencial: {
    monthly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_YEARLY") || "",
  },
  direcao: {
    monthly: Deno.env.get("STRIPE_PRICE_DIRECAO_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_DIRECAO_YEARLY") || "",
  },
  transformacao: {
    monthly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_MONTHLY") || "",
    yearly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_YEARLY") || "",
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

    const { plan, billing = "monthly", name, email, phone } = await req.json();
    logStep("Request received", { plan, billing, name, email, phone });

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
    const billingPeriod = billing === "yearly" ? "yearly" : "monthly";
    const priceId = PRICES[plan][billingPeriod];

    if (!priceId) {
      throw new Error("Price ID not configured for this plan. Check environment variables.");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Clean and validate phone number
    const phoneClean = phone.replace(/\D/g, "");
    
    // Validate phone: 10-15 digits (E.164 standard, Brazil: 10-13 with country code)
    if (!/^[0-9]{10,15}$/.test(phoneClean)) {
      logStep("Invalid phone format", { phoneLength: phoneClean.length });
      return new Response(JSON.stringify({ error: "Número de telefone inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Always create or find a customer first
    let customerId: string;
    
    // Buscar cliente com variações do telefone (com/sem 9)
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
      
      // Update existing customer with latest email if needed
      await stripe.customers.update(customerId, {
        email: email,
        name: name,
      });
    } else {
      // Create a new customer with email
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

    // Create checkout session
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      locale: "pt-BR",
      success_url: `${origin}/obrigado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      metadata: {
        phone: phoneClean,
        name: name,
        email: email,
        plan: plan,
        billing: billingPeriod,
      },
      subscription_data: {
        metadata: {
          phone: phoneClean,
          name: name,
          email: email,
          plan: plan,
          billing: billingPeriod,
        },
      },
      payment_method_types: ["card"],
    };

    logStep("Creating checkout session", { plan, billing: billingPeriod, priceId });
    const session = await stripe.checkout.sessions.create(sessionConfig);
    logStep("Checkout session created", { sessionId: session.id });

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