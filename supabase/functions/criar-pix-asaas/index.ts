// Edge function: cria cobrança PIX via Asaas (one-time, planos trim/sem/anual)
// Fluxo: cria/reaproveita customer → cria payment PIX → busca QR code → salva no banco
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tabela de preços PIX (valor cheio em centavos)
const PIX_PRICES: Record<string, Record<string, number>> = {
  essencial: { quarterly: 5970, semestral: 8940, yearly: 11880 },
  direcao: { quarterly: 10170, semestral: 14940, yearly: 20280 },
  transformacao: { quarterly: 16170, semestral: 23940, yearly: 32280 },
};

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

const PERIOD_NAMES: Record<string, string> = {
  quarterly: "Trimestral",
  semestral: "Semestral",
  yearly: "Anual",
};

function cleanDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

// Aplica o padrão de notificações Aura para um novo customer Asaas.
// Regra: só email em PAYMENT_RECEIVED e PAYMENT_OVERDUE. SMS/WhatsApp/voz desligados em tudo.
// Demais eventos (CREATED, DUEDATE_WARNING, UPDATED, SEND_LINHA_DIGITAVEL) ficam desabilitados.
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
      console.error("[criar-pix-asaas] ASAAS_API_KEY não configurada");
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
    const {
      plan,
      billing,
      name,
      email,
      phone,
      cpf,
    } = body as Record<string, string>;

    // Validação básica
    if (!plan || !billing || !name || !email || !cpf) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PIX_PRICES[plan]?.[billing]) {
      return new Response(JSON.stringify({ error: "Plano/período inválido para PIX" }), {
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

    const amountCents = PIX_PRICES[plan][billing];
    const amountDecimal = amountCents / 100;
    const cpfClean = cleanDigits(cpf);
    const phoneClean = cleanDigits(phone || "");
    const emailClean = email.trim().toLowerCase();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Tentar reaproveitar customer Asaas se já existir profile com mesmo email/phone
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

    // Asaas helpers
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
        console.error(`[criar-pix-asaas] Asaas ${path} falhou:`, resp.status, json);
        throw new Error(json?.errors?.[0]?.description || `Erro Asaas (${resp.status})`);
      }
      return json;
    };

    // 1) Criar/buscar customer
    if (!asaasCustomerId) {
      // Buscar por CPF antes de criar
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

        // Aplica o padrão Aura de notificações ao cliente (só email em PAYMENT_RECEIVED/OVERDUE).
        // Fire-and-forget: não bloqueia o checkout se falhar.
        applyAuraNotificationDefaults(asaasFetch, asaasCustomerId).catch((e) =>
          console.warn("[criar-pix-asaas] notif defaults falhou:", e?.message || e)
        );
      }

      // Salvar customer no profile (se existir)
      if (existingProfileId && asaasCustomerId) {
        await supabase
          .from("profiles")
          .update({ asaas_customer_id: asaasCustomerId })
          .eq("id", existingProfileId);
      }
    }

    // 2) Criar payment PIX com vencimento no dia atual em BRT.
    // Sem chave Pix própria cadastrada no Asaas, o QR dinâmico imediato só é aceito até 23:59 do mesmo dia.
    const dueDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const payment = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "PIX",
        value: amountDecimal,
        dueDate,
        description: `Aura ${PLAN_NAMES[plan]} - ${PERIOD_NAMES[billing]}`,
        externalReference: `aura_${plan}_${billing}_${Date.now()}`,
      }),
    });

    // 3) Buscar QR code PIX
    const qr = await asaasFetch(`/payments/${payment.id}/pixQrCode`);

    // 4) Salvar no banco
    const { error: insertErr } = await supabase.from("asaas_payments").insert({
      asaas_payment_id: payment.id,
      asaas_customer_id: asaasCustomerId,
      user_id: existingProfileId,
      customer_name: name,
      customer_email: emailClean,
      customer_phone: phoneClean || null,
      customer_cpf: cpfClean,
      plan,
      billing_period: billing,
      amount_cents: amountCents,
      status: payment.status || "PENDING",
      payment_method: "PIX",
      pix_qr_code: qr.encodedImage || null,
      pix_copy_paste: qr.payload || null,
      pix_expires_at: qr.expirationDate || null,
      invoice_url: payment.invoiceUrl || null,
      raw_payload: payment,
    });

    if (insertErr) {
      console.error("[criar-pix-asaas] Erro salvando pagamento:", insertErr);
    }

    return new Response(
      JSON.stringify({
        paymentId: payment.id,
        amount: amountDecimal,
        qrCodeImage: qr.encodedImage,
        copyPaste: qr.payload,
        expiresAt: qr.expirationDate,
        invoiceUrl: payment.invoiceUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[criar-pix-asaas] Erro:", error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});