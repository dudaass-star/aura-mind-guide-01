import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getPhoneVariations } from "../_shared/zapi-client.ts";

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

// Preços Stripe dos planos de retenção (criados via API, ver plano)
const RETENTION_PRICES = {
  lite: "price_1TwR9yQU15XnZ7Vv59okBz23", // R$19,90
  base: "price_1TwRA2QU15XnZ7Vvt0zU4HNa", // R$9,90
} as const;

type RetentionTier = "pause" | "discount_30" | "lite" | "base";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

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

    const { phone, action, reason, reason_detail, pause_days } = await req.json();
    logStep("Request received", { phone, action, reason });

    if (!phone) {
      throw new Error("Phone number is required");
    }

    // Clean phone number - remove all non-digits
    let phoneClean = phone.replace(/\D/g, "");
    
    logStep("Phone cleaned", { phoneClean });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Descobre o perfil (user_id, gateway, nome) pela variação de telefone
    let profile: {
      user_id: string | null;
      name: string | null;
      card_gateway: string | null;
    } | null = null;
    {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, name, card_gateway")
        .eq("phone", phoneClean)
        .maybeSingle();
      if (data) profile = data as any;
    }

    // Search for customer by phone in metadata using all variations
    const phoneVariations = getPhoneVariations(phoneClean);
    logStep("Searching with phone variations", { phoneVariations });
    
    let customer: Stripe.Customer | null = null;
    for (const phoneVar of phoneVariations) {
      const customers = await stripe.customers.search({
        query: `metadata['phone']:'${phoneVar}'`,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customer = customers.data[0];
        break;
      }
    }

    logStep("Customer search result", { found: !!customer });

    if (!customer) {
      // Cliente não é Stripe: retorna sinal para o frontend redirecionar ao suporte
      // para todas as ações da escada. Mantém compatibilidade quando action=check.
      if (action && action !== "check") {
        return jsonResponse({
          success: false,
          gateway_unsupported: true,
          gateway: profile?.card_gateway ?? null,
          message:
            "Sua assinatura está em outra forma de pagamento. Fale com nosso suporte pelo WhatsApp que a gente ajusta pra você.",
        });
      }
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

    logStep("Customer found", { customerId: customer.id });

    // Get active subscriptions first, then fallback to past_due
    const activeSubscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
    });

    let subscriptions = activeSubscriptions;

    if (activeSubscriptions.data.length === 0) {
      logStep("No active subscription, checking past_due");
      const pastDueSubscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "past_due",
        limit: 1,
      });
      subscriptions = pastDueSubscriptions;
    }

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
        const rawResumes = pausedSub.pause_collection.resumes_at;
        const resumesAt = rawResumes
          ? (typeof rawResumes === 'string' ? new Date(rawResumes) : new Date(rawResumes * 1000))
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
        const rawCancelEnd = cancelingSub.items.data[0]?.current_period_end;
        const endDate = typeof rawCancelEnd === 'string' ? new Date(rawCancelEnd) : new Date((rawCancelEnd ?? 0) * 1000);
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
    const rawEnd = subscription.items.data[0]?.current_period_end;
    logStep("Raw current_period_end value", { rawEnd, type: typeof rawEnd });
    const currentPeriodEnd = typeof rawEnd === 'string' ? new Date(rawEnd) : new Date((rawEnd ?? 0) * 1000);

    // Helper: registra evento de retenção
    const logRetention = async (
      tier: RetentionTier | "cancel",
      actionName: "offered" | "accepted" | "declined" | "applied",
      extra: Record<string, unknown> = {}
    ) => {
      try {
        await supabase.from("retention_events").insert({
          user_id: profile?.user_id ?? null,
          phone: phoneClean,
          origin: "cancel_flow",
          tier,
          action: actionName,
          gateway: "stripe",
          channel: "web",
          metadata: extra,
        });
      } catch (e) {
        logStep("WARN retention_events insert failed", { e: (e as Error).message });
      }
    };

    // Helper: verifica se já usou o desconto 30% nos últimos 12 meses (anti-abuso)
    const hasRecentDiscount = async (): Promise<boolean> => {
      if (!profile?.user_id) return false;
      const twelveMonthsAgo = new Date(
        Date.now() - 365 * 24 * 60 * 60 * 1000
      ).toISOString();
      const { data } = await supabase
        .from("cancellation_feedback")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("save_tier", "discount_30")
        .eq("save_offer_accepted", true)
        .gte("created_at", twelveMonthsAgo)
        .limit(1);
      return !!data && data.length > 0;
    };

    // Helper: Value Recap — puxa histórico do usuário para exibir antes das ofertas
    const buildValueRecap = async () => {
      if (!profile?.user_id) return null;
      const [{ count: sessionsCount }, { data: snapshots }] = await Promise.all([
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.user_id)
          .eq("status", "completed"),
        supabase
          .from("thematic_snapshots")
          .select("theme, before_summary, after_summary, confidence, created_at")
          .eq("user_id", profile.user_id)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      return {
        name: profile.name,
        sessions_count: sessionsCount ?? 0,
        snapshots: (snapshots ?? []).filter(
          (s: any) => s.confidence === "high" || s.confidence === "medium"
        ),
      };
    };

    // If action is "check", just return subscription info
    if (action === "check") {
      logStep("Returning subscription info for check");
      const valueRecap = await buildValueRecap();
      const discountUsedRecently = await hasRecentDiscount();
      return new Response(
        JSON.stringify({
          success: true,
          status: "active",
          gateway: "stripe",
          subscription: {
            id: subscription.id,
            plan: subscription.items.data[0]?.price?.nickname || "Assinatura AURA",
            endDate: currentPeriodEnd.toISOString(),
            endDateFormatted: currentPeriodEnd.toLocaleDateString('pt-BR'),
            amount: subscription.items.data[0]?.price?.unit_amount 
              ? (subscription.items.data[0].price.unit_amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : null,
            amount_cents: subscription.items.data[0]?.price?.unit_amount ?? null,
            price_id: subscription.items.data[0]?.price?.id ?? null,
          },
          value_recap: valueRecap,
          discount_available: !discountUsedRecently,
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
      const days = [30, 60, 90].includes(Number(pause_days))
        ? Number(pause_days)
        : 30;
      logStep("Pausing subscription", { subscriptionId: subscription.id, days });

      const resumesAt = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
      
      await stripe.subscriptions.update(subscription.id, {
        pause_collection: {
          behavior: 'void',
          resumes_at: resumesAt,
        },
      });

      await supabase.from('cancellation_feedback').insert({
        phone: phoneClean,
        user_id: profile?.user_id || null,
        reason: reason || 'pause_requested',
        reason_detail: reason_detail || null,
        action_taken: 'paused',
        pause_until: new Date(resumesAt * 1000).toISOString(),
        save_offer_accepted: true,
        save_tier: 'pause',
        gateway: 'stripe',
      });
      await logRetention('pause', 'accepted', { days });
      await logRetention('pause', 'applied', { days });

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
          message: `Sua assinatura foi pausada por ${days} dias. Ela volta automaticamente em ${resumesAtDate.toLocaleDateString('pt-BR')}.`,
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

    // Ação: aplicar 30% de desconto por 3 meses (cupom Stripe nativo)
    if (action === "apply_discount_3m") {
      if (await hasRecentDiscount()) {
        return jsonResponse({
          success: false,
          message:
            "Você já usou o desconto de retenção nos últimos 12 meses. Que tal experimentar um plano mais leve?",
          discount_available: false,
        });
      }

      logStep("Applying 30% discount 3m", { subscriptionId: subscription.id });
      // Cria coupon efêmero + aplica na subscription (evita gerenciar cupons globais)
      const coupon = await stripe.coupons.create({
        percent_off: 30,
        duration: "repeating",
        duration_in_months: 3,
        name: "Retenção 30% off - 3 meses",
        metadata: { reason: reason || "unknown", phone: phoneClean },
      });
      await stripe.subscriptions.update(subscription.id, {
        coupon: coupon.id,
      });

      await supabase.from("cancellation_feedback").insert({
        phone: phoneClean,
        user_id: profile?.user_id || null,
        reason: reason || "expensive",
        reason_detail: reason_detail || null,
        action_taken: "discount_30",
        save_offer_accepted: true,
        save_tier: "discount_30",
        gateway: "stripe",
      });
      await logRetention("discount_30", "accepted", { coupon_id: coupon.id });
      await logRetention("discount_30", "applied", { coupon_id: coupon.id });

      return jsonResponse({
        success: true,
        status: "discount_applied",
        message:
          "Pronto! Você tem 30% de desconto nas próximas 3 cobranças. Depois disso o valor volta ao normal.",
        tier: "discount_30",
      });
    }

    // Ações: downgrade para Lite (R$19,90) ou Base (R$9,90)
    if (action === "downgrade_to_lite" || action === "downgrade_to_base") {
      const tier: "lite" | "base" =
        action === "downgrade_to_lite" ? "lite" : "base";
      const newPriceId = RETENTION_PRICES[tier];
      const itemId = subscription.items.data[0]?.id;
      if (!itemId) {
        return jsonResponse(
          { success: false, message: "Não consegui identificar o item da assinatura." },
          200
        );
      }

      logStep(`Downgrading to ${tier}`, { subscriptionId: subscription.id });
      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "none",
        cancel_at_period_end: false,
        // Se estava pausada, remove pausa
        pause_collection: "",
      } as any);

      // Atualiza plan_tier no perfil (não mexe em profiles.plan pra não quebrar outras integrações)
      if (profile?.user_id) {
        await supabase
          .from("profiles")
          .update({ plan_tier: tier, status: "active" })
          .eq("user_id", profile.user_id);
      }

      await supabase.from("cancellation_feedback").insert({
        phone: phoneClean,
        user_id: profile?.user_id || null,
        reason: reason || "expensive",
        reason_detail: reason_detail || null,
        action_taken: `downgrade_${tier}`,
        save_offer_accepted: true,
        save_tier: tier,
        gateway: "stripe",
      });
      await logRetention(tier, "accepted");
      await logRetention(tier, "applied");

      const price = tier === "lite" ? "R$ 19,90" : "R$ 9,90";
      return jsonResponse({
        success: true,
        status: "downgraded",
        tier,
        message: `Assinatura ajustada para o plano ${
          tier === "lite" ? "Lite" : "Base"
        } (${price}/mês). Seu histórico continua intacto.`,
      });
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
          user_id: profile?.user_id || null,
          reason: reason,
          reason_detail: reason_detail || null,
          action_taken: 'canceled',
          save_offer_accepted: false,
          gateway: 'stripe',
        });
      }
      await logRetention('cancel', 'applied', { reason });

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

    throw new Error(
      "Invalid action. Use 'check', 'pause', 'apply_discount_3m', 'downgrade_to_lite', 'downgrade_to_base' or 'cancel'."
    );

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
