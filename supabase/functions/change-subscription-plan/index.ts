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
    quarterly: "price_1U0pUoQU15XnZ7Vvqc4DcNi2",
    semiannual: "price_1U0pVHQU15XnZ7VvvCChiLHP",
    yearly:     "price_1U0pW5QU15XnZ7VvBVHvYUnU",
  },
  direcao: {
    quarterly: "price_1U0pWPQU15XnZ7VviqtmRsYR",
    semiannual: "price_1U0pWhQU15XnZ7VvEveOB9DP",
    yearly:     "price_1U0pYFQU15XnZ7Vvu6ylUTEM",
  },
  transformacao: {
    quarterly: "price_1U0pa7QU15XnZ7VvEqEFDPWg",
    semiannual: "price_1U0paYQU15XnZ7VvmTzRNyGG",
    yearly:     "price_1U0pavQU15XnZ7VvQErVkBV7",
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
      .select("id, user_id, email, phone, plan, asaas_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) throw new Error(`profile lookup: ${profileErr.message}`);
    if (!profile) return jsonError("Perfil não encontrado", 404);
    logStep("Profile loaded", { email: profile.email, plan: profile.plan });

    // ---- PIX Automático (Woovi): mandato é fixo por valor -------------------
    // Não existe "trocar o valor" de um débito autorizado: o banco aprovou um
    // contrato. A troca de plano é cancelar o mandato atual e emitir um QR novo
    // já no plano escolhido — e é isso que devolvemos aqui.
    const { data: wooviMandate } = await supabase
      .from("woovi_subscriptions")
      .select("id, subscription_id, plan, billing_period, status")
      .eq("user_id", profile.id)
      .in("status", ["APROVADA", "ATIVA"])
      .is("replaced_by_subscription_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (wooviMandate?.subscription_id) {
      logStep("Woovi PIX mandate detected", { subId: wooviMandate.subscription_id });
      // Ciclo do Woovi usa "semestral"; aqui o vocabulário é "semiannual".
      const wooviBilling = cycle === "semiannual" ? "semestral" : cycle;

      // Token do portal: o fluxo de novo QR roda em modo reautorização, que
      // reaproveita CPF/nome/telefone já cadastrados (sem pedir nada de novo).
      let token: string | null = null;
      const { data: existingToken } = await supabase
        .from("user_portal_tokens").select("token").eq("user_id", userId).limit(1).maybeSingle();
      token = existingToken?.token || null;
      if (!token) {
        token = crypto.randomUUID();
        const { error: tokenErr } = await supabase
          .from("user_portal_tokens").insert({ token, user_id: userId });
        if (tokenErr) {
          logStep("ERROR creating portal token", { message: tokenErr.message });
          return jsonError("Não consegui preparar a troca agora. Tenta de novo em instantes.", 500);
        }
      }

      const { data: newQr, error: qrErr } = await supabase.functions.invoke(
        "criar-pix-recorrente-woovi",
        { body: { mode: "reauthorize", token, plan, billing: wooviBilling, deferReplacement: "true" } },
      );
      if (qrErr || (newQr as any)?.error) {
        logStep("ERROR creating new Woovi mandate", { message: qrErr?.message || (newQr as any)?.error });
        return jsonError(
          "Não consegui gerar a nova autorização de PIX agora. Me chama no WhatsApp que eu resolvo na hora.",
          502,
        );
      }

      // Só cancelamos o mandato antigo depois que o novo QR existe: nunca
      // deixamos o cliente sem cobrança E sem autorização.
      return new Response(
        JSON.stringify({
          pixAutomatic: true,
          requiresNewAuthorization: true,
          plan,
          billing: cycle,
          message: `Seu débito automático está no plano ${PLAN_NAMES[profile.plan as PlanId] || profile.plan}. `
            + `Pra mudar pro ${PLAN_NAMES[plan]} eu preciso de uma nova autorização no seu banco — `
            + `depois que você aprovar, a antiga é cancelada automaticamente.`,
          ...(newQr as Record<string, unknown>),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Bloqueia troca direta pra usuários PIX Asaas (sub recorrente).
    // Detecção: existe pelo menos uma asaas_payment com asaas_subscription_id ativo.
    if (profile.asaas_customer_id) {
      const { data: asaasActive } = await supabase
        .from("asaas_payments")
        .select("asaas_subscription_id, status")
        .eq("asaas_customer_id", profile.asaas_customer_id)
        .not("asaas_subscription_id", "is", null)
        .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "RECEIVED_IN_CASH", "OVERDUE"])
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
      // plan_tier: null — sair de um tier de retenção (lite/base) para um plano
      // cheio precisa devolver os entitlements normais (áudio, sessões, msgs).
      .update({ plan, billing_cycle: cycle, plan_tier: null })
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