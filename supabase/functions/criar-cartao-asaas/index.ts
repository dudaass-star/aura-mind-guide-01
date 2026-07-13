// Edge function: cria assinatura CARTÃO via Asaas.
// Modos:
//   - "recurring"    → POST /subscriptions billingType=CREDIT_CARD (Asaas tokeniza + renova sozinho)
//   - "installment"  → POST /payments billingType=CREDIT_CARD + installmentCount (1 pagamento parcelado)
// Padrão de ativação: cobrança 1x aprovada aqui mesmo dispara webhook PAYMENT_CONFIRMED,
// que roda o mesmo handleActivation do PIX (welcome, portal token, CAPI, etc).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRICES: Record<string, Record<string, number>> = {
  essencial:     { monthly: 2990, quarterly: 7990,  semestral: 12590, yearly: 21490 },
  direcao:       { monthly: 4990, quarterly: 13390, semestral: 20990, yearly: 35990 },
  transformacao: { monthly: 7990, quarterly: 21390, semestral: 33590, yearly: 57490 },
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
      plan, billing, mode, installments,
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
        throw new Error(json?.errors?.[0]?.description || `Erro Asaas (${resp.status})`);
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

    if (paymentMode === "recurring") {
      // POST /subscriptions com CREDIT_CARD → cria assinatura + 1ª cobrança
      asaasResp = await asaasFetch("/subscriptions", {
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
      subscriptionId = asaasResp?.id;
      // Busca 1ª cobrança gerada
      const payments = await asaasFetch(`/subscriptions/${subscriptionId}/payments?limit=1`);
      paymentId = payments?.data?.[0]?.id || null;
      paymentMethodLabel = "CREDIT_CARD_RECURRING";
    } else {
      // POST /payments com installmentCount → cobrança parcelada única
      const nInstallments = Math.max(2, Math.min(12, Number(installments) || 2));
      asaasResp = await asaasFetch("/payments", {
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
      paymentId = asaasResp?.id;
      paymentMethodLabel = "CREDIT_CARD_INSTALLMENT";
    }

    // Persiste registro do payment (webhook completa a ativação)
    if (paymentId) {
      await supabase.from("asaas_payments").insert({
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
        status: (asaasResp?.status as string) || "PENDING",
        payment_method: paymentMethodLabel,
        invoice_url: asaasResp?.invoiceUrl || null,
        fbp: fbp || null,
        fbc: fbc || null,
        ga_client_id: gaClientId || null,
        raw_payload: asaasResp,
      }).select().maybeSingle().catch((e) => {
        console.warn("[criar-cartao-asaas] insert asaas_payments (non-blocking):", e?.message);
      });
    }

    // Marca gateway do cartão no profile pra decisões futuras (change-plan, etc)
    if (existingProfileId) {
      await supabase.from("profiles")
        .update({ card_gateway: "asaas" })
        .eq("id", existingProfileId);
    }

    // Status final: CONFIRMED/RECEIVED = sucesso na hora; qualquer outra coisa (AWAITING_RISK_ANALYSIS,
    // PENDING) — o webhook completa quando o Asaas resolver.
    const status = asaasResp?.status as string | undefined;
    const success = status === "CONFIRMED" || status === "RECEIVED" || status === "ACTIVE";

    return new Response(JSON.stringify({
      success,
      pending: !success,
      status,
      paymentId,
      subscriptionId,
      invoiceUrl: asaasResp?.invoiceUrl || null,
      mode: paymentMode,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[criar-cartao-asaas] Erro:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});