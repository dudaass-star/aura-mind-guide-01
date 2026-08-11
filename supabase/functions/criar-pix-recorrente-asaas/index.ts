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
  essencial:     { monthly: 2990, quarterly: 5970,  semestral: 8940,  yearly: 11880 },
  direcao:       { monthly: 4990, quarterly: 10170, semestral: 14940, yearly: 20280 },
  transformacao: { monthly: 7990, quarterly: 16170, semestral: 23940, yearly: 32280 },
};

// Trial semanal (1ª semana promocional) — paridade com o cartão Stripe.
// Só existe no ciclo MENSAL e só na 1ª compra do cliente.
const TRIAL_PRICES: Record<string, number> = {
  essencial: 690,
  direcao: 990,
  transformacao: 1990,
};
const TRIAL_DAYS = 7;

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

// Retornante = cliente que já pagou alguma vez (perfil, Asaas ou Stripe).
// Mesma regra do cartão: o semanal é isca de aquisição, 1× por cliente.
async function isReturningCustomer(
  supabase: any,
  email: string,
  phoneDigits: string,
): Promise<boolean> {
  try {
    const orParts = [`email.eq.${email}`];
    if (phoneDigits) {
      orParts.push(`phone.eq.${phoneDigits}`, `phone.eq.55${phoneDigits}`);
    }
    // `profiles` não tem coluna de cliente Stripe: pedir por ela derrubava a
    // checagem em silêncio e liberava trial para retornante.
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, plan, asaas_customer_id")
      .or(orParts.join(","))
      .limit(5);
    if (profErr) {
      console.error("[criar-pix-recorrente-asaas] checagem de perfil falhou:", profErr.message);
      return true;
    }
    if ((profiles || []).some((p: any) => p.plan || p.asaas_customer_id)) {
      return true;
    }

    const { data: paid } = await supabase
      .from("asaas_payments")
      .select("id")
      .eq("customer_email", email)
      .in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])
      .limit(1);
    if (paid && paid.length > 0) return true;

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (STRIPE_SECRET_KEY) {
      const resp = await fetch(
        `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
      );
      const json = await resp.json().catch(() => ({}));
      const customerId = json?.data?.[0]?.id;
      if (customerId) {
        const subs = await fetch(
          `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=all&limit=1`,
          { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
        );
        const subsJson = await subs.json().catch(() => ({}));
        if ((subsJson?.data || []).length > 0) return true;
      }
    }
  } catch (e) {
    // Falha na checagem NÃO pode bloquear checkout: cai no caminho conservador
    // (sem trial) só se der erro depois; aqui assumimos novo cliente.
    console.warn("[criar-pix-recorrente-asaas] checagem de retornante falhou:", (e as Error)?.message);
  }
  return false;
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
    let { plan, billing, name, email, phone, cpf, fbp, fbc, gaClientId } =
      body as Record<string, string>;
    const mode = (body as Record<string, string>).mode || "checkout";
    const reauthToken = (body as Record<string, string>).token;

    const supabaseEarly = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---- Modo reautorização ----------------------------------------------
    // A API da Asaas exige `immediateQrCode` em toda autorização (não existe QR
    // só de consentimento). Então reautorizar = nova autorização Jornada 3, cujo
    // pagamento imediato É a cobrança do próximo ciclo. Por isso o link só é
    // enviado na virada do ciclo — nunca em cima de um ciclo já pago.
    let reauthUserId: string | null = null;
    let previousAuthId: string | null = null;
    if (mode === "reauthorize") {
      if (!reauthToken) {
        return new Response(JSON.stringify({ error: "Token ausente" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: tokenRow } = await supabaseEarly
        .from("user_portal_tokens")
        .select("user_id")
        .eq("token", reauthToken)
        .maybeSingle();
      if (!tokenRow?.user_id) {
        return new Response(JSON.stringify({ error: "Link inválido ou expirado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      reauthUserId = tokenRow.user_id as string;

      const { data: profile } = await supabaseEarly
        .from("profiles")
        .select("id, name, email, phone, plan, billing_cycle, asaas_customer_id")
        .eq("id", reauthUserId)
        .maybeSingle();
      if (!profile) {
        return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Última autorização PIX do cliente: fonte do CPF e do ciclo contratado.
      const { data: lastAuth } = await supabaseEarly
        .from("asaas_pix_authorizations")
        .select("asaas_authorization_id, plan, billing_period, customer_cpf, customer_phone, asaas_customer_id")
        .or(`user_id.eq.${reauthUserId},customer_email.eq.${(profile.email || "").toLowerCase()}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      plan = plan || (lastAuth?.plan as string) || (profile.plan as string);
      billing = billing || (lastAuth?.billing_period as string) || (profile.billing_cycle as string) || "monthly";
      name = profile.name || (name as string) || "Cliente Aura";
      email = profile.email || (email as string);
      phone = profile.phone || (lastAuth?.customer_phone as string) || "";
      cpf = (lastAuth?.customer_cpf as string) || (cpf as string) || "";
      previousAuthId = (lastAuth?.asaas_authorization_id as string) || null;

      if (!cpf) {
        return new Response(
          JSON.stringify({ error: "CPF não encontrado — precisamos refazer o checkout" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

    const supabase = supabaseEarly;

    // ---- Trial semanal (paridade com o cartão) ----------------------------
    // Só no mensal, só em checkout novo e só pra quem nunca pagou. O valor do
    // trial vai no `immediateQrCode`; o valor recorrente autorizado segue cheio.
    const trialRequested = (body as Record<string, unknown>).trial === true;
    let trialApplied =
      trialRequested && billing === "monthly" && mode !== "reauthorize" && !!TRIAL_PRICES[plan];
    if (trialApplied && (await isReturningCustomer(supabase, emailClean, phoneClean))) {
      trialApplied = false;
      console.log(
        `[criar-pix-recorrente-asaas] trial semanal negado (retornante): ${emailClean}`,
      );
    }
    const trialCents = trialApplied ? TRIAL_PRICES[plan] : null;

    // Reaproveita customer Asaas se já houver profile vinculado.
    let asaasCustomerId: string | null = null;
    let existingProfileId: string | null = null;
    if (reauthUserId) {
      existingProfileId = reauthUserId;
      const { data: p } = await supabase
        .from("profiles")
        .select("asaas_customer_id")
        .eq("id", reauthUserId)
        .maybeSingle();
      asaasCustomerId = (p?.asaas_customer_id as string) || null;
    } else if (phoneClean) {
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
    const brtDate = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    const todayBRT = brtDate(new Date());
    // Com trial, o 1º débito recorrente é em D+7 (o QR de hoje cobra só o trial).
    // Sem trial, mantém hoje. Bacen exige >= 2 dias entre autorização e 1º débito.
    const startDateBRT = trialApplied
      ? brtDate(new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000))
      : todayBRT;
    // QR Code do 1º pagamento. TTL curto (30 min) era a causa da perda: 12 de 17
    // autorizações foram marcadas REFUSED exatamente ~30 min após a criação, ou
    // seja, expiravam antes do cliente concluir o consentimento no app do banco.
    // Passa a 24h, com fallback pra 30 min se a Asaas rejeitar o valor.
    const QR_TTL_LONG = 24 * 60 * 60;
    const QR_TTL_FALLBACK = 30 * 60;
    const buildQrExpiration = (ttl: number) =>
      new Date(Date.now() + ttl * 1000).toISOString().replace("T", " ").slice(0, 19);
    let qrTtlSeconds = QR_TTL_LONG;
    let qrExpiration = buildQrExpiration(qrTtlSeconds);
    // contractId tem limite de 35 chars no Bacen → usa hash curto.
    const contractId = `aura${plan[0]}${billing[0]}${Date.now().toString(36)}`.slice(0, 35);
    // description tem limite de 35 chars.
    const description = `Aura ${PLAN_NAMES[plan]} ${PERIOD_LABELS[billing]}`.slice(0, 35);

    // retryPolicy ALLOW_THREE_IN_SEVEN_DAYS = política Bacen 3R_7D: até 3 novas
    // tentativas de débito em 7 dias após o vencimento. Sem isso (default
    // NOT_ALLOWED) uma falha de débito mata o ciclo de vez.
    // minLimitValue NÃO pode ser enviado em autorização de valor fixo.
    // Com trial: valor imediato (R$ 6,90) != valor recorrente (R$ 29,90) — o QR
    // integrado do Bacen aceita os dois valores no mesmo consentimento.
    const buildAuthReqBody = (ttl: number, withTrial: boolean): Record<string, unknown> => {
      const immediateValue = withTrial && trialCents ? trialCents / 100 : amountDecimal;
      return {
        customerId: asaasCustomerId,
        frequency,
        contractId,
        startDate: withTrial ? startDateBRT : todayBRT,
        value: amountDecimal,
        description,
        paymentCreationMode: "SUBSCRIPTION",
        retryPolicy: "ALLOW_THREE_IN_SEVEN_DAYS",
        immediateQrCode: {
          value: immediateValue,
          originalValue: immediateValue,
          expirationDate: buildQrExpiration(ttl),
          expirationSeconds: ttl,
        },
      };
    };

    let authorization: Record<string, unknown>;
    let trialInAuthorization = trialApplied;
    try {
      authorization = await asaasFetch("/pix/automatic/authorizations", {
        method: "POST",
        body: JSON.stringify(buildAuthReqBody(qrTtlSeconds, trialInAuthorization)),
      });
    } catch (e) {
      console.warn(
        `[criar-pix-recorrente-asaas] autorização rejeitada (trial=${trialInAuthorization}, ttl=${qrTtlSeconds}s):`,
        (e as Error)?.message,
      );
      // Degradação em cascata: (1) TTL curto; (2) sem trial (valores iguais e
      // startDate hoje). Checkout nunca quebra por causa do trial.
      try {
        qrTtlSeconds = QR_TTL_FALLBACK;
        qrExpiration = buildQrExpiration(qrTtlSeconds);
        authorization = await asaasFetch("/pix/automatic/authorizations", {
          method: "POST",
          body: JSON.stringify(buildAuthReqBody(qrTtlSeconds, trialInAuthorization)),
        });
      } catch (e2) {
        if (!trialInAuthorization) throw e2;
        console.error(
          "[criar-pix-recorrente-asaas] Asaas recusou o trial no QR integrado — refazendo com valor cheio:",
          (e2 as Error)?.message,
        );
        trialInAuthorization = false;
        qrTtlSeconds = QR_TTL_LONG;
        qrExpiration = buildQrExpiration(qrTtlSeconds);
        authorization = await asaasFetch("/pix/automatic/authorizations", {
          method: "POST",
          body: JSON.stringify(buildAuthReqBody(qrTtlSeconds, false)),
        });
      }
    }

    const authorizationId = authorization?.id as string;
    if (!authorizationId) {
      throw new Error("Asaas não retornou authorization.id");
    }

    // QR Code integrado: o Asaas devolve `payload` e `encodedImage` no top-level
    // da resposta (originType=IMMEDIATE_PAYMENT_AND_RECURRING_QR_CODE). O bloco
    // `immediateQrCode` traz só metadata (expirationDate, conciliationIdentifier).
    const auth = authorization as Record<string, unknown>;
    const iqr = (auth?.immediateQrCode as Record<string, unknown>) || {};
    let qrPayload =
      (auth?.payload as string) ||
      (iqr.payload as string) ||
      (iqr.copyAndPaste as string) ||
      null;
    let qrImage =
      (auth?.encodedImage as string) ||
      (iqr.encodedImage as string) ||
      (iqr.qrCodeImage as string) ||
      null;
    const qrExpiresAt = (iqr.expirationDate as string) || qrExpiration;
    const invoiceUrl = (auth?.invoiceUrl as string) || (iqr.invoiceUrl as string) || null;

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
      start_date: trialInAuthorization ? startDateBRT : todayBRT,
      is_trial: trialInAuthorization,
      trial_value_cents: trialInAuthorization ? trialCents : null,
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

    // Visibilidade de funil: PIX passa a aparecer em checkout_sessions junto com o
    // cartão (antes só cartão era logado, o que cegava a comparação de conversão).
    // recovery_sent=true evita que o fluxo de carrinho abandonado (desenhado pra
    // cartão) dispare mensagens pra quem só gerou QR.
    if (mode !== "reauthorize") {
      const { error: funnelErr } = await supabase.from("checkout_sessions").insert({
        phone: phoneClean || "sem-telefone",
        email: emailClean,
        name,
        plan,
        billing,
        payment_method: "pix_auto",
        status: "created",
        recovery_sent: true,
      });
      if (funnelErr) {
        console.warn("[criar-pix-recorrente-asaas] funil PIX não logado:", funnelErr.message);
      }
    }

    // Reautorização: marca a autorização antiga como substituída pra a auditoria
    // parar de tratá-la como caso aberto e não reenviar link.
    if (mode === "reauthorize" && previousAuthId) {
      await supabase
        .from("asaas_pix_authorizations")
        .update({ replaced_by_authorization_id: authorizationId })
        .eq("asaas_authorization_id", previousAuthId);
      console.log(
        `[criar-pix-recorrente-asaas] reautorização: ${previousAuthId} → ${authorizationId}`,
      );
    }

    return new Response(
      JSON.stringify({
        authorizationId,
        amount: trialInAuthorization && trialCents ? trialCents / 100 : amountDecimal,
        recurringAmount: amountDecimal,
        trial: trialInAuthorization,
        firstRecurringChargeDate: trialInAuthorization ? startDateBRT : todayBRT,
        qrCodeImage: qrImage,
        copyPaste: qrPayload,
        expiresAt: qrExpiresAt,
        invoiceUrl,
        frequency,
        pixAutomatic: true,
        plan,
        billing,
        reauthorize: mode === "reauthorize",
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