import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs from Stripe
const PRICES = {
  mensal: "price_1Sk430QU15XnZ7Vv4kJnpnJQ", // R$ 27,90/mês
  anual: "price_1Sk43qQU15XnZ7VvW1LOB94d",  // R$ 239,90/ano
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

    const { plan, name, phone, paymentMethod } = await req.json();
    logStep("Request received", { plan, name, phone, paymentMethod });

    if (!plan || !PRICES[plan as keyof typeof PRICES]) {
      throw new Error("Invalid plan selected");
    }

    if (!name || !phone) {
      throw new Error("Name and phone are required");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Format phone for metadata
    const phoneClean = phone.replace(/\D/g, "");

    // Always create or find a customer first (required for Stripe Accounts V2)
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

    // Create checkout session - customer is always set now
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: PRICES[plan as keyof typeof PRICES],
          quantity: 1,
        },
      ],
      mode: "subscription",
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
    };

    // Add payment method types based on selection
    if (plan === "anual" && paymentMethod === "pix") {
      sessionConfig.payment_method_types = ["pix"];
    } else {
      sessionConfig.payment_method_types = ["card"];
    }

    logStep("Creating checkout session", { plan, paymentMethod });
    const session = await stripe.checkout.sessions.create(sessionConfig);
    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
