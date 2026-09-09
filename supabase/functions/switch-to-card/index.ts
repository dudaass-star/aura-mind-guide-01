import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Migração de meio de pagamento: PIX Automático (Woovi/Inter) ou PIX recorrente
 * (Asaas) → cartão na Stripe, sem cobrar duas vezes e sem furo de acesso.
 *
 * Caso real (Cris Silveiira, 09/09/2026): trimestral pago por PIX Automático da
 * Woovi, pediu pra pagar no cartão e não existia caminho nenhum no portal — só
 * um recado mandando falar com o suporte.
 *
 * Regras de ouro deste fluxo:
 *   1) A assinatura de cartão nasce com `trial_end` no FIM do período já pago:
 *      nada é cobrado hoje. Só cobra quando o PIX teria cobrado.
 *   2) O mandato PIX NÃO é tocado aqui. Ele só é cancelado quando o cartão
 *      confirma (stripe-webhook), então abandono no meio não quebra nada.
 *   3) A sessão vai marcada com `migration_from`, pra o webhook não tratar como
 *      venda nova (sem mensagem de boas-vindas, sem Purchase no Meta/GA4).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[SWITCH-TO-CARD] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Mesmos preços recorrentes usados no checkout V2 (cartão, sem trial).
const RECURRING_PRICES: Record<string, { quarterly: string; semestral: string; yearly: string }> = {
  essencial: {
    quarterly: "price_1U0pUoQU15XnZ7Vvqc4DcNi2",
    semestral: "price_1U0pVHQU15XnZ7VvvCChiLHP",
    yearly: "price_1U0pW5QU15XnZ7VvBVHvYUnU",
  },
  direcao: {
    quarterly: "price_1U0pWPQU15XnZ7VviqtmRsYR",
    semestral: "price_1U0pWhQU15XnZ7VvEveOB9DP",
    yearly: "price_1U0pYFQU15XnZ7Vvu6ylUTEM",
  },
  transformacao: {
    quarterly: "price_1U0pa7QU15XnZ7VvEqEFDPWg",
    semestral: "price_1U0paYQU15XnZ7VvmTzRNyGG",
    yearly: "price_1U0pavQU15XnZ7VvQErVkBV7",
  },
};

const MONTHLY_ENV: Record<string, string> = {
  essencial: "STRIPE_PRICE_ESSENCIAL_MONTHLY",
  direcao: "STRIPE_PRICE_DIRECAO_MONTHLY",
  transformacao: "STRIPE_PRICE_TRANSFORMACAO_MONTHLY",
};

/** Normaliza o ciclo: rows antigas gravaram "semestral"/"semiannual". */
function normalizeCycle(raw: string | null | undefined): "monthly" | "quarterly" | "semestral" | "yearly" {
  const v = String(raw || "monthly").toLowerCase();
  if (v === "quarterly" || v === "trimestral") return "quarterly";
  if (v === "semestral" || v === "semiannual") return "semestral";
  if (v === "yearly" || v === "annual" || v === "anual") return "yearly";
  return "monthly";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!userId) return json({ error: "userId é obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, user_id, name, email, phone, plan, billing_cycle, plan_expires_at, card_gateway, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) throw new Error(`profile lookup: ${profErr.message}`);
    if (!profile) return json({ error: "Perfil não encontrado" }, 404);

    const plan = String(profile.plan || "essencial");
    if (!RECURRING_PRICES[plan]) return json({ error: "Plano atual não permite troca automática." }, 409);

    // Hoje só o trilho Woovi tem encerramento de mandato automatizado no
    // webhook do cartão. Sem isso a pessoa acabaria com PIX e cartão vivos.
    if (String(profile.card_gateway || "") !== "woovi") {
      return json({
        error: "Pra trocar pro cartão nesse caso a gente faz junto com você — me chama no WhatsApp que resolvo na hora.",
        code: "GATEWAY_NOT_SUPPORTED",
      }, 409);
    }

    const cycle = normalizeCycle(profile.billing_cycle);
    const priceId = cycle === "monthly"
      ? (Deno.env.get(MONTHLY_ENV[plan]) || "")
      : RECURRING_PRICES[plan][cycle];
    if (!priceId) return json({ error: "Preço não configurado para o seu plano. Fala com a gente." }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const phoneClean = String(profile.phone || "").replace(/\D/g, "");
    const email = String(profile.email || "");

    // --- Anti-duplicidade: se já existe assinatura viva no cartão, não cria outra.
    const candidates = new Map<string, true>();
    if (email) {
      const byEmail = await stripe.customers.list({ email, limit: 10 }).catch(() => ({ data: [] as Stripe.Customer[] }));
      for (const c of byEmail.data) candidates.set(c.id, true);
    }
    if (phoneClean) {
      for (const variation of new Set([phoneClean, phoneClean.replace(/^55/, ""), `55${phoneClean}`])) {
        const byPhone = await stripe.customers
          .search({ query: `metadata['phone']:'${variation}'`, limit: 10 })
          .catch(() => ({ data: [] as Stripe.Customer[] }));
        for (const c of byPhone.data) candidates.set(c.id, true);
      }
    }
    for (const cid of candidates.keys()) {
      const subs = await stripe.subscriptions
        .list({ customer: cid, status: "all", limit: 10 })
        .catch(() => ({ data: [] as Stripe.Subscription[] }));
      const live = subs.data.find((s: any) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
      if (live) {
        log("já existe assinatura no cartão", { cid, sub: live.id, status: live.status });
        return json({
          error: "Você já tem uma assinatura no cartão ativa. Se ela estiver com pagamento pendente, atualize o cartão em vez de assinar de novo.",
          code: "CARD_SUBSCRIPTION_EXISTS",
        }, 409);
      }
    }

    let customerId = [...candidates.keys()][0] || "";
    if (!customerId) {
      const created = await stripe.customers.create({
        name: profile.name || "Cliente",
        email: email || undefined,
        address: { country: "BR" },
        metadata: { phone: phoneClean },
      });
      customerId = created.id;
    }

    // --- Primeira cobrança no cartão = fim do período já pago no PIX.
    // A Stripe exige `trial_end` no mínimo 48h à frente; período já vencido
    // (ou vencendo em menos de 2 dias) cobra na hora, como deve ser.
    const expiresMs = profile.plan_expires_at ? Date.parse(String(profile.plan_expires_at)) : 0;
    const minTrial = Date.now() + 49 * 3600 * 1000;
    const trialEnd = expiresMs > minTrial ? Math.floor(expiresMs / 1000) : null;

    const fromGateway = String(profile.card_gateway || "pix");
    const origin = req.headers.get("origin") || "https://olaaura.com.br";

    const migrationMeta: Record<string, string> = {
      migration_from: fromGateway,
      migration_user_id: String(profile.user_id),
      plan,
      billing: cycle,
      phone: phoneClean,
      email,
      name: profile.name || "Cliente",
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      locale: "pt-BR",
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "always",
      adaptive_pricing: { enabled: false },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/meu-espaco?billing=switched`,
      cancel_url: `${origin}/meu-espaco`,
      custom_text: {
        submit: {
          message: trialEnd
            ? "Nada é cobrado agora: seu período já pago continua valendo e a primeira cobrança no cartão acontece só na renovação."
            : "Sua renovação passa a ser no cartão a partir de hoje.",
        },
      },
      metadata: migrationMeta,
      subscription_data: {
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        metadata: migrationMeta,
      },
    } as any);

    log("sessão de migração criada", { session: session.id, plan, cycle, trialEnd, fromGateway });

    return json({
      url: session.url,
      plan,
      billing: cycle,
      firstChargeAt: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return json({ error: "Não consegui preparar a troca pro cartão agora. Tenta de novo em instantes." }, 500);
  }
});
