// Edge function: cria autorização PIX AUTOMÁTICO Bacen via Asaas (Jornada 3).
// Endpoint: POST /v3/pix/automatic/authorizations com paymentCreationMode=SUBSCRIPTION.
// Cliente paga o 1º PIX e autoriza a recorrência no MESMO QR Code. A partir daí
// o banco debita sozinho na data de vencimento — sem novo QR a cada ciclo.
// Eventos PIX_AUTOMATIC_RECURRING_AUTHORIZATION_* e PAYMENT_RECEIVED chegam no webhook-asaas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tabela de preços (valor cheio em centavos) — cobre os 4 ciclos.
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

// Mapeamento billing → frequency aceito pelo PIX Automático Bacen.
const FREQUENCY_MAP: Record<string, string> = {
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  semestral: "SEMIANNUALLY",
  yearly: "ANNUALLY",
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

// Aplica o padrão de notificações Aura para um novo customer Asaas.
// Regra: só email em PAYMENT_RECEIVED e PAYMENT_OVERDUE. SMS/WhatsApp/voz desligados em tudo.
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
    const { plan, billing, name, email, phone, cpf, fbp, fbc, gaClientId } =
      body as Record<string, string>;

    if (!plan || !billing || !name || !email || !cpf) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PRICES[plan]?.[billing] || !FREQUENCY_MAP[billing]) {
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
    const frequency = FREQUENCY_MAP[billing];
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
      // Aplica padrão de notificações Aura no novo customer (fire-and-forget).
      if (asaasCustomerId) {
        applyAuraNotificationDefaults(asaasFetch, asaasCustomerId).catch((e) =>
          console.warn("[criar-pix-recorrente-asaas] notif defaults falhou:", e?.message || e)
        );
      }
      if (existingProfileId && asaasCustomerId) {
        await supabase
          .from("profiles")
          .update({ asaas_customer_id: asaasCustomerId })
          .eq("id", existingProfileId);
      }
    }

    // 2) Cria autorização PIX Automático Bacen (Jornada 3 — QR Code integrado:
    //    primeiro pagamento + consentimento de recorrência no mesmo escaneamento).
    const todayBRT = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    // QR Code do 1º pagamento: válido por 30 min (1800s). Bacen exige expirationSeconds
    // no immediateQrCode. Mantemos expirationDate calculado pra log/UI.
    const qrTtlSeconds = 30 * 60;
    const qrExpiration = new Date(Date.now() + qrTtlSeconds * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    // contractId tem limite de 35 chars no Bacen → usa hash curto.
    const contractId = `aura${plan[0]}${billing[0]}${Date.now().toString(36)}`.slice(0, 35);
    // description tem limite de 35 chars.
    const description = `Aura ${PLAN_NAMES[plan]} ${PERIOD_LABELS[billing]}`.slice(0, 35);

    const authReqBody: Record<string, unknown> = {
      customerId: asaasCustomerId,
      frequency,
      contractId,
      startDate: todayBRT,
      value: amountDecimal,
      description,
      paymentCreationMode: "SUBSCRIPTION",
      immediateQrCode: {
        value: amountDecimal,
        originalValue: amountDecimal,
        expirationDate: qrExpiration,
        expirationSeconds: qrTtlSeconds,
      },
    };

    const authorization = await asaasFetch("/pix/automatic/authorizations", {
      method: "POST",
      body: JSON.stringify(authReqBody),
    });

    const authorizationId = authorization?.id as string;
    if (!authorizationId) {
      throw new Error("Asaas não retornou authorization.id");
    }

    // QR Code integrado vem dentro de immediateQrCode na resposta.
    const iqr = (authorization?.immediateQrCode as Record<string, unknown>) || {};
    let qrPayload = (iqr.payload as string) || (iqr.copyAndPaste as string) || null;
    let qrImage = (iqr.encodedImage as string) || (iqr.qrCodeImage as string) || null;
    const qrExpiresAt = (iqr.expirationDate as string) || qrExpiration;
    const invoiceUrl = (authorization?.invoiceUrl as string) || (iqr.invoiceUrl as string) || null;

    // Fallback: endpoint dedicado de QR caso a resposta principal não inclua.
    if (!qrPayload || !qrImage) {
      try {
        const qrEndpoint = await asaasFetch(`/pix/automatic/authorizations/${authorizationId}/qrCode`);
        qrPayload = qrPayload || (qrEndpoint?.payload as string) || null;
        qrImage = qrImage || (qrEndpoint?.encodedImage as string) || null;
      } catch (e) {
        console.warn("[criar-pix-recorrente-asaas] QR endpoint fallback falhou:", (e as Error)?.message);
      }
    }

    if (!qrPayload || !qrImage) {
      console.error("[criar-pix-recorrente-asaas] QR ausente na resposta:", JSON.stringify(authorization));
      throw new Error("Asaas não retornou QR Code da autorização");
    }

    // 3) Persiste a autorização. Ativação real só vem no webhook
    //    PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED (depois do consent do pagador).
    const { error: insertErr } = await supabase.from("asaas_pix_authorizations").insert({
      asaas_authorization_id: authorizationId,
      asaas_customer_id: asaasCustomerId,
      user_id: existingProfileId,
      contract_id: contractId,
      plan,
      billing_period: billing,
      frequency,
      value_cents: amountCents,
      status: (authorization?.status as string) || "PENDING",
      start_date: todayBRT,
      finish_date: (authorization?.finishDate as string) || null,
      qr_payload: qrPayload,
      qr_encoded_image: qrImage,
      qr_expires_at: qrExpiresAt,
      customer_name: name,
      customer_email: emailClean,
      customer_phone: phoneClean || null,
      customer_cpf: cpfClean,
      fbp: fbp || null,
      fbc: fbc || null,
      ga_client_id: gaClientId || null,
      raw_payload: authorization,
    });
    if (insertErr) {
      console.error("[criar-pix-recorrente-asaas] Erro salvando autorização:", insertErr);
    }

    return new Response(
      JSON.stringify({
        authorizationId,
        amount: amountDecimal,
        qrCodeImage: qrImage,
        copyPaste: qrPayload,
        expiresAt: qrExpiresAt,
        invoiceUrl,
        frequency,
        pixAutomatic: true,
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