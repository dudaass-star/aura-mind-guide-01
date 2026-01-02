import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs from Stripe - New Plans
const PRICES: Record<string, string> = {
  essencial: "price_1SlEYjHMRAbm8MiTB689p4b6",     // R$ 29,90/mês
  direcao: "price_1SlEb6HMRAbm8MiTz4H3EBDT",       // R$ 49,90/mês
  transformacao: "price_1SlEcKHMRAbm8MiTLWgfYHAV", // R$ 79,90/mês
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

    const { plan, name, phone } = await req.json();
    logStep("Request received", { plan, name, phone });

    if (!plan || !PRICES[plan]) {
      throw new Error("Invalid plan selected");
    }

    if (!name || !phone) {
      throw new Error("Name and phone are required");
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
    
    // Check if customer already exists with this phone
    const customers = await stripe.customers.search({
      query: `metadata['phone']:'${phoneClean}'`,
      limit: 1,
    });

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    } else {
      // Create a new customer
      const newCustomer = await stripe.customers.create({
        name: name,
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
          price: PRICES[plan],
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
        plan: plan,
      },
      subscription_data: {
        metadata: {
          phone: phoneClean,
          name: name,
          plan: plan,
        },
      },
      payment_method_types: ["card"],
    };

    logStep("Creating checkout session", { plan });
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
                              errorMessage.includes("Name and phone");
    
    return new Response(JSON.stringify({ 
      error: isValidationError ? errorMessage : "Erro ao processar pagamento. Tente novamente." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isValidationError ? 400 : 500,
    });
  }
});
