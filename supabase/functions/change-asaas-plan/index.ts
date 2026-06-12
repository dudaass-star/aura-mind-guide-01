// Edge function: change-asaas-plan
// Troca o plano da assinatura PIX recorrente (Asaas) do usuário.
// Sem proração: cancela a sub antiga e cria uma nova com o mesmo nextDueDate,
// mas com novo value/cycle. Cobrança nova só vale a partir da próxima fatura PIX.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHANGE-ASAAS-PLAN] ${step}${detailsStr}`);
};

type PlanId = "essencial" | "direcao" | "transformacao";
type BillingCycle = "monthly" | "quarterly" | "semiannual" | "yearly";

// Mesma tabela de preços usada em criar-pix-recorrente-asaas (centavos).
const PRICES: Record<PlanId, Record<string, number>> = {
  essencial:     { monthly: 2990, quarterly: 7990,  semestral: 12590, yearly: 21490 },
  direcao:       { monthly: 4990, quarterly: 13390, semestral: 20990, yearly: 35990 },
  transformacao: { monthly: 7990, quarterly: 21390, semestral: 33590, yearly: 57490 },
};

const PLAN_NAMES: Record<PlanId, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

// billing (UI) → cycle Asaas
const CYCLE_MAP: Record<BillingCycle, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  semiannual: "SEMIANNUALLY",
  yearly: "YEARLY",
};

// billing (UI) → key na tabela PRICES (que usa "semestral" em vez de "semiannual")
const BILLING_TO_PRICE_KEY: Record<BillingCycle, string> = {
  monthly: "monthly",
  quarterly: "quarterly",
  semiannual: "semestral",
  yearly: "yearly",
};

const PERIOD_LABELS: Record<BillingCycle, string> = {
  monthly: "mês",
  quarterly: "trimestre",
  semiannual: "semestre",
  yearly: "ano",
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
    if (!ASAAS_API_KEY) {
      logStep("ERROR ASAAS_API_KEY não configurada");
      return jsonError("Configuração ausente. Fala com a gente.", 500);
    }

    const ASAAS_BASE_URL =
      ASAAS_ENV === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3";

    const body = await req.json().catch(() => ({}));
    const { userId, targetPlan, billing } = body as {
      userId?: string;
      targetPlan?: string;
      billing?: string;
    };

    if (!userId || typeof userId !== "string") return jsonError("userId é obrigatório", 400);
    if (!["essencial", "direcao", "transformacao"].includes(targetPlan ?? "")) {
      return jsonError("Plano inválido", 400);
    }
    if (!["monthly", "quarterly", "semiannual", "yearly"].includes(billing ?? "")) {
      return jsonError("Ciclo de cobrança inválido", 400);
    }
    const plan = targetPlan as PlanId;
    const cycle = billing as BillingCycle;

    const priceKey = BILLING_TO_PRICE_KEY[cycle];
    const amountCents = PRICES[plan]?.[priceKey];
    if (!amountCents) return jsonError("Esse plano não está disponível agora.", 500);
    const amountDecimal = amountCents / 100;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id, email, plan, billing_cycle, asaas_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) throw new Error(`profile lookup: ${profileErr.message}`);
    if (!profile) return jsonError("Perfil não encontrado.", 404);
    if (!profile.asaas_customer_id) {
      return jsonError("Não encontramos sua assinatura PIX.", 404);
    }
    logStep("Profile loaded", { email: profile.email, plan: profile.plan });

    // PIX Automático Bacen: troca de plano exige NOVA autorização no app do banco
    // do pagador. Não dá pra mudar o valor de uma autorização ativa via API — o
    // cliente precisa cancelar a atual e refazer pelo checkout.
    const { data: activeAuth } = await supabase
      .from("asaas_pix_authorizations")
      .select("asaas_authorization_id, status")
      .eq("asaas_customer_id", profile.asaas_customer_id)
      .in("status", ["ACTIVE", "PENDING"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeAuth) {
      return jsonError(
        "Sua assinatura é PIX Automático. Pra trocar de plano, cancele a atual no app do seu banco e faça um novo checkout.",
        409,
      );
    }

    // Mesmo plano + mesmo ciclo → bloqueia
    if (profile.plan === plan && profile.billing_cycle === cycle) {
      return jsonError("Você já está nesse plano.", 409);
    }

    // Acha a subscription ativa mais recente em asaas_payments
    const { data: subRows } = await supabase
      .from("asaas_payments")
      .select("asaas_subscription_id, status")
      .eq("asaas_customer_id", profile.asaas_customer_id)
      .not("asaas_subscription_id", "is", null)
      .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "RECEIVED_IN_CASH", "OVERDUE"])
      .order("created_at", { ascending: false })
      .limit(1);

    const oldSubscriptionId = subRows?.[0]?.asaas_subscription_id as string | undefined;
    if (!oldSubscriptionId) {
      return jsonError("Não encontramos sua assinatura PIX. Tenta de novo daqui a pouco.", 404);
    }
    logStep("Old subscription found", { oldSubscriptionId });

    // Helper Asaas
    const asaasFetch = async (path: string, init?: RequestInit) => {
      const resp = await fetch(`${ASAAS_BASE_URL}${path}`, {
        ...init,
        headers: {
          access_token: ASAAS_API_KEY,
          "Content-Type": "application/json",
          "User-Agent": "Aura/1.0",
          ...(init?.headers || {}),
        },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`[CHANGE-ASAAS-PLAN] Asaas ${path} falhou:`, resp.status, json);
        throw new Error(json?.errors?.[0]?.description || `Erro Asaas (${resp.status})`);
      }
      return json;
    };

    // Bloqueia troca se houver cobrança vencida (OVERDUE)
    const overdueRow = subRows?.[0];
    if (overdueRow?.status === "OVERDUE") {
      return jsonError(
        "Você tem uma cobrança PIX vencida. Paga ela primeiro e depois troca o plano.",
        409,
      );
    }

    // Busca nextDueDate da sub antiga
    let nextDueDate: string | null = null;
    try {
      const oldSub = await asaasFetch(`/subscriptions/${oldSubscriptionId}`);
      nextDueDate = (oldSub?.nextDueDate as string) || null;
      logStep("Old subscription nextDueDate", { nextDueDate });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logStep("WARN failed to fetch old subscription", { msg });
    }
    if (!nextDueDate) {
      // Fallback: hoje + 30 dias BRT
      const fallback = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      nextDueDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(fallback);
      logStep("Using fallback nextDueDate", { nextDueDate });
    }

    // Cria a nova subscription PIX com o mesmo nextDueDate (sem cobrança hoje)
    let newSub: { id?: string } | null = null;
    try {
      newSub = await asaasFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: profile.asaas_customer_id,
          billingType: "PIX",
          cycle: CYCLE_MAP[cycle],
          value: amountDecimal,
          nextDueDate,
          description: `Aura ${PLAN_NAMES[plan]} - assinatura ${PERIOD_LABELS[cycle]}`,
          externalReference: `aura_sub_${plan}_${cycle}_${Date.now()}`,
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logStep("ERROR creating new subscription", { msg });
      return jsonError(
        "Não conseguimos atualizar sua assinatura agora. Tenta de novo em instantes.",
        500,
      );
    }
    const newSubscriptionId = newSub?.id;
    if (!newSubscriptionId) {
      return jsonError("Asaas não retornou subscription nova. Tenta de novo.", 500);
    }
    logStep("New subscription created", { newSubscriptionId });

    // Cancela a antiga (best-effort — se falhar, loga e segue)
    try {
      await asaasFetch(`/subscriptions/${oldSubscriptionId}`, { method: "DELETE" });
      logStep("Old subscription deleted", { oldSubscriptionId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logStep("WARN orphan old subscription", { oldSubscriptionId, msg });
    }

    // Atualiza profile com novo plano + ciclo
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ plan, billing_cycle: cycle })
      .eq("user_id", userId);
    if (updateErr) {
      logStep("WARN profile update failed", { msg: updateErr.message });
    }

    // Formata nextDueDate (YYYY-MM-DD) para DD/MM/YYYY pra UI
    const [y, m, d] = nextDueDate.split("-");
    const nextChargeDateBR = `${d}/${m}/${y}`;

    logStep("Plan changed successfully", {
      newSubscriptionId,
      newPlan: plan,
      newBilling: cycle,
      nextChargeDate: nextChargeDateBR,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        newPlan: plan,
        newPlanName: PLAN_NAMES[plan],
        newBilling: cycle,
        nextChargeDate: nextChargeDateBR,
        nextChargeAmount: amountDecimal,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logStep("ERROR", { msg });
    return jsonError("Algo deu errado. Tenta de novo em instantes.", 500);
  }
});