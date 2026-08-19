import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getPhoneVariations } from "../_shared/zapi-client.ts";
import { cancelMandate } from "../_shared/inter-cycles.ts";

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

// Preços dos planos de retenção no Asaas cartão (usa `value` direto em /subscriptions).
const ASAAS_RETENTION_VALUES = {
  lite: 19.90,
  base: 9.90,
} as const;

// Ciclo em dias por ciclo Asaas — usado pra calcular data de restauração do valor cheio.
const ASAAS_CYCLE_DAYS: Record<string, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  SEMIANNUALLY: 180,
  YEARLY: 365,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// ─── Asaas helpers ─────────────────────────────────────────────────────────
function getAsaasClient() {
  const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
  const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
  const ASAAS_BASE_URL =
    ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";
  if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada");
  return async (path: string, init?: RequestInit) => {
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
      throw new Error(
        (json as any)?.errors?.[0]?.description || `Asaas ${path} falhou (${resp.status})`,
      );
    }
    return json;
  };
}

// Retorna nextDueDate no formato Asaas (YYYY-MM-DD BRT) para daqui a `days` dias.
function brtDatePlusDays(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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

    const { phone, token, action, reason, reason_detail, pause_days, offer } = await req.json();
    logStep("Request received", { phone: !!phone, token: !!token, action, reason });

    if (!phone && !token) {
      throw new Error("Phone number or token is required");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Identidade: telefone digitado OU token do portal (link de oferta do WhatsApp).
    let phoneClean = (phone || "").replace(/\D/g, "");
    if (!phoneClean && token) {
      const { data: pt } = await supabase
        .from("user_portal_tokens")
        .select("user_id")
        .eq("token", token)
        .maybeSingle();
      if (!pt?.user_id) {
        return jsonResponse({ success: false, message: "Link expirado. Informe seu telefone." }, 200);
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("phone")
        .eq("user_id", pt.user_id)
        .maybeSingle();
      phoneClean = String(prof?.phone || "").replace(/\D/g, "");
      if (!phoneClean) {
        return jsonResponse({ success: false, message: "Não encontramos seu cadastro. Informe seu telefone." }, 200);
      }
    }

    logStep("Phone resolved", { phoneClean, viaToken: !phone && !!token });

    // Descobre o perfil (user_id, gateway, nome) tentando cada variação de telefone
    let profile: {
      id: string;
      user_id: string | null;
      name: string | null;
      email?: string | null;
      card_gateway: string | null;
      asaas_customer_id?: string | null;
      plan?: string | null;
      billing_cycle?: string | null;
      status?: string | null;
      payment_failed_at?: string | null;
    } | null = null;
    {
      const variants = getPhoneVariations(phoneClean);
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, name, email, card_gateway, asaas_customer_id, plan, billing_cycle, status, payment_failed_at")
        .in("phone", variants)
        .limit(1);
      if (data && data.length > 0) profile = data[0] as any;
    }

    // Oferta prometida no WhatsApp (link /cancelar?t=<token>&offer=<tier>).
    const offeredTier: "discount_30" | "lite" | "base" | null =
      offer === "discount_30" || offer === "lite" || offer === "base" ? offer : null;

    // Sem assinatura no gateway (cancelada/expirada) + oferta prometida:
    // em vez de "Nenhuma assinatura ativa encontrada", devolve o estado de
    // reativação pro frontend honrar a oferta que o cliente recebeu.
    const reactivationPayload = () => ({
      success: false,
      status: "no_gateway_subscription",
      offer: offeredTier,
      profile: { name: profile?.name ?? null, plan: profile?.plan ?? null },
      message: "Sua assinatura não está mais ativa — mas a oferta continua de pé.",
    });

    const hasRecentPaymentFailure = (paymentFailedAt?: string | null): boolean => {
      if (!paymentFailedAt) return false;
      const failedAtMs = new Date(paymentFailedAt).getTime();
      if (Number.isNaN(failedAtMs)) return false;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      return Date.now() - failedAtMs <= thirtyDaysMs;
    };

    const isActiveProfileWithoutFreshFailure = () =>
      profile?.status === "active" && !hasRecentPaymentFailure(profile.payment_failed_at);

    const alreadyActivePayload = () => ({
      success: true,
      status: "already_active",
      offer: offeredTier,
      profile: { name: profile?.name ?? null, plan: profile?.plan ?? null },
      subscription: {
        plan: profile?.plan || "Assinatura AURA",
        gateway: profile?.card_gateway ?? null,
      },
      message: "Sua assinatura já está ativa. Essa oferta era para reativação e não precisa ser aplicada agora.",
    });

    // Ação: gerar checkout de reativação no preço da oferta.
    if (action === "reactivate") {
      if (!offeredTier) {
        return jsonResponse({ success: false, message: "Oferta inválida." });
      }
      const origin = req.headers.get("origin") || "https://olaaura.com.br";
      const planKey = String(profile?.plan || "essencial").toLowerCase();
      let priceId: string | null = null;
      let discounts: any[] | undefined;

      if (offeredTier === "lite" || offeredTier === "base") {
        priceId = RETENTION_PRICES[offeredTier];
      } else {
        const envKey = `STRIPE_PRICE_${planKey.toUpperCase()}_MONTHLY`;
        priceId = Deno.env.get(envKey) || Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY") || null;
        if (priceId) {
          const coupon = await stripe.coupons.create({
            percent_off: 30,
            duration: "repeating",
            duration_in_months: 3,
            name: "Reativação 30% off - 3 meses",
            metadata: { phone: phoneClean, origin: "dunning_reactivation" },
          });
          discounts = [{ coupon: coupon.id }];
        }
      }

      if (!priceId) {
        return jsonResponse({
          success: false,
          message: "Não consegui montar sua reativação agora. Fale com o suporte no WhatsApp.",
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: profile?.email || undefined,
        discounts,
        success_url: `${origin}/obrigado?reactivation=1`,
        cancel_url: `${origin}/cancelar${token ? `?t=${token}&offer=${offeredTier}` : ""}`,
        subscription_data: {
          metadata: {
            phone: phoneClean,
            retention_tier: offeredTier,
            origin: "dunning_reactivation",
          },
        },
        metadata: { phone: phoneClean, retention_tier: offeredTier },
      });

      try {
        await supabase.from("retention_events").insert({
          user_id: profile?.user_id ?? null,
          phone: phoneClean,
          origin: "dunning_reactivation",
          tier: offeredTier,
          action: "accepted",
          gateway: "stripe",
          channel: "web",
          metadata: { checkout_session: session.id },
        });
      } catch (_) { /* auditoria best-effort */ }

      return jsonResponse({ success: true, status: "reactivation_checkout", url: session.url });
    }

    // ─── Roteamento Woovi (PIX Automático Bacen, jornada composta) ────────
    // Mesma regra do Inter: sem cancelar o mandato na Woovi, o débito segue
    // autorizado no banco do cliente mesmo depois do cancelamento no portal.
    if (profile?.user_id && profile?.card_gateway === "woovi") {
      const { data: wooviSub } = await supabase
        .from("woovi_subscriptions")
        .select("id, subscription_id, plan, billing_period, value_cents, next_charge_date, status")
        .eq("user_id", profile.id)
        .is("replaced_by_subscription_id", null)
        .not("subscription_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wooviSub?.subscription_id) {
        const planLabelWoovi = PLAN_LABELS[profile.plan || ""] || "Assinatura AURA";
        const nextDateWoovi = wooviSub.next_charge_date
          ? (() => {
              const [y, m, d] = String(wooviSub.next_charge_date).split("-");
              return `${d}/${m}/${y}`;
            })()
          : "";

        if (action === "check" || !action) {
          return jsonResponse({
            success: true,
            status: "active",
            gateway: "woovi_pix",
            subscription: {
              id: wooviSub.subscription_id,
              plan: planLabelWoovi,
              endDate: wooviSub.next_charge_date
                ? new Date(`${wooviSub.next_charge_date}T12:00:00Z`).toISOString()
                : null,
              endDateFormatted: nextDateWoovi,
              nextDueDateFormatted: nextDateWoovi,
              amount: ((wooviSub.value_cents || 0) / 100).toLocaleString("pt-BR", {
                style: "currency", currency: "BRL",
              }),
              amount_cents: wooviSub.value_cents,
              price_id: wooviSub.subscription_id,
            },
            // No PIX Automático o "desconto" é um mandato novo já no valor
            // reduzido: o cliente escaneia um QR e pode até usar outra conta.
            discount_available: true,
            reasons: CANCELLATION_REASONS,
          });
        }

        if (action === "cancel") {
          const wooviAppId = Deno.env.get("WOOVI_APP_ID") || "";
          let canceledOk = false;
          try {
            const resp = await fetch(
              `https://api.woovi.com/api/v1/subscriptions/${encodeURIComponent(wooviSub.subscription_id)}/cancel`,
              // A Woovi só aceita PUT nessa rota: POST devolve 405 e o cliente
              // nunca conseguia cancelar sozinho.
              { method: "PUT", headers: { Authorization: wooviAppId, "Content-Type": "application/json" } },
            );
            canceledOk = resp.ok;
            if (!resp.ok) {
              logStep("Woovi: cancelamento recusado", { status: resp.status });
            }
          } catch (e) {
            logStep("Woovi: erro cancelando mandato", { error: String(e) });
          }

          if (!canceledOk) {
            return jsonResponse({
              success: false,
              message: "Não consegui cancelar o débito automático agora. Fale com o suporte no WhatsApp que a gente resolve na hora.",
            });
          }

          await supabase.from("woovi_subscriptions").update({
            status: "CANCELADA",
            updated_at: new Date().toISOString(),
          }).eq("id", wooviSub.id);

          // Acesso segue até o fim do período já pago (mesma regra do cartão).
          await supabase.from("profiles").update({
            status: "canceling",
            updated_at: new Date().toISOString(),
          }).eq("user_id", profile.user_id);

          try {
            await supabase.from("cancellation_feedback").insert({
              user_id: profile.user_id,
              phone: phoneClean,
              reason: reason || null,
              reason_detail: reason_detail || null,
              action_taken: "cancel",
              gateway: "woovi_pix",
            });
          } catch (_) { /* feedback é best-effort */ }

          try {
            await supabase.from("retention_events").insert({
              user_id: profile.user_id,
              phone: phoneClean,
              origin: "cancel_flow",
              tier: "cancel",
              action: "applied",
              gateway: "woovi_pix",
              channel: "web",
              metadata: { subscription_id: wooviSub.subscription_id, reason: reason || null },
            });
          } catch (_) { /* auditoria best-effort */ }

          return jsonResponse({
            success: true,
            status: "canceled",
            gateway: "woovi_pix",
            message: nextDateWoovi
              ? `Débito automático cancelado. Seu acesso continua até ${nextDateWoovi}.`
              : "Débito automático cancelado. Seu acesso continua até o fim do período já pago.",
          });
        }

        // ── Ofertas de retenção no PIX Automático ──────────────────────────
        // Não existe cupom aqui: o desconto (ou o Lite) vira um MANDATO NOVO
        // já no valor da oferta. Devolvemos o link do QR — que também resolve o
        // caso real de falha: a conta atual está sem saldo e ele pode pagar de
        // outra. O mandato antigo só é substituído quando o novo é aprovado.
        if (
          action === "apply_discount_3m" ||
          action === "downgrade_to_lite" ||
          action === "downgrade_to_base"
        ) {
          const tier = action === "apply_discount_3m"
            ? "discount_30"
            : action === "downgrade_to_lite" ? "lite" : "base";

          await supabase
            .from("user_portal_tokens")
            .upsert({ user_id: profile.user_id }, { onConflict: "user_id" });
          const { data: tokenRow } = await supabase
            .from("user_portal_tokens")
            .select("token")
            .eq("user_id", profile.user_id)
            .maybeSingle();

          if (!tokenRow?.token) {
            return jsonResponse({
              success: false,
              message: "Não consegui abrir sua oferta agora. Fale com o suporte no WhatsApp.",
            });
          }

          try {
            await supabase.from("retention_events").insert({
              user_id: profile.user_id,
              phone: phoneClean,
              origin: "cancel_flow",
              tier,
              action: "accepted",
              gateway: "woovi_pix",
              channel: "web",
              metadata: { subscription_id: wooviSub.subscription_id },
            });
          } catch (_) { /* auditoria best-effort */ }

          return jsonResponse({
            success: true,
            status: "offer_pix_qr",
            gateway: "woovi_pix",
            tier,
            redirect_url: `/reautorizar-pix?token=${tokenRow.token}&offer=${tier}`,
            message: "Gerando seu PIX com o novo valor...",
          });
        }

        // Pausa segue exigindo suporte (mandato PIX não pausa).
        return jsonResponse({
          success: false,
          gateway_unsupported: true,
          gateway: "woovi_pix",
          message:
            "Sua assinatura é no PIX Automático. Fale com nosso suporte pelo WhatsApp que a gente ajusta pra você.",
        });
      }
    }

    // ─── Roteamento Asaas (cartão OU PIX recorrente) ──────────────────────
    // ─── Roteamento Inter (PIX Automático Bacen) ──────────────────────────
    // Precisa vir ANTES do Asaas/Stripe: se o mandato não for cancelado no
    // Inter, o cliente cancela no portal e o débito segue autorizado.
    if (profile?.user_id && profile?.card_gateway === "inter") {
      const { data: interRec } = await supabase
        .from("inter_pix_recurrences")
        .select("id_rec, plan, billing_period, value_cents, next_charge_date, status")
        .eq("user_id", profile.id)
        .is("replaced_by_id_rec", null)
        .not("id_rec", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (interRec?.id_rec) {
        const planLabelInter = PLAN_LABELS[profile.plan || ""] || "Assinatura AURA";
        const nextDate = interRec.next_charge_date
          ? (() => {
              const [y, m, d] = String(interRec.next_charge_date).split("-");
              return `${d}/${m}/${y}`;
            })()
          : "";

        if (action === "check" || !action) {
          return jsonResponse({
            success: true,
            status: "active",
            gateway: "inter_pix",
            subscription: {
              id: interRec.id_rec,
              plan: planLabelInter,
              endDate: interRec.next_charge_date
                ? new Date(`${interRec.next_charge_date}T12:00:00Z`).toISOString()
                : null,
              endDateFormatted: nextDate,
              nextDueDateFormatted: nextDate,
              amount: (interRec.value_cents / 100).toLocaleString("pt-BR", {
                style: "currency", currency: "BRL",
              }),
              amount_cents: interRec.value_cents,
              price_id: interRec.id_rec,
            },
            // PIX Automático não aceita mudança de valor sem nova autorização
            // do pagador — desconto temporário não existe neste trilho.
            discount_available: false,
            reasons: CANCELLATION_REASONS,
          });
        }

        if (action === "cancel") {
          const canceled = await cancelMandate(supabase, interRec.id_rec);
          if (!canceled.ok) {
            logStep("Inter: cancelamento recusado", { status: canceled.status });
            return jsonResponse({
              success: false,
              message: "Não consegui cancelar o débito automático agora. Fale com o suporte no WhatsApp que a gente resolve na hora.",
            });
          }

          // Acesso segue até o fim do período já pago (mesma regra do cartão).
          await supabase.from("profiles").update({
            status: "canceling",
            updated_at: new Date().toISOString(),
          }).eq("user_id", profile.user_id);

          try {
            await supabase.from("cancellation_feedback").insert({
              user_id: profile.user_id,
              phone: phoneClean,
              reason: reason || null,
              reason_detail: reason_detail || null,
              action_taken: "cancel",
              gateway: "inter_pix",
            });
          } catch (_) { /* feedback é best-effort */ }

          try {
            await supabase.from("retention_events").insert({
              user_id: profile.user_id,
              phone: phoneClean,
              origin: "cancel_flow",
              tier: "cancel",
              action: "applied",
              gateway: "inter_pix",
              channel: "web",
              metadata: { id_rec: interRec.id_rec, reason: reason || null },
            });
          } catch (_) { /* auditoria best-effort */ }

          return jsonResponse({
            success: true,
            status: "canceled",
            gateway: "inter_pix",
            message: nextDate
              ? `Débito automático cancelado. Seu acesso continua até ${nextDate}.`
              : "Débito automático cancelado. Seu acesso continua até o fim do período já pago.",
          });
        }

        // Pausa e escada de descontos exigem novo mandato (nova autorização do
        // pagador) — encaminha pro suporte em vez de prometer o que não roda.
        return jsonResponse({
          success: false,
          gateway_unsupported: true,
          gateway: "inter_pix",
          message:
            "Sua assinatura é no PIX Automático. Fale com nosso suporte pelo WhatsApp que a gente ajusta pra você.",
        });
      }
    }

    // Em produção o card_gateway é gravado como 'asaas' (valor único). A
    // distinção cartão vs PIX vem do payment_method da última cobrança em
    // asaas_payments. Aceita também os nomes antigos 'asaas_card'/'asaas_pix'
    // para retrocompatibilidade.
    const isAsaasUser =
      profile?.asaas_customer_id &&
      profile?.user_id &&
      (profile.card_gateway === "asaas" ||
        profile.card_gateway === "asaas_card" ||
        profile.card_gateway === "asaas_pix");

    if (isAsaasUser) {
      let asaasMethod: "PIX" | "CARD" | null = null;
      if (profile.card_gateway === "asaas_pix") asaasMethod = "PIX";
      else if (profile.card_gateway === "asaas_card") asaasMethod = "CARD";
      else {
        // card_gateway = 'asaas' → inspeciona a última cobrança
        const { data: lastPay } = await supabase
          .from("asaas_payments")
          .select("payment_method")
          .eq("asaas_customer_id", profile.asaas_customer_id)
          .not("payment_method", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);
        const pm = String(lastPay?.[0]?.payment_method || "").toUpperCase();
        asaasMethod = pm === "PIX" ? "PIX" : "CARD";
      }

      const handler = asaasMethod === "PIX" ? handleAsaasPix : handleAsaasCard;
      const resp = await handler({
        supabase,
        profile: profile as any,
        phoneClean,
        action,
        reason,
        reason_detail,
        pause_days,
        offeredTier,
      });
      if (resp) return resp;
      // Se o handler devolveu null (sem sub encontrada), cai para o Stripe.
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
      // Oferta prometida por link: nunca cair em erro genérico.
      if (offeredTier) {
        if (isActiveProfileWithoutFreshFailure()) return jsonResponse(alreadyActivePayload());
        return jsonResponse(reactivationPayload());
      }
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
        const rawCancelEnd =
          (cancelingSub as any).current_period_end ??
          cancelingSub.items.data[0]?.current_period_end;
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

      if (offeredTier) {
        if (isActiveProfileWithoutFreshFailure()) return jsonResponse(alreadyActivePayload());
        return jsonResponse(reactivationPayload());
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
    const rawEnd =
      (subscription as any).current_period_end ??
      subscription.items.data[0]?.current_period_end;
    logStep("Raw current_period_end value", { rawEnd, type: typeof rawEnd });
    const currentPeriodEnd = typeof rawEnd === 'string' ? new Date(rawEnd) : new Date((rawEnd ?? 0) * 1000);

    // ── Fim de acesso REAL = fim do período efetivamente pago ─────────────
    // O current_period_end do Stripe avança junto com a fatura em aberto: numa
    // assinatura trimestral criada hoje e nunca paga, ele já aponta 3 meses à
    // frente. Prometer essa data libera acesso que o cliente não comprou.
    // Aqui olhamos a última fatura PAGA e usamos o fim do período dela.
    let paidPeriodEnd: Date | null = null;
    try {
      const paidInvoices = await stripe.invoices.list({
        customer: customer.id,
        status: "paid",
        limit: 20,
      });
      for (const inv of paidInvoices.data) {
        if ((inv.amount_paid ?? 0) <= 0) continue;
        for (const line of inv.lines?.data ?? []) {
          const end = line.period?.end;
          if (!end) continue;
          const endDate = new Date(end * 1000);
          if (!paidPeriodEnd || endDate > paidPeriodEnd) paidPeriodEnd = endDate;
        }
      }
    } catch (e) {
      logStep("WARN falha lendo faturas pagas", { error: String(e) });
    }
    // Sem fatura paga: não há período a preservar (acesso encerra agora).
    const accessEnd = paidPeriodEnd;
    const accessEndFmt = accessEnd ? accessEnd.toLocaleDateString('pt-BR') : null;
    logStep("Fim de acesso pago", {
      currentPeriodEnd: currentPeriodEnd.toISOString(),
      paidPeriodEnd: accessEnd?.toISOString() ?? null,
    });

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
      if (offeredTier && activeSubscriptions.data.length > 0) {
        return jsonResponse(alreadyActivePayload());
      }

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
            endDate: accessEnd?.toISOString() ?? null,
            endDateFormatted: accessEndFmt,
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
      // 1) Fecha o ciclo antigo: invoices em aberto do valor cheio precisam sair
      //    do caminho, senão o Smart Retry segue cobrando o preço antigo e o
      //    Stripe cancela a assinatura mesmo com a oferta aceita.
      try {
        const openInvoices = await stripe.invoices.list({
          subscription: subscription.id,
          status: "open",
          limit: 10,
        });
        for (const inv of openInvoices.data) {
          if (!inv.id) continue;
          try {
            await stripe.invoices.voidInvoice(inv.id);
            logStep("Voided open invoice", { invoiceId: inv.id });
          } catch (e) {
            logStep("WARN void invoice failed", { invoiceId: inv.id, err: (e as Error).message });
          }
        }
      } catch (e) {
        logStep("WARN listing open invoices failed", { err: (e as Error).message });
      }

      // 2) Troca o preço e reinicia o ciclo agora → Stripe emite e cobra a
      //    fatura do novo valor imediatamente.
      let updated: Stripe.Subscription;
      try {
        updated = await stripe.subscriptions.update(subscription.id, {
          items: [{ id: itemId, price: newPriceId }],
          proration_behavior: "none",
          billing_cycle_anchor: "now",
          cancel_at_period_end: false,
          // Se estava pausada, remove pausa
          pause_collection: "",
        } as any);
      } catch (e) {
        logStep("ERRO downgrade Stripe", { err: (e as Error).message });
        return jsonResponse({
          success: false,
          message: "Não consegui trocar seu plano agora. Tenta de novo em alguns minutos ou fala com o suporte.",
        });
      }

      // 3) Só confirma se o Stripe reconheceu a assinatura como saudável.
      const healthy = ["active", "trialing"].includes(updated.status);
      if (!healthy) {
        logStep("Downgrade sem confirmação de pagamento", { status: updated.status });
        await logRetention(tier, "accepted", { stripe_status: updated.status });
        return jsonResponse({
          success: false,
          status: "payment_required",
          tier,
          message:
            "Ajustei o valor do seu plano, mas o cartão ainda não passou. Atualize a forma de pagamento no seu espaço pra confirmar.",
        });
      }

      // Atualiza plan_tier no perfil (não mexe em profiles.plan pra não quebrar outras integrações)
      if (profile?.user_id) {
        await supabase
          .from("profiles")
          .update({ plan_tier: tier, status: "active", payment_failed_at: null })
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
      // Se o ciclo atual NÃO foi pago (past_due/unpaid), não existe acesso
      // pago a preservar: o período em aberto veio de uma fatura não paga.
      // Nesse caso cancelamos imediatamente e anulamos as faturas abertas,
      // evitando prometer acesso até uma data que o cliente não pagou.
      // Também entra aqui quando não existe nenhum período pago vigente: sem
      // fatura paga (ou com o período pago já vencido) não há acesso a preservar.
      const unpaidCycle =
        ["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(subscription.status) ||
        !accessEnd ||
        accessEnd.getTime() <= Date.now();
      if (unpaidCycle) {
        logStep("Unpaid cycle: canceling immediately", {
          subscriptionId: subscription.id,
          status: subscription.status,
          paidPeriodEnd: accessEnd?.toISOString() ?? null,
        });

        try {
          const openInvoices = await stripe.invoices.list({
            customer: subscription.customer as string,
            status: "open",
            limit: 10,
          });
          for (const inv of openInvoices.data) {
            if (inv.id) {
              await stripe.invoices.voidInvoice(inv.id);
              logStep("Voided open invoice", { invoiceId: inv.id });
            }
          }
        } catch (e) {
          logStep("Warning: failed voiding open invoices", { error: String(e) });
        }

        await stripe.subscriptions.cancel(subscription.id);

        if (reason) {
          await supabase.from("cancellation_feedback").insert({
            phone: phoneClean,
            user_id: profile?.user_id || null,
            reason,
            reason_detail: reason_detail || null,
            action_taken: "canceled_immediate_unpaid",
            save_offer_accepted: false,
            gateway: "stripe",
          });
        }
        await logRetention("cancel", "applied", { reason, immediate: true });

        await supabase
          .from("profiles")
          .update({
            status: "canceled",
            canceled_at: new Date().toISOString(),
            plan_expires_at: new Date().toISOString(),
          })
          .eq("phone", phoneClean);

        return jsonResponse({
          success: true,
          status: "canceled",
          immediate: true,
          message:
            "Assinatura cancelada agora. Como a cobrança do ciclo atual não foi paga, o acesso é encerrado imediatamente e a fatura em aberto foi anulada.",
          subscription: { id: subscription.id, endDate: null, endDateFormatted: null },
        });
      }

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
          message: `Sua assinatura foi cancelada. Você terá acesso até ${accessEndFmt}.`,
          subscription: {
            id: subscription.id,
            endDate: accessEnd?.toISOString() ?? null,
            endDateFormatted: accessEndFmt,
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

// ─────────────────────────────────────────────────────────────────────────
// Handler Asaas cartão — paridade com Stripe pra check / pause / discount /
// downgrade / cancel. Volta null se não conseguir resolver (cai pro Stripe).
// ─────────────────────────────────────────────────────────────────────────
interface HandleAsaasParams {
  supabase: any;
  profile: {
    user_id: string;
    name: string | null;
    asaas_customer_id: string;
    plan: string | null;
    billing_cycle: string | null;
  };
  phoneClean: string;
  action?: string;
  reason?: string;
  reason_detail?: string;
  pause_days?: number;
  /** Oferta prometida no link do WhatsApp (/cancelar?t=...&offer=...). */
  offeredTier?: "discount_30" | "lite" | "base" | null;
}

const PLAN_LABELS: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
  lite: "Lite",
  base: "Base",
};

async function handleAsaasCard(params: HandleAsaasParams): Promise<Response | null> {
  const { supabase, profile, phoneClean, action, reason, reason_detail, pause_days } = params;
  const logA = (step: string, details?: any) =>
    console.log(`[CANCEL-SUBSCRIPTION][ASAAS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

  let asaasFetch: (path: string, init?: RequestInit) => Promise<any>;
  try {
    asaasFetch = getAsaasClient();
  } catch (e) {
    logA("Sem ASAAS_API_KEY, delegando ao Stripe", { err: (e as Error).message });
    return null;
  }

  // Acha a subscription cartão ativa mais recente
  const { data: subRows } = await supabase
    .from("asaas_payments")
    .select("asaas_subscription_id, status, payment_method")
    .eq("asaas_customer_id", profile.asaas_customer_id)
    .eq("payment_method", "CREDIT_CARD")
    .not("asaas_subscription_id", "is", null)
    .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "OVERDUE"])
    .order("created_at", { ascending: false })
    .limit(1);

  const subscriptionId = subRows?.[0]?.asaas_subscription_id as string | undefined;
  if (!subscriptionId) {
    logA("Nenhuma subscription cartão Asaas encontrada");
    return jsonResponse({
      success: false,
      message: "Nenhuma assinatura cartão ativa encontrada.",
    });
  }

  // Detalhes da sub
  let subDetails: any = {};
  try {
    subDetails = await asaasFetch(`/subscriptions/${subscriptionId}`);
  } catch (e) {
    logA("Erro buscando sub", { err: (e as Error).message });
    return jsonResponse({ success: false, message: "Não consegui acessar sua assinatura agora." });
  }

  const nextDueDate: string | null = subDetails?.nextDueDate || null;
  const value: number = Number(subDetails?.value) || 0;
  const cycle: string = String(subDetails?.cycle || "MONTHLY");
  const cardToken: string | null = subDetails?.creditCard?.creditCardToken || null;

  const nextDueDateFmt = nextDueDate
    ? (() => {
        const [y, m, d] = nextDueDate.split("-");
        return `${d}/${m}/${y}`;
      })()
    : "";

  const logRetention = async (
    tier: RetentionTier | "cancel",
    actionName: "offered" | "accepted" | "declined" | "applied",
    extra: Record<string, unknown> = {},
  ) => {
    try {
      await supabase.from("retention_events").insert({
        user_id: profile.user_id,
        phone: phoneClean,
        origin: "cancel_flow",
        tier,
        action: actionName,
        gateway: "asaas_card",
        channel: "web",
        metadata: extra,
      });
    } catch (e) {
      logA("WARN retention_events insert", { e: (e as Error).message });
    }
  };

  const hasRecentDiscount = async (): Promise<boolean> => {
    const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
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

  const buildValueRecap = async () => {
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
        (s: any) => s.confidence === "high" || s.confidence === "medium",
      ),
    };
  };

  const CANCELLATION_REASONS_LOCAL = [
    { id: "expensive", label: "Está caro pra mim" },
    { id: "not_using", label: "Não estou usando" },
    { id: "not_satisfied", label: "Não gostei do serviço" },
    { id: "come_back_later", label: "Vou voltar depois" },
    { id: "other", label: "Outro motivo" },
  ];

  const planLabel = PLAN_LABELS[profile.plan || ""] || "Assinatura AURA";

  // ─── check ────────────────────────────────────────────────────────────
  if (action === "check" || !action) {
    const valueRecap = await buildValueRecap();
    const discountUsedRecently = await hasRecentDiscount();
    return jsonResponse({
      success: true,
      status: "active",
      gateway: "asaas_card",
      subscription: {
        id: subscriptionId,
        plan: planLabel,
        endDate: nextDueDate ? new Date(nextDueDate).toISOString() : null,
        endDateFormatted: nextDueDateFmt,
        amount: value
          ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : null,
        amount_cents: Math.round(value * 100),
        price_id: subscriptionId,
        nextDueDateFormatted: nextDueDateFmt,
      },
      value_recap: valueRecap,
      discount_available: !discountUsedRecently,
      reasons: CANCELLATION_REASONS_LOCAL,
    });
  }

  // Todas as ações abaixo (exceto cancel) exigem cardToken pra reusar
  const needsCardToken =
    action === "pause" ||
    action === "apply_discount_3m" ||
    action === "downgrade_to_lite" ||
    action === "downgrade_to_base";

  if (needsCardToken && !cardToken) {
    return jsonResponse({
      success: false,
      needs_new_card: true,
      message:
        "Não conseguimos reutilizar seu cartão salvo. Refaça o checkout para atualizar sua forma de pagamento.",
    });
  }

  const scheduleTask = async (taskType: string, executeAt: Date, payload: Record<string, any>) => {
    await supabase.from("scheduled_tasks").insert({
      user_id: profile.user_id,
      task_type: taskType,
      execute_at: executeAt.toISOString(),
      status: "pending",
      payload,
    });
  };

  // ─── pause (30/60/90 dias) ────────────────────────────────────────────
  if (action === "pause") {
    const days = [30, 60, 90].includes(Number(pause_days)) ? Number(pause_days) : 30;
    logA("Pausando via workaround", { subscriptionId, days });

    // Cancela a sub atual → para de cobrar
    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logA("Erro cancelando sub para pausa", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui pausar agora. Tenta de novo." });
    }

    // Agenda retomada
    const resumeAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await scheduleTask("asaas_resume_subscription", resumeAt, {
      user_id: profile.user_id,
      customer_id: profile.asaas_customer_id,
      value,
      cycle,
      card_token: cardToken,
      description: `Aura ${planLabel} - assinatura`,
    });

    await supabase.from("cancellation_feedback").insert({
      phone: phoneClean,
      user_id: profile.user_id,
      reason: reason || "pause_requested",
      reason_detail: reason_detail || null,
      action_taken: "paused",
      pause_until: resumeAt.toISOString(),
      save_offer_accepted: true,
      save_tier: "pause",
      gateway: "asaas_card",
    });
    await supabase.from("profiles").update({ status: "paused" }).eq("user_id", profile.user_id);
    await logRetention("pause", "accepted", { days });
    await logRetention("pause", "applied", { days });

    return jsonResponse({
      success: true,
      status: "paused",
      message: `Sua assinatura foi pausada por ${days} dias. Ela volta automaticamente em ${resumeAt.toLocaleDateString("pt-BR")}.`,
      subscription: {
        id: subscriptionId,
        resumesAt: resumeAt.toISOString(),
        resumesAtFormatted: resumeAt.toLocaleDateString("pt-BR"),
      },
    });
  }

  // ─── apply_discount_3m ────────────────────────────────────────────────
  if (action === "apply_discount_3m") {
    if (await hasRecentDiscount()) {
      return jsonResponse({
        success: false,
        message: "Você já usou o desconto de retenção nos últimos 12 meses.",
        discount_available: false,
      });
    }

    const discountedValue = Math.round(value * 0.70 * 100) / 100;
    logA("Aplicando 30% off via nova sub", { subscriptionId, discountedValue });

    // Cria sub com desconto
    let newSub: any;
    try {
      newSub = await asaasFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: profile.asaas_customer_id,
          billingType: "CREDIT_CARD",
          creditCardToken: cardToken,
          cycle,
          value: discountedValue,
          nextDueDate,
          description: `Aura ${planLabel} - desconto retenção 3m`,
          externalReference: `aura_retention_discount_${profile.user_id}_${Date.now()}`,
        }),
      });
    } catch (e) {
      logA("Erro criando sub descontada", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui aplicar o desconto agora." });
    }

    // Cancela sub antiga (best-effort)
    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logA("WARN sub antiga órfã", { subscriptionId, err: (e as Error).message });
    }

    // Agenda restauração do valor cheio na 4ª cobrança
    const cycleDays = ASAAS_CYCLE_DAYS[cycle] || 30;
    const restoreAt = new Date(Date.now() + 3 * cycleDays * 24 * 60 * 60 * 1000);
    await scheduleTask("asaas_restore_full_price", restoreAt, {
      user_id: profile.user_id,
      customer_id: profile.asaas_customer_id,
      discount_subscription_id: newSub?.id,
      full_value: value,
      cycle,
      card_token: cardToken,
      description: `Aura ${planLabel} - assinatura`,
    });

    await supabase.from("cancellation_feedback").insert({
      phone: phoneClean,
      user_id: profile.user_id,
      reason: reason || "expensive",
      reason_detail: reason_detail || null,
      action_taken: "discount_30",
      save_offer_accepted: true,
      save_tier: "discount_30",
      gateway: "asaas_card",
    });
    await logRetention("discount_30", "accepted", { new_sub: newSub?.id });
    await logRetention("discount_30", "applied", { new_sub: newSub?.id });

    return jsonResponse({
      success: true,
      status: "discount_applied",
      message: `Pronto! Você tem 30% de desconto nas próximas 3 cobranças (a partir de ${nextDueDateFmt}). Depois o valor volta ao normal.`,
      tier: "discount_30",
    });
  }

  // ─── downgrade_to_lite / downgrade_to_base ────────────────────────────
  if (action === "downgrade_to_lite" || action === "downgrade_to_base") {
    const tier: "lite" | "base" = action === "downgrade_to_lite" ? "lite" : "base";
    const newValue = ASAAS_RETENTION_VALUES[tier];
    logA(`Downgrade para ${tier}`, { subscriptionId, newValue });

    let newSub: any;
    try {
      newSub = await asaasFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: profile.asaas_customer_id,
          billingType: "CREDIT_CARD",
          creditCardToken: cardToken,
          cycle: "MONTHLY",
          value: newValue,
          nextDueDate,
          description: `Aura ${tier === "lite" ? "Lite" : "Base"} - assinatura mensal`,
          externalReference: `aura_retention_${tier}_${profile.user_id}_${Date.now()}`,
        }),
      });
    } catch (e) {
      logA("Erro criando sub downgrade", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui trocar de plano agora." });
    }

    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logA("WARN sub antiga órfã", { subscriptionId, err: (e as Error).message });
    }

    await supabase
      .from("profiles")
      .update({ plan_tier: tier, status: "active", billing_cycle: "monthly" })
      .eq("user_id", profile.user_id);

    await supabase.from("cancellation_feedback").insert({
      phone: phoneClean,
      user_id: profile.user_id,
      reason: reason || "expensive",
      reason_detail: reason_detail || null,
      action_taken: `downgrade_${tier}`,
      save_offer_accepted: true,
      save_tier: tier,
      gateway: "asaas_card",
    });
    await logRetention(tier, "accepted", { new_sub: newSub?.id });
    await logRetention(tier, "applied", { new_sub: newSub?.id });

    const price = tier === "lite" ? "R$ 19,90" : "R$ 9,90";
    return jsonResponse({
      success: true,
      status: "downgraded",
      tier,
      message: `Assinatura ajustada para o plano ${tier === "lite" ? "Lite" : "Base"} (${price}/mês). A cobrança nova entra em ${nextDueDateFmt}.`,
    });
  }

  // ─── cancel ───────────────────────────────────────────────────────────
  if (action === "cancel") {
    logA("Cancelando sub Asaas", { subscriptionId });
    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logA("Erro cancelando", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui cancelar agora. Tenta de novo." });
    }

    if (reason) {
      await supabase.from("cancellation_feedback").insert({
        phone: phoneClean,
        user_id: profile.user_id,
        reason,
        reason_detail: reason_detail || null,
        action_taken: "canceled",
        save_offer_accepted: false,
        gateway: "asaas_card",
      });
    }
    await supabase.from("profiles").update({ status: "canceling" }).eq("user_id", profile.user_id);
    await logRetention("cancel", "applied", { reason });

    return jsonResponse({
      success: true,
      status: "canceled",
      message: `Sua assinatura foi cancelada. Você terá acesso até ${nextDueDateFmt}.`,
      subscription: {
        id: subscriptionId,
        endDate: nextDueDate,
        endDateFormatted: nextDueDateFmt,
      },
    });
  }

  // Ação desconhecida — cai pra fluxo Stripe (que vai devolver erro)
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Handler Asaas PIX recorrente — paridade parcial com cartão. Sem
// creditCardToken, não dá pra oferecer desconto 30% (cliente teria que
// reautorizar cada QR). Cobre check / pause / downgrade / cancel.
// ─────────────────────────────────────────────────────────────────────────
async function handleAsaasPix(params: HandleAsaasParams): Promise<Response | null> {
  const { supabase, profile, phoneClean, action, reason, reason_detail, pause_days, offeredTier } = params;
  const logP = (step: string, details?: any) =>
    console.log(`[CANCEL-SUBSCRIPTION][ASAAS-PIX] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

  let asaasFetch: (path: string, init?: RequestInit) => Promise<any>;
  try {
    asaasFetch = getAsaasClient();
  } catch (e) {
    logP("Sem ASAAS_API_KEY, delegando", { err: (e as Error).message });
    return null;
  }

  // Acha sub PIX ativa mais recente (payment_method='PIX' pelo criar-pix-recorrente).
  const { data: subRows } = await supabase
    .from("asaas_payments")
    .select("asaas_subscription_id, status, payment_method")
    .eq("asaas_customer_id", profile.asaas_customer_id)
    .eq("payment_method", "PIX")
    .not("asaas_subscription_id", "is", null)
    .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "OVERDUE"])
    .order("created_at", { ascending: false })
    .limit(1);

  const subscriptionId = subRows?.[0]?.asaas_subscription_id as string | undefined;
  if (!subscriptionId) {
    logP("Nenhuma subscription PIX Asaas encontrada");
    // PIX Automático (Bacen) e PIX avulso não têm subscription no Asaas. Se o
    // cliente chegou por link de oferta, não pode virar erro: devolve o estado
    // de reativação pro front honrar a oferta (checkout no preço do tier).
    if (offeredTier) {
      return jsonResponse({
        success: false,
        status: "no_gateway_subscription",
        offer: offeredTier,
        profile: { name: profile.name ?? null, plan: profile.plan ?? null },
        message: "Sua assinatura PIX não está mais ativa — mas a oferta continua de pé.",
      });
    }
    return jsonResponse({
      success: false,
      message: "Nenhuma assinatura PIX ativa encontrada.",
    });
  }

  // Oferta de 30% não existe no PIX (sem cartão salvo). Se o link prometeu 30%,
  // o front recebe discount_available=false e mostra Lite/Base na escada.

  let subDetails: any = {};
  try {
    subDetails = await asaasFetch(`/subscriptions/${subscriptionId}`);
  } catch (e) {
    logP("Erro buscando sub", { err: (e as Error).message });
    return jsonResponse({ success: false, message: "Não consegui acessar sua assinatura agora." });
  }

  const nextDueDate: string | null = subDetails?.nextDueDate || null;
  const value: number = Number(subDetails?.value) || 0;
  const cycle: string = String(subDetails?.cycle || "MONTHLY");
  const nextDueDateFmt = nextDueDate
    ? (() => {
        const [y, m, d] = nextDueDate.split("-");
        return `${d}/${m}/${y}`;
      })()
    : "";

  const logRetention = async (
    tier: RetentionTier | "cancel",
    actionName: "offered" | "accepted" | "declined" | "applied",
    extra: Record<string, unknown> = {},
  ) => {
    try {
      await supabase.from("retention_events").insert({
        user_id: profile.user_id,
        phone: phoneClean,
        origin: "cancel_flow",
        tier,
        action: actionName,
        gateway: "asaas_pix",
        channel: "web",
        metadata: extra,
      });
    } catch (e) {
      logP("WARN retention_events insert", { e: (e as Error).message });
    }
  };

  const buildValueRecap = async () => {
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
        (s: any) => s.confidence === "high" || s.confidence === "medium",
      ),
    };
  };

  const CANCELLATION_REASONS_LOCAL = [
    { id: "expensive", label: "Está caro pra mim" },
    { id: "not_using", label: "Não estou usando" },
    { id: "not_satisfied", label: "Não gostei do serviço" },
    { id: "come_back_later", label: "Vou voltar depois" },
    { id: "other", label: "Outro motivo" },
  ];

  const planLabel = PLAN_LABELS[profile.plan || ""] || "Assinatura AURA";

  const scheduleTask = async (taskType: string, executeAt: Date, payload: Record<string, any>) => {
    await supabase.from("scheduled_tasks").insert({
      user_id: profile.user_id,
      task_type: taskType,
      execute_at: executeAt.toISOString(),
      status: "pending",
      payload,
    });
  };

  // ─── check ────────────────────────────────────────────────────────────
  if (action === "check" || !action) {
    const valueRecap = await buildValueRecap();
    return jsonResponse({
      success: true,
      status: "active",
      gateway: "asaas_pix",
      subscription: {
        id: subscriptionId,
        plan: planLabel,
        endDate: nextDueDate ? new Date(nextDueDate).toISOString() : null,
        endDateFormatted: nextDueDateFmt,
        amount: value
          ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : null,
        amount_cents: Math.round(value * 100),
        price_id: subscriptionId,
        nextDueDateFormatted: nextDueDateFmt,
      },
      value_recap: valueRecap,
      // PIX recorrente Asaas não suporta desconto temporário sem token de cartão.
      discount_available: false,
      reasons: CANCELLATION_REASONS_LOCAL,
    });
  }

  // ─── apply_discount_3m — não suportado no PIX ─────────────────────────
  if (action === "apply_discount_3m") {
    return jsonResponse({
      success: false,
      discount_available: false,
      message:
        "O desconto está disponível apenas para pagamento com cartão. Veja as outras opções abaixo.",
    });
  }

  // ─── pause (30/60/90 dias) ────────────────────────────────────────────
  if (action === "pause") {
    const days = [30, 60, 90].includes(Number(pause_days)) ? Number(pause_days) : 30;
    logP("Pausando via workaround", { subscriptionId, days });

    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logP("Erro cancelando sub para pausa", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui pausar agora. Tenta de novo." });
    }

    const resumeAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await scheduleTask("asaas_pix_resume_subscription", resumeAt, {
      user_id: profile.user_id,
      customer_id: profile.asaas_customer_id,
      value,
      cycle,
      billing_type: "PIX",
      description: `Aura ${planLabel} - assinatura PIX`,
    });

    await supabase.from("cancellation_feedback").insert({
      phone: phoneClean,
      user_id: profile.user_id,
      reason: reason || "pause_requested",
      reason_detail: reason_detail || null,
      action_taken: "paused",
      pause_until: resumeAt.toISOString(),
      save_offer_accepted: true,
      save_tier: "pause",
      gateway: "asaas_pix",
    });
    await supabase.from("profiles").update({ status: "paused" }).eq("user_id", profile.user_id);
    await logRetention("pause", "accepted", { days });
    await logRetention("pause", "applied", { days });

    return jsonResponse({
      success: true,
      status: "paused",
      message: `Sua assinatura foi pausada por ${days} dias. O próximo QR PIX chega automático em ${resumeAt.toLocaleDateString("pt-BR")}.`,
      subscription: {
        id: subscriptionId,
        resumesAt: resumeAt.toISOString(),
        resumesAtFormatted: resumeAt.toLocaleDateString("pt-BR"),
      },
    });
  }

  // ─── downgrade_to_lite / downgrade_to_base ────────────────────────────
  if (action === "downgrade_to_lite" || action === "downgrade_to_base") {
    const tier: "lite" | "base" = action === "downgrade_to_lite" ? "lite" : "base";
    const newValue = ASAAS_RETENTION_VALUES[tier];
    logP(`Downgrade PIX para ${tier}`, { subscriptionId, newValue });

    let newSub: any;
    try {
      newSub = await asaasFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: profile.asaas_customer_id,
          billingType: "PIX",
          cycle: "MONTHLY",
          value: newValue,
          nextDueDate,
          description: `Aura ${tier === "lite" ? "Lite" : "Base"} - assinatura mensal PIX`,
          externalReference: `aura_retention_${tier}_pix_${profile.user_id}_${Date.now()}`,
        }),
      });
    } catch (e) {
      logP("Erro criando sub downgrade", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui trocar de plano agora." });
    }

    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logP("WARN sub antiga órfã", { subscriptionId, err: (e as Error).message });
    }

    await supabase
      .from("profiles")
      .update({ plan_tier: tier, status: "active", billing_cycle: "monthly" })
      .eq("user_id", profile.user_id);

    await supabase.from("cancellation_feedback").insert({
      phone: phoneClean,
      user_id: profile.user_id,
      reason: reason || "expensive",
      reason_detail: reason_detail || null,
      action_taken: `downgrade_${tier}`,
      save_offer_accepted: true,
      save_tier: tier,
      gateway: "asaas_pix",
    });
    await logRetention(tier, "accepted", { new_sub: newSub?.id });
    await logRetention(tier, "applied", { new_sub: newSub?.id });

    const price = tier === "lite" ? "R$ 19,90" : "R$ 9,90";
    return jsonResponse({
      success: true,
      status: "downgraded",
      tier,
      message: `Assinatura ajustada para o plano ${tier === "lite" ? "Lite" : "Base"} (${price}/mês). O próximo QR PIX chega no dia ${nextDueDateFmt}.`,
    });
  }

  // ─── cancel ───────────────────────────────────────────────────────────
  if (action === "cancel") {
    logP("Cancelando sub PIX Asaas", { subscriptionId });
    try {
      await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
    } catch (e) {
      logP("Erro cancelando", { err: (e as Error).message });
      return jsonResponse({ success: false, message: "Não consegui cancelar agora. Tenta de novo." });
    }

    if (reason) {
      await supabase.from("cancellation_feedback").insert({
        phone: phoneClean,
        user_id: profile.user_id,
        reason,
        reason_detail: reason_detail || null,
        action_taken: "canceled",
        save_offer_accepted: false,
        gateway: "asaas_pix",
      });
    }
    await supabase.from("profiles").update({ status: "canceling" }).eq("user_id", profile.user_id);
    await logRetention("cancel", "applied", { reason });

    return jsonResponse({
      success: true,
      status: "canceled",
      message: `Sua assinatura foi cancelada. Você terá acesso até ${nextDueDateFmt}.`,
      subscription: {
        id: subscriptionId,
        endDate: nextDueDate,
        endDateFormatted: nextDueDateFmt,
      },
    });
  }

  return null;
}
