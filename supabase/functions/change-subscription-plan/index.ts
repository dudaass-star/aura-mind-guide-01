// Edge function: change-subscription-plan
// Troca o plano da assinatura ativa do usuário (Stripe subscription_item swap)
// com proração automática. Reaproveita o método de pagamento já cadastrado.
// Bloqueia: trial em curso, assinaturas PIX/Boleto/Trial, plano igual ao atual,
// assinaturas com cancel_at_period_end ou status canceled.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHANGE-SUBSCRIPTION-PLAN] ${step}${detailsStr}`);
};

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingCycle = "monthly" | "quarterly" | "semiannual" | "yearly";

const PLAN_NAMES: Record<PlanId, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

// Mesmos IDs hardcoded em create-checkout/index.ts (RECURRING_PRICES).
// Fonte única pra Trim/Sem/Anual. Mensal continua via env.
const RECURRING_PRICES: Record<PlanId, { quarterly: string; semiannual: string; yearly: string }> = {
  essencial: {
    quarterly: "price_1TZyoCQU15XnZ7VvyI45t8um",
    semiannual: "price_1TZyoDQU15XnZ7VvOegMIXQi",
    yearly:     "price_1TZyoEQU15XnZ7Vvx02qKKPF",
  },
  direcao: {
    quarterly: "price_1TZyoFQU15XnZ7VvAfRFoTOh",
    semiannual: "price_1TZyoGQU15XnZ7VvZiGk2ifY",
    yearly:     "price_1TZyoHQU15XnZ7VvwUFUX9Bm",
  },
  transformacao: {
    quarterly: "price_1TZyoIQU15XnZ7VvCMjzuaZr",
    semiannual: "price_1TZyoJQU15XnZ7Vv3FqH75Nb",
    yearly:     "price_1TZyoKQU15XnZ7VvJzJNnub7",
  },
};

function resolvePriceId(plan: PlanId, billing: BillingCycle): string | null {
  if (billing === "monthly") {
    const value = Deno.env.get(`STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY`);
    return value && value.length > 0 ? value : null;
  }
  const cycleKey = billing as "quarterly" | "semiannual" | "yearly";
  return RECURRING_PRICES[plan]?.[cycleKey] ?? null;
}

// Conjunto de price IDs "bloqueados" (PIX/Boleto/Trial) — usuário precisa falar
// com suporte ou renovar via novo checkout pra sair desses.
function getBlockedPriceIds(): Set<string> {
  const ids = [
    "STRIPE_PRICE_ESSENCIAL_TRIAL",
    "STRIPE_PRICE_DIRECAO_TRIAL",
    "STRIPE_PRICE_TRANSFORMACAO_TRIAL",
    "STRIPE_PRICE_ESSENCIAL_PIX_YEARLY",
    "STRIPE_PRICE_DIRECAO_PIX_YEARLY",
    "STRIPE_PRICE_TRANSFORMACAO_PIX_YEARLY",
  ]
    .map((k) => Deno.env.get(k))
    .filter((v): v is string => !!v && v.length > 0);
  return new Set(ids);
}

function detectPlanAndBilling(
  priceId: string,
): { plan: PlanId; billing: BillingCycle } | null {
  const plans: PlanId[] = ["essencial", "direcao", "transformacao"];
  const billings: BillingCycle[] = ["monthly", "quarterly", "semiannual", "yearly"];
  for (const plan of plans) {
    for (const billing of billings) {
      if (resolvePriceId(plan, billing) === priceId) return { plan, billing };
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const body = await req.json().catch(() => ({}));
    const { userId, targetPlan, billing } = body as {
      userId?: string;
      targetPlan?: string;
      billing?: string;
    };

    if (!userId || typeof userId !== "string") {
      return jsonError("userId é obrigatório", 400);
    }
    if (!["essencial", "direcao", "transformacao"].includes(targetPlan ?? "")) {
      return jsonError("Plano inválido", 400);
    }
    if (!["monthly", "quarterly", "semiannual", "yearly"].includes(billing ?? "")) {
      return jsonError("Ciclo de cobrança inválido", 400);
    }
    const plan = targetPlan as PlanId;
    const cycle = billing as BillingCycle;

    const targetPriceId = resolvePriceId(plan, cycle);
    if (!targetPriceId) {
      logStep("ERROR price id not configured", { plan, cycle });
      return jsonError(
        "Esse plano não está disponível no momento. Tenta de novo daqui a pouco ou fala com a gente.",
        500,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id, email, phone, plan, asaas_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) throw new Error(`profile lookup: ${profileErr.message}`);
    if (!profile) return jsonError("Perfil não encontrado", 404);
    logStep("Profile loaded", { email: profile.email, plan: profile.plan });

    // Bloqueia troca direta pra usuários PIX Asaas (sub recorrente).
    // Detecção: existe pelo menos uma asaas_payment com asaas_subscription_id ativo.
    if (profile.asaas_customer_id) {
      const { data: asaasActive } = await supabase
        .from("asaas_payments")
        .select("asaas_subscription_id, status")
        .eq("user_id", userId)
        .not("asaas_subscription_id", "is", null)
        .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "RECEIVED_IN_CASH"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (asaasActive && asaasActive.length > 0) {
        logStep("Asaas PIX recurring detected, blocking", { subId: asaasActive[0].asaas_subscription_id });
        return jsonError(
          "Sua assinatura é PIX recorrente. Pra trocar de plano, fala com a gente que ajeitamos.",
          409,
        );
      }
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Procura customer por email; se houver duplicados, escolhe o que tem sub ativa.
    let customer: Stripe.Customer | null = null;
    let activeSub: Stripe.Subscription | null = null;
    if (profile.email) {
      const list = await stripe.customers.list({
        email: profile.email,
        limit: 10,
      });
      for (const c of list.data) {
        const subs = await stripe.subscriptions.list({
          customer: c.id,
          status: "all",
          limit: 10,
        });
        const sub = subs.data.find((s) =>
          ["active", "trialing", "past_due"].includes(s.status)
        );
        if (sub) {
          customer = c;
          activeSub = sub;
          break;
        }
        if (!customer) customer = c; // fallback se nenhum tiver sub ativa
      }
    }
    if (!customer && profile.phone) {
      const phoneClean = profile.phone.replace(/\D/g, "");
      const search = await stripe.customers.search({
        query: `metadata['phone']:'${phoneClean}'`,
        limit: 1,
      });
      customer = search.data[0] ?? null;
    }

    if (!customer) {
      logStep("Customer not found");
      return jsonError(
        "Não encontramos sua assinatura. Fala com a gente que ajeitamos.",
        404,
      );
    }

    if (!activeSub) {
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10,
      });
      activeSub = subs.data.find((s) =>
        ["active", "trialing", "past_due"].includes(s.status)
      ) ?? null;
    }

    if (!activeSub) {
      return jsonError(
        "Você não tem uma assinatura ativa para trocar agora.",
        409,
      );
    }

    if (activeSub.cancel_at_period_end) {
      return jsonError(
        "Sua assinatura está marcada para encerrar. Reative antes de trocar de plano.",
        409,
      );
    }

    if (activeSub.status === "trialing") {
      return jsonError(
        "Você ainda está no período de avaliação. A troca de plano libera após o primeiro pagamento.",
        409,
      );
    }

    const item = activeSub.items.data[0];
    if (!item) {
      return jsonError("Assinatura sem item ativo. Fala com a gente.", 500);
    }

    const currentPriceId = item.price.id;
    const blocked = getBlockedPriceIds();
    if (blocked.has(currentPriceId)) {
      return jsonError(
        "Sua forma de cobrança atual (PIX/boleto/avaliação) não permite troca direta. Fala com a gente que ajeitamos.",
        409,
      );
    }

    if (currentPriceId === targetPriceId) {
      return jsonError("Você já está nesse plano.", 409);
    }

    logStep("Updating subscription", {
      subId: activeSub.id,
      from: currentPriceId,
      to: targetPriceId,
    });

    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(activeSub.id, {
        items: [{ id: item.id, price: targetPriceId }],
        // always_invoice: cria invoice imediatamente cobrando/creditando a diferença
        // no cartão já cadastrado. Alinha com o texto "cobrança proporcional hoje" da UI.
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        metadata: {
          ...(activeSub.metadata ?? {}),
          plan,
          billing: cycle,
          last_plan_change_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logStep("Stripe update failed", { msg });
      return jsonError(
        "Não conseguimos cobrar a diferença no seu cartão. Atualize o cartão e tente de novo.",
        402,
      );
    }

    // Reflete imediatamente no profile (webhook também atualiza, mas evita lag na UI)
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ plan, billing_cycle: cycle })
      .eq("user_id", userId);
    if (updateErr) {
      logStep("WARN profile update failed", { msg: updateErr.message });
    }

    logStep("Plan changed successfully", {
      subId: updated.id,
      newPlan: plan,
      newBilling: cycle,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        newPlan: plan,
        newPlanName: PLAN_NAMES[plan],
        newBilling: cycle,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logStep("ERROR", { msg });
    return jsonError("Algo deu errado. Tenta de novo em instantes.", 500);
  }
});

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Helper exportado para futura UI: detecta plano/billing atual a partir do price.
export { detectPlanAndBilling };