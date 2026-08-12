// Edge function: cria assinatura CARTÃO via Asaas.
// Modos:
//   - "recurring"    → POST /subscriptions billingType=CREDIT_CARD (Asaas tokeniza + renova sozinho)
//   - "installment"  → POST /payments billingType=CREDIT_CARD + installmentCount (1 pagamento parcelado)
// Padrão de ativação: cobrança 1x aprovada aqui mesmo dispara webhook PAYMENT_CONFIRMED,
// que roda o mesmo handleActivation do PIX (welcome, portal token, CAPI, etc).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getPhoneVariations } from "../_shared/zapi-client.ts";
import { saveMetaIdentity } from "../_shared/meta-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICES: Record<string, Record<string, number>> = {
  essencial:     { monthly: 2990, quarterly: 5970,  semestral: 8940,  yearly: 11880 },
  direcao:       { monthly: 4990, quarterly: 10170, semestral: 14940, yearly: 20280 },
  transformacao: { monthly: 7990, quarterly: 16170, semestral: 23940, yearly: 32280 },
};

// Trial de 7 dias (mensal cartão) — 1ª cobrança reduzida, depois valor cheio recorrente.
// Bate com o `trialPriceMap` do CheckoutV2.tsx.
const TRIAL_PRICES_CENTS: Record<string, number> = {
  essencial: 690,
  direcao: 990,
  transformacao: 1990,
};

const CYCLE_MAP: Record<string, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  semestral: "SEMIANNUALLY",
  yearly: "YEARLY",
};

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

// Traduz mensagens comuns do Asaas para PT-BR amigável.
// Se não bater nenhum padrão, cai no texto original.
function friendlyAsaasError(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s.includes("invalid card") || s.includes("cartão inválido")) return "Cartão inválido. Confira número, validade e CVV.";
  if (s.includes("expired") || s.includes("expirado")) return "Cartão expirado.";
  if (s.includes("insufficient") || s.includes("saldo") || s.includes("limite")) return "Cartão sem limite disponível.";
  if (s.includes("declined") || s.includes("recusado") || s.includes("not authorized") || s.includes("não autorizado")) {
    return "Pagamento recusado pelo banco emissor. Tente outro cartão.";
  }
  if (s.includes("cvv") || s.includes("cvc") || s.includes("verification")) return "CVV incorreto.";
  if (s.includes("holder")) return "Dados do titular incorretos.";
  if (s.includes("cpf")) return "CPF inválido para essa cobrança.";
  return raw;
}

function cleanDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function isValidCPF(cpf: string): boolean {
  const c = cleanDigits(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (sum % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (sum % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

// Padrão de notificações Aura: só email em PAYMENT_RECEIVED/OVERDUE.
async function applyAuraNotificationDefaults(
  asaasFetch: (path: string, init?: RequestInit) => Promise<any>,
  customerId: string,
): Promise<void> {
  const KEEP = new Set(["PAYMENT_RECEIVED", "PAYMENT_OVERDUE"]);
  const list = await asaasFetch(`/customers/${customerId}/notifications`);
  for (const n of (list?.data || [])) {
    const keep = KEEP.has(n.event);
    await asaasFetch(`/notifications/${n.id}`, {
      method: "PUT",
      body: JSON.stringify({
        enabled: keep,
        emailEnabledForCustomer: keep,
        smsEnabledForCustomer: false,
        phoneCallEnabledForCustomer: false,
        whatsappEnabledForCustomer: false,
      }),
    }).catch((e) => console.warn(`[notif-defaults] ${n.id} (${n.event}):`, e?.message || e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ASAAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Configuração ausente" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ASAAS_BASE_URL = ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

    const body = await req.json();
    const {
      plan, billing, mode, installments, trial,
      name, email, phone, cpf,
      card, holder,
      fbp, fbc, gaClientId,
    } = body as Record<string, any>;

    // Validações
    if (!plan || !billing || !name || !email || !cpf) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PRICES[plan]?.[billing]) {
      return new Response(JSON.stringify({ error: "Plano/período inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isValidCPF(cpf)) {
      return new Response(JSON.stringify({ error: "CPF inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!card?.number || !card?.expiryMonth || !card?.expiryYear || !card?.ccv || !card?.holderName) {
      return new Response(JSON.stringify({ error: "Dados do cartão incompletos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!holder?.postalCode || !holder?.addressNumber) {
      return new Response(JSON.stringify({ error: "Endereço do titular obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentMode = mode === "installment" ? "installment" : "recurring";
    if (paymentMode === "installment" && billing === "monthly") {
      return new Response(JSON.stringify({ error: "Parcelado indisponível no plano mensal" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = PRICES[plan][billing];
    const amountDecimal = amountCents / 100;
    const cpfClean = cleanDigits(cpf);
    const phoneClean = cleanDigits(phone || "");
    const emailClean = email.trim().toLowerCase();

    // IP remoto do cliente (obrigatório para /payments com cartão no Asaas)
    const remoteIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // Cache de identidade do Meta: fallback do Purchase se o cookie faltar depois.
    void saveMetaIdentity(supabase, { email, phone, fbp, fbc, source: "criar-cartao-asaas" });

    // Reaproveita customer se profile já existe
    let asaasCustomerId: string | null = null;
    let existingProfileId: string | null = null;
    if (phoneClean) {
      const { data: profileByPhone } = await supabase
        .from("profiles")
        .select("id, asaas_customer_id")
        .or(`phone.eq.${phoneClean},phone.eq.55${phoneClean}`)
        .maybeSingle();
      if (profileByPhone) {
        existingProfileId = profileByPhone.id;
        asaasCustomerId = profileByPhone.asaas_customer_id;
      }
    }

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
        console.error(`[criar-cartao-asaas] Asaas ${path} falhou:`, resp.status, json);
        const raw = json?.errors?.[0]?.description || `Erro Asaas (${resp.status})`;
        throw new Error(friendlyAsaasError(raw));
      }
      return json;
    };

    // 1) Garante customer
    if (!asaasCustomerId) {
      const search = await asaasFetch(`/customers?cpfCnpj=${cpfClean}&limit=1`);
      if (search?.data?.[0]?.id) {
        asaasCustomerId = search.data[0].id;
      } else {
        const created = await asaasFetch("/customers", {
          method: "POST",
          body: JSON.stringify({
            name,
            email: emailClean,
            cpfCnpj: cpfClean,
            mobilePhone: phoneClean || undefined,
            notificationDisabled: false,
          }),
        });
        asaasCustomerId = created.id;
      }
      if (asaasCustomerId) {
        applyAuraNotificationDefaults(asaasFetch, asaasCustomerId).catch((e) =>
          console.warn("[criar-cartao-asaas] notif defaults falhou:", e?.message || e)
        );
      }
      if (existingProfileId && asaasCustomerId) {
        await supabase.from("profiles")
          .update({ asaas_customer_id: asaasCustomerId })
          .eq("id", existingProfileId);
      }
    }

    const todayBRT = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const description = `Aura ${PLAN_NAMES[plan]}`.slice(0, 35);

    const creditCard = {
      holderName: String(card.holderName).trim(),
      number: cleanDigits(String(card.number)),
      expiryMonth: String(card.expiryMonth).padStart(2, "0"),
      expiryYear: String(card.expiryYear).length === 2 ? `20${card.expiryYear}` : String(card.expiryYear),
      ccv: String(card.ccv).trim(),
    };
    const creditCardHolderInfo = {
      name: String(holder.name || name).trim(),
      email: String(holder.email || emailClean).trim(),
      cpfCnpj: cpfClean,
      postalCode: cleanDigits(String(holder.postalCode)),
      addressNumber: String(holder.addressNumber).trim().slice(0, 10),
      addressComplement: holder.addressComplement || null,
      phone: cleanDigits(String(holder.phone || phoneClean)),
      mobilePhone: cleanDigits(String(holder.mobilePhone || phoneClean)),
    };

    let asaasResp: any;
    let subscriptionId: string | null = null;
    let paymentId: string | null = null;
    let paymentMethodLabel = "";
    // `paymentStatus` sempre reflete a 1ª cobrança (não o ciclo de vida da subscription).
    // Essa é a fonte da verdade que o front usa pra decidir success/pending/erro.
    let paymentStatus: string | undefined;
    let invoiceUrl: string | null = null;
    let rawForStorage: any = null;

    // Trial mensal cartão: 1ª cobrança em valor reduzido HOJE + subscription no valor cheio a partir de D+7.
    // Ativa somente pra mensal (Trim/Sem/Anual sempre à vista recorrente sem trial).
    // `let` porque o trial pode ser rebaixado silenciosamente pra false quando
    // detectamos cliente retornante (Semanal só na 1ª compra).
    let useTrial = paymentMode === "recurring" && trial === true && billing === "monthly";
    let returningCustomerMonthly = false;
    const trialCents = useTrial ? (TRIAL_PRICES_CENTS[plan] ?? amountCents) : null;

    // === REGRA: Semanal (trial 7d) é 1x por cliente. Bloqueia retornantes
    // ANTES de qualquer cobrança. Espelha checagem do create-checkout (Stripe). ===
    if (useTrial) {
      let hasAsaasHistory = false;
      let hasStripeHistory = false;

      // 1) Asaas: qualquer pagamento confirmado por email OU telefone
      try {
        const { data: asaasPays, error: asaasErr } = await supabase
          .from("asaas_payments")
          .select("id")
          .or(`customer_email.eq.${emailClean},customer_phone.eq.${phoneClean}`)
          .in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])
          .limit(1);
        if (asaasErr) {
          console.warn("[criar-cartao-asaas] Asaas history check failed (non-blocking):", asaasErr.message);
        } else {
          hasAsaasHistory = !!(asaasPays && asaasPays.length > 0);
        }
      } catch (e) {
        console.warn("[criar-cartao-asaas] Asaas history check threw (non-blocking):", e instanceof Error ? e.message : String(e));
      }

      // 2) Stripe: varredura por email + variações de telefone (cobre quem assinou no outro gateway antes)
      if (!hasAsaasHistory) {
        try {
          const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
          if (stripeKey) {
            const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
            const customerIds = new Map<string, true>();
            const byEmail = await stripe.customers.list({ email: emailClean, limit: 10 });
            for (const c of byEmail.data) customerIds.set(c.id, true);
            if (phoneClean) {
              const variations = getPhoneVariations(phoneClean);
              for (const v of variations) {
                const byPhone = await stripe.customers.search({
                  query: `metadata['phone']:'${v}'`,
                  limit: 10,
                });
                for (const c of byPhone.data) customerIds.set(c.id, true);
              }
            }
            for (const cid of customerIds.keys()) {
              const anySubs = await stripe.subscriptions.list({ customer: cid, status: "all", limit: 3 });
              if (anySubs.data.length > 0) { hasStripeHistory = true; break; }
            }
          }
        } catch (e) {
          console.warn("[criar-cartao-asaas] Stripe history check failed (non-blocking):", e instanceof Error ? e.message : String(e));
        }
      }

      if (hasAsaasHistory || hasStripeHistory) {
        // Retornante detectado → promoção silenciosa pro Mensal recorrente sem trial.
        // Cai no else-branch abaixo (POST /subscriptions cycle=MONTHLY no valor cheio),
        // sem 409, sem tela de erro. Cliente vê o valor real no form.
        console.log("[criar-cartao-asaas] ↩️ Returning customer: promovendo Semanal → Mensal recorrente", {
          emailClean, hasAsaasHistory, hasStripeHistory, plan,
        });
        useTrial = false;
        returningCustomerMonthly = true;
      }
    }

    if (paymentMode === "installment") {
      // POST /payments com installmentCount → cobrança parcelada única (status = payment status)
      const nInstallments = Math.max(2, Math.min(12, Number(installments) || 2));
      const paymentResp = await asaasFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          totalValue: amountDecimal,
          installmentCount: nInstallments,
          dueDate: todayBRT,
          description,
          creditCard,
          creditCardHolderInfo,
          remoteIp,
        }),
      });
      asaasResp = paymentResp;
      paymentId = paymentResp?.id;
      paymentStatus = paymentResp?.status as string | undefined;
      invoiceUrl = paymentResp?.invoiceUrl || null;
      rawForStorage = paymentResp;
      paymentMethodLabel = "CREDIT_CARD_INSTALLMENT";
    } else if (useTrial) {
      // 1) Cobra o trial de 7d hoje
      const trialDecimal = (trialCents ?? amountCents) / 100;
      const trialPayment = await asaasFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          value: trialDecimal,
          dueDate: todayBRT,
          description: `${description} (7d)`.slice(0, 100),
          creditCard,
          creditCardHolderInfo,
          remoteIp,
          externalReference: `aura_trial_${plan}_${Date.now()}`,
        }),
      });
      paymentId = trialPayment?.id;
      paymentStatus = trialPayment?.status as string | undefined;
      invoiceUrl = trialPayment?.invoiceUrl || null;
      rawForStorage = trialPayment;
      asaasResp = trialPayment;
      paymentMethodLabel = "CREDIT_CARD_RECURRING";

      // Só cria subscription se o trial não foi RECUSADO de cara.
      // (AWAITING_RISK_ANALYSIS ainda entra — se depois for REPROVED, webhook cancela a sub.)
      const declinedStatuses = new Set(["REFUSED", "CHARGEBACK", "DUNNING_REQUESTED", "DUNNING_RECEIVED"]);
      const okToCreateSub =
        !!paymentId &&
        !!paymentStatus &&
        !declinedStatuses.has(paymentStatus);

      if (okToCreateSub) {
        try {
          const cardToken = trialPayment?.creditCard?.creditCardToken as string | undefined;
          // nextDueDate = hoje + 7 dias (formatado BRT)
          const in7 = new Date(Date.now() + 7 * 86400_000);
          const nextDue = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric", month: "2-digit", day: "2-digit",
          }).format(in7);
          const subPayload: Record<string, unknown> = {
            customer: asaasCustomerId,
            billingType: "CREDIT_CARD",
            cycle: "MONTHLY",
            value: amountDecimal,
            nextDueDate: nextDue,
            description,
            remoteIp,
          };
          if (cardToken) {
            subPayload.creditCardToken = cardToken;
          } else {
            // sem token (edge case) → repassa os dados do cartão pra Asaas tokenizar de novo
            subPayload.creditCard = creditCard;
            subPayload.creditCardHolderInfo = creditCardHolderInfo;
          }
          const subResp = await asaasFetch("/subscriptions", {
            method: "POST",
            body: JSON.stringify(subPayload),
          });
          subscriptionId = subResp?.id || null;
        } catch (subErr) {
          console.error("[criar-cartao-asaas] trial: sub creation failed (non-blocking):", subErr);
          // Se falhou criar sub, ainda temos o trial cobrado — logar e seguir.
          // Precisa ser visível: alerta em failed_message_log.
          try {
            await supabase.from("failed_message_log").insert({
              failure_reason: "asaas_trial_subscription_failed",
              error_details: {
                paymentId, plan, billing,
                email: emailClean,
                message: subErr instanceof Error ? subErr.message : String(subErr),
              },
            });
          } catch (_logErr) { /* best-effort */ }
        }
      }
    } else {
      // Recorrente sem trial (Trim/Sem/Anual, ou monthly com trial=false):
      // POST /subscriptions com cobrança HOJE → status vem da 1ª cobrança, não da sub.
      const subResp = await asaasFetch("/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          cycle: CYCLE_MAP[billing],
          value: amountDecimal,
          nextDueDate: todayBRT,
          description,
          creditCard,
          creditCardHolderInfo,
          remoteIp,
        }),
      });
      subscriptionId = subResp?.id || null;
      // Busca 1ª cobrança gerada + lê o status DELA (fonte da verdade, não a sub)
      let firstPayment: any = null;
      try {
        const payments = await asaasFetch(`/subscriptions/${subscriptionId}/payments?limit=1`);
        firstPayment = payments?.data?.[0] || null;
      } catch (pErr) {
        console.warn("[criar-cartao-asaas] falha buscando 1ª cobrança da sub:", pErr);
      }
      paymentId = firstPayment?.id || null;
      paymentStatus = (firstPayment?.status as string | undefined) || (subResp?.status as string | undefined);
      invoiceUrl = firstPayment?.invoiceUrl || null;
      rawForStorage = { subscription: subResp, firstPayment };
      asaasResp = firstPayment || subResp;
      paymentMethodLabel = "CREDIT_CARD_RECURRING";
    }

    // Persiste asaas_payments — se falhar, NÃO é non-blocking:
    // sem esse registro, o webhook não linka o pagamento a nenhum cliente
    // e a ativação nunca acontece. Registra em failed_message_log e devolve erro.
    if (paymentId) {
      const { error: insErr } = await supabase.from("asaas_payments").insert({
        asaas_payment_id: paymentId,
        asaas_customer_id: asaasCustomerId,
        asaas_subscription_id: subscriptionId,
        user_id: existingProfileId,
        customer_name: name,
        customer_email: emailClean,
        customer_phone: phoneClean || null,
        customer_cpf: cpfClean,
        plan,
        billing_period: billing,
        amount_cents: amountCents,
        status: paymentStatus || "PENDING",
        payment_method: paymentMethodLabel,
        invoice_url: invoiceUrl,
        fbp: fbp || null,
        fbc: fbc || null,
        ga_client_id: gaClientId || null,
        raw_payload: rawForStorage,
      });
      if (insErr) {
        console.error("[criar-cartao-asaas] ❌ INSERT asaas_payments falhou:", insErr);
        try {
          await supabase.from("failed_message_log").insert({
            failure_reason: "asaas_payments_insert_failed",
            error_details: {
              paymentId, subscriptionId, plan, billing,
              email: emailClean, error: insErr.message,
            },
          });
        } catch (_logErr) { /* best-effort */ }
        return new Response(JSON.stringify({
          error: "Pagamento criado mas falha ao registrar. Fala com o suporte com esse código: " + paymentId,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      // Sem paymentId significa que Asaas não retornou nada persistível — provavelmente erro upstream
      console.error("[criar-cartao-asaas] ❌ Asaas não retornou paymentId");
      return new Response(JSON.stringify({ error: "Não conseguimos processar o pagamento agora. Tenta de novo." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marca gateway do cartão no profile pra decisões futuras (change-plan, etc)
    if (existingProfileId) {
      await supabase.from("profiles")
        .update({ card_gateway: "asaas" })
        .eq("id", existingProfileId);
    }

    // Decisão de UX (front usa isso):
    // - success=true → CONFIRMED/RECEIVED (cartão aprovou na hora) → /obrigado
    // - pending=true → AWAITING_RISK_ANALYSIS → tela de análise
    // - qualquer outro (REFUSED, DECLINED, etc) → erro
    const isSuccess = paymentStatus === "CONFIRMED" || paymentStatus === "RECEIVED";
    const isPending = paymentStatus === "AWAITING_RISK_ANALYSIS";

    if (!isSuccess && !isPending) {
      // Cartão negado — tentamos cancelar a sub criada (se houver) pra não deixar zumbi
      if (subscriptionId) {
        await asaasFetch(`/subscriptions/${subscriptionId}`, { method: "DELETE" }).catch(() => {});
      }
      return new Response(JSON.stringify({
        error: "Pagamento recusado pelo banco emissor. Tente outro cartão.",
        status: paymentStatus,
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: isSuccess,
      pending: isPending,
      status: paymentStatus,
      paymentId,
      subscriptionId,
      invoiceUrl,
      mode: paymentMode,
      trial: useTrial,
      returning_customer: returningCustomerMonthly,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[criar-cartao-asaas] Erro:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});