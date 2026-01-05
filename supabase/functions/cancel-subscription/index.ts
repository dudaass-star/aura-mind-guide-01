import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-SUBSCRIPTION] ${step}${detailsStr}`);
};

const CANCELLATION_REASONS = [
  { id: 'expensive', label: 'Está caro pra mim' },
  { id: 'not_using', label: 'Não estou usando' },
  { id: 'not_satisfied', label: 'Não gostei do serviço' },
  { id: 'come_back_later', label: 'Vou voltar depois' },
  { id: 'other', label: 'Outro motivo' },
];

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    logStep("Stripe key verified");

    const { phone, action, reason, reason_detail } = await req.json();
    logStep("Request received", { phone, action, reason });

    if (!phone) {
      throw new Error("Phone number is required");
    }

    // Clean phone number - remove all non-digits except leading +
    let phoneClean = phone.replace(/\D/g, "");
    
    // Ensure it starts with country code (55 for Brazil)
    if (!phoneClean.startsWith("55")) {
      phoneClean = "55" + phoneClean;
    }
    
    logStep("Phone cleaned", { phoneClean });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Search for customer by phone in metadata
    const customers = await stripe.customers.search({
      query: `metadata['phone']:'${phoneClean}'`,
      limit: 1,
    });

    logStep("Customer search result", { found: customers.data.length > 0 });

    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Nenhuma assinatura encontrada para este telefone" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const customer = customers.data[0];
    logStep("Customer found", { customerId: customer.id });

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
    });

    logStep("Subscriptions found", { count: subscriptions.data.length });

    if (subscriptions.data.length === 0) {
      // Check for subscriptions that are already set to cancel or paused
      const allSubscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 1,
      });

      const cancelingSub = allSubscriptions.data.find((s: Stripe.Subscription) => s.cancel_at_period_end);
      const pausedSub = allSubscriptions.data.find((s: Stripe.Subscription) => s.pause_collection);
      
      if (pausedSub && pausedSub.pause_collection) {
        const resumesAt = pausedSub.pause_collection.resumes_at 
          ? new Date(pausedSub.pause_collection.resumes_at * 1000)
          : null;
        return new Response(
          JSON.stringify({
            success: true,
            status: "paused",
            subscription: {
              id: pausedSub.id,
              plan: pausedSub.items.data[0]?.price?.nickname || "Assinatura AURA",
              resumesAt: resumesAt?.toISOString(),
              resumesAtFormatted: resumesAt?.toLocaleDateString('pt-BR'),
            },
            message: "Sua assinatura está pausada"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      if (cancelingSub) {
        const endDate = new Date(cancelingSub.current_period_end * 1000);
        return new Response(
          JSON.stringify({
            success: true,
            status: "canceling",
            subscription: {
              id: cancelingSub.id,
              plan: cancelingSub.items.data[0]?.price?.nickname || "Assinatura AURA",
              endDate: endDate.toISOString(),
              endDateFormatted: endDate.toLocaleDateString('pt-BR'),
            },
            message: "Sua assinatura já está programada para cancelamento"
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Nenhuma assinatura ativa encontrada" 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const subscription = subscriptions.data[0];
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    // If action is "check", just return subscription info
    if (action === "check") {
      logStep("Returning subscription info for check");
      return new Response(
        JSON.stringify({
          success: true,
          status: "active",
          subscription: {
            id: subscription.id,
            plan: subscription.items.data[0]?.price?.nickname || "Assinatura AURA",
            endDate: currentPeriodEnd.toISOString(),
            endDateFormatted: currentPeriodEnd.toLocaleDateString('pt-BR'),
            amount: subscription.items.data[0]?.price?.unit_amount 
              ? (subscription.items.data[0].price.unit_amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : null,
          },
          reasons: CANCELLATION_REASONS,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // If action is "pause", pause the subscription for 30 days
    if (action === "pause") {
      logStep("Pausing subscription for 30 days", { subscriptionId: subscription.id });
      
      const resumesAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days from now
      
      await stripe.subscriptions.update(subscription.id, {
        pause_collection: {
          behavior: 'void',
          resumes_at: resumesAt,
        },
      });

      // Save feedback
      await supabase.from('cancellation_feedback').insert({
        phone: phoneClean,
        reason: reason || 'pause_requested',
        reason_detail: reason_detail || null,
        action_taken: 'paused',
        pause_until: new Date(resumesAt * 1000).toISOString(),
      });

      // Update profile status
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ status: "paused" })
        .eq("phone", phoneClean);

      if (updateError) {
        logStep("Warning: Failed to update profile status", { error: updateError.message });
      }

      const resumesAtDate = new Date(resumesAt * 1000);

      return new Response(
        JSON.stringify({
          success: true,
          status: "paused",
          message: `Sua assinatura foi pausada. Ela será reativada automaticamente em ${resumesAtDate.toLocaleDateString('pt-BR')}.`,
          subscription: {
            id: subscription.id,
            resumesAt: resumesAtDate.toISOString(),
            resumesAtFormatted: resumesAtDate.toLocaleDateString('pt-BR'),
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // If action is "cancel", cancel the subscription at period end
    if (action === "cancel") {
      logStep("Canceling subscription at period end", { subscriptionId: subscription.id });
      
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });

      // Save feedback
      if (reason) {
        await supabase.from('cancellation_feedback').insert({
          phone: phoneClean,
          reason: reason,
          reason_detail: reason_detail || null,
          action_taken: 'canceled',
        });
      }

      // Update profile status in database
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ status: "canceling" })
        .eq("phone", phoneClean);

      if (updateError) {
        logStep("Warning: Failed to update profile status", { error: updateError.message });
      } else {
        logStep("Profile status updated to canceling");
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "canceled",
          message: `Sua assinatura foi cancelada. Você terá acesso até ${currentPeriodEnd.toLocaleDateString('pt-BR')}.`,
          subscription: {
            id: subscription.id,
            endDate: currentPeriodEnd.toISOString(),
            endDateFormatted: currentPeriodEnd.toLocaleDateString('pt-BR'),
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    throw new Error("Invalid action. Use 'check', 'pause', or 'cancel'.");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
