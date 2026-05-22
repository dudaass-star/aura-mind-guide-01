// Edge function: cria assinatura PIX recorrente via Asaas.
// Diferença vs criar-pix-asaas (one-time): aqui criamos uma /subscriptions com cycle
// (MONTHLY/QUARTERLY/SEMIANNUALLY/YEARLY). Asaas gera o primeiro payment automaticamente;
// a cada ciclo ele gera um novo PIX e dispara PAYMENT_RECEIVED no webhook quando o
// cliente paga. Se a conta Asaas tiver Pix Automático habilitado, Asaas debita sozinho
// — caso contrário, o cliente recebe um novo QR por email/WhatsApp a cada ciclo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tabela de preços (valor cheio em centavos) — agora cobre os 4 ciclos.
const PRICES: Record<string, Record<string, number>> = {
  essencial:     { monthly: 2990, quarterly: 7990,  semestral: 12590, yearly: 21490 },
  direcao:       { monthly: 4990, quarterly: 13390, semestral: 20990, yearly: 35990 },
  transformacao: { monthly: 7990, quarterly: 21390, semestral: 33590, yearly: 57490 },
};

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

// Mapeamento billing → cycle aceito pelo Asaas.
const CYCLE_MAP: Record<string, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  semestral: "SEMIANNUALLY",
  yearly: "YEARLY",
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: "mês",
  quarterly: "trimestre",
  semestral: "semestre",
  yearly: "ano",
};

function cleanDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function isValidCPF(cpf: string): boolean {
  const c = cleanDigits(cpf);
  if (c.length !== 11) return false;
  if (/^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ASAAS_API_KEY) {
      console.error("[criar-pix-recorrente-asaas] ASAAS_API_KEY não configurada");
      return new Response(JSON.stringify({ error: "Configuração ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ASAAS_BASE_URL =
      ASAAS_ENV === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3";

    const body = await req.json();
    const { plan, billing, name, email, phone, cpf } = body as Record<string, string>;

    if (!plan || !billing || !name || !email || !cpf) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PRICES[plan]?.[billing] || !CYCLE_MAP[billing]) {
      return new Response(JSON.stringify({ error: "Plano/período inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isValidCPF(cpf)) {
      return new Response(JSON.stringify({ error: "CPF inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = PRICES[plan][billing];
    const amountDecimal = amountCents / 100;
    const cycle = CYCLE_MAP[billing];
    const cpfClean = cleanDigits(cpf);
    const phoneClean = cleanDigits(phone || "");
    const emailClean = email.trim().toLowerCase();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Reaproveita customer Asaas se já houver profile vinculado.
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
        console.error(`[criar-pix-recorrente-asaas] Asaas ${path} falhou:`, resp.status, json);
        throw new Error(json?.errors?.[0]?.description || `Erro Asaas (${resp.status})`);
      }
      return json;
    };

    // 1) Garante customer.
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
      if (existingProfileId && asaasCustomerId) {
        await supabase
          .from("profiles")
          .update({ asaas_customer_id: asaasCustomerId })
          .eq("id", existingProfileId);
      }
    }

    // 2) Cria a assinatura PIX. nextDueDate = hoje BRT pra primeiro QR ser imediato.
    const nextDueDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const subscription = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "PIX",
        cycle,
        value: amountDecimal,
        nextDueDate,
        description: `Aura ${PLAN_NAMES[plan]} - assinatura ${PERIOD_LABELS[billing]}`,
        externalReference: `aura_sub_${plan}_${billing}_${Date.now()}`,
      }),
    });

    const subscriptionId = subscription?.id as string;
    if (!subscriptionId) {
      throw new Error("Asaas não retornou subscription.id");
    }

    // 3) Busca o primeiro payment gerado pela subscription.
    // Pode demorar 1–2s entre criar a subscription e o payment aparecer no list.
    let firstPayment: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const list = await asaasFetch(`/subscriptions/${subscriptionId}/payments?limit=1`);
      if (list?.data?.[0]) {
        firstPayment = list.data[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!firstPayment) {
      throw new Error("Asaas não gerou primeiro payment da subscription");
    }

    const paymentId = firstPayment.id as string;
    const invoiceUrl = (firstPayment.invoiceUrl as string) || null;

    // 4) Busca QR PIX do primeiro payment.
    const qr = await asaasFetch(`/payments/${paymentId}/pixQrCode`);

    // 5) Persiste no banco. Usa asaas_subscription_id pra agrupar renovações.
    const { error: insertErr } = await supabase.from("asaas_payments").insert({
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
      status: (firstPayment.status as string) || "PENDING",
      payment_method: "PIX_SUBSCRIPTION",
      pix_qr_code: qr.encodedImage || null,
      pix_copy_paste: qr.payload || null,
      pix_expires_at: qr.expirationDate || null,
      invoice_url: invoiceUrl,
      raw_payload: { subscription, firstPayment },
    });
    if (insertErr) {
      console.error("[criar-pix-recorrente-asaas] Erro salvando pagamento:", insertErr);
    }

    return new Response(
      JSON.stringify({
        subscriptionId,
        paymentId,
        amount: amountDecimal,
        qrCodeImage: qr.encodedImage,
        copyPaste: qr.payload,
        expiresAt: qr.expirationDate,
        invoiceUrl,
        cycle,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[criar-pix-recorrente-asaas] Erro:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});