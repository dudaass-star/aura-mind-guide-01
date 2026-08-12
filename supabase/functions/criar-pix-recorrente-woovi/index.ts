// Edge function: cria a autorização de PIX AUTOMÁTICO (Bacen) via Woovi/OpenPix
// na JORNADA 3 (`PAYMENT_ON_APPROVAL`) — um único QR Code que, no mesmo scan,
// cobra o valor de entrada E autoriza os débitos futuros.
//
// Por que a Woovi e não o Inter: o Inter só implementa a Jornada 2 (pagamento e
// autorização separados), o que quebrava a promo "1ª semana R$ 6,90 + mensal
// cheio". A Woovi faz a jornada composta, mesma UX do antigo QR integrado do Asaas.
//
// O trial pago usa uma cobrança avulsa de entrada e um mandato ONLY_RECURRENCY
// com `value` cheio. Campos de faixa, como `minimumValue`, não podem ser enviados:
// eles fazem o PSP registrar a autorização como variável no arranjo Pix.
//
// A ativação de acesso NUNCA acontece aqui — só no webhook, com dinheiro entrando.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import {
  wooviFetch, brtDate, WOOVI_FREQUENCY,
  normalizeMandateStatus, MANDATE_ACTIVE_STATUSES,
} from "../_shared/woovi.ts";
import { composeQr, extractWooviUrl } from "../_shared/pix-emv.ts";
import { buildFixedPixRecurringOptions } from "../_shared/woovi-subscription-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Preços cheios em centavos — espelham plan-pricing.ts e os outros trilhos PIX.
const PRICES: Record<string, Record<string, number>> = {
  essencial:     { monthly: 2990, quarterly: 5970,  semestral: 8940,  yearly: 11880 },
  direcao:       { monthly: 4990, quarterly: 10170, semestral: 14940, yearly: 20280 },
  transformacao: { monthly: 7990, quarterly: 16170, semestral: 23940, yearly: 32280 },
};

// Valor de entrada promocional: só no ciclo mensal e só na 1ª compra do cliente.
const TRIAL_PRICES: Record<string, number> = { essencial: 690, direcao: 990, transformacao: 1990 };

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial", direcao: "Direção", transformacao: "Transformação",
};
const PERIOD_LABELS: Record<string, string> = {
  monthly: "mês", quarterly: "trimestre", semestral: "semestre", yearly: "ano",
};
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semestral: 6, yearly: 12,
};

// A Woovi expira a cobrança em `dayDue` dias; 1 dia é folga suficiente e evita QR
// velho circulando. O TTL exposto ao front segue o padrão do projeto: 24h.
const QR_TTL_SECONDS = 24 * 60 * 60;
const DAY_DUE = 3;

// A API da Woovi exige endereço do cliente, mas o checkout da Aura não pede
// endereço (e o Bacen não mostra endereço no mandato). Enviamos o endereço da
// empresa como placeholder — trocar isso exigiria um campo novo no checkout.
const PLACEHOLDER_ADDRESS = {
  zipcode: "01310100",
  street: "Avenida Paulista",
  number: "1000",
  neighborhood: "Bela Vista",
  city: "Sao Paulo",
  state: "SP",
  complement: "",
};

function cleanDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function isValidCPF(cpf: string): boolean {
  const c = cleanDigits(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
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

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

// Retornante = já pagou alguma vez (perfil, Woovi, Inter, Asaas ou Stripe).
// O valor de entrada promocional é isca de aquisição: 1× por cliente.
async function isReturningCustomer(supabase: any, email: string, phoneDigits: string): Promise<boolean> {
  try {
    const orParts = [`email.eq.${email}`];
    if (phoneDigits) orParts.push(`phone.eq.${phoneDigits}`, `phone.eq.55${phoneDigits}`);
    const { data: profiles, error: profErr } = await supabase
      .from("profiles").select("id, plan, asaas_customer_id")
      .or(orParts.join(",")).limit(5);
    if (profErr) {
      console.error("[criar-pix-recorrente-woovi] checagem de perfil falhou:", profErr.message);
      return true; // fail-safe: na dúvida, sem promo.
    }
    if ((profiles || []).some((p: any) => p.plan || p.asaas_customer_id)) return true;

    const { data: wooviPaid } = await supabase
      .from("woovi_subscriptions").select("id")
      .eq("customer_email", email).in("status", MANDATE_ACTIVE_STATUSES).limit(1);
    if (wooviPaid && wooviPaid.length > 0) return true;

    const { data: interPaid } = await supabase
      .from("inter_pix_recurrences").select("id")
      .eq("customer_email", email).in("status", MANDATE_ACTIVE_STATUSES).limit(1);
    if (interPaid && interPaid.length > 0) return true;

    const { data: paid } = await supabase
      .from("asaas_payments").select("id").eq("customer_email", email)
      .in("status", ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]).limit(1);
    if (paid && paid.length > 0) return true;

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (STRIPE_SECRET_KEY) {
      const resp = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
      const json = await resp.json().catch(() => ({}));
      const customerId = json?.data?.[0]?.id;
      if (customerId) {
        const subs = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=all&limit=1`,
          { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
        const subsJson = await subs.json().catch(() => ({}));
        if ((subsJson?.data || []).length > 0) return true;
      }
    }
  } catch (e) {
    console.warn("[criar-pix-recorrente-woovi] checagem de retornante falhou:", (e as Error)?.message);
  }
  return false;
}

// A Woovi devolve só o `emv` (BR Code); a imagem é gerada aqui como SVG em data
// URI — o CheckoutV2 aceita tanto base64 puro quanto valores prefixados por `data:`.
async function buildQrImage(payload: string): Promise<string | null> {
  try {
    const svg: string = await QRCode.toString(payload, { type: "svg", margin: 1, width: 320 });
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch (e) {
    console.warn("[criar-pix-recorrente-woovi] falha gerando imagem do QR:", (e as Error)?.message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!Deno.env.get("WOOVI_APP_ID")) {
      console.error("[criar-pix-recorrente-woovi] WOOVI_APP_ID ausente");
      return json({ error: "Configuração ausente" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as Record<string, string>;
    let { plan, billing, name, email, phone, cpf } = body;
    const { fbp, fbc, gaClientId } = body;
    const mode = body.mode || "checkout";
    const reauthToken = body.token;
    const deferReplacement = body.deferReplacement === "true";
    const requestKeyInput = body.requestKey?.trim();
    const requestKey = requestKeyInput && /^[A-Za-z0-9_-]{16,100}$/.test(requestKeyInput)
      ? `${mode}:${requestKeyInput}`
      : mode === "reauthorize" && reauthToken
        ? `reauthorize:${reauthToken}`
        : null;

    // ---- Reautorização: mandato revogado pelo cliente no app do banco --------
    let reauthUserId: string | null = null;
    let previousSubscriptionId: string | null = null;
    if (mode === "reauthorize") {
      if (!reauthToken) return json({ error: "Token ausente" }, 400);
      const { data: tokenRow } = await supabase
        .from("user_portal_tokens").select("user_id").eq("token", reauthToken).maybeSingle();
      if (!tokenRow?.user_id) return json({ error: "Link inválido ou expirado" }, 400);
      const { data: prof } = await supabase
        .from("profiles").select("id, name, email, phone, plan, billing_cycle")
        .eq("user_id", tokenRow.user_id).maybeSingle();
      if (!prof?.id) return json({ error: "Cadastro não encontrado" }, 404);
      reauthUserId = prof.id;
      const { data: prev } = await supabase
        .from("woovi_subscriptions")
        .select("subscription_id, plan, billing_period, customer_cpf, customer_name, customer_email, customer_phone")
        .eq("user_id", reauthUserId).is("replaced_by_subscription_id", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      previousSubscriptionId = prev?.subscription_id || null;

      plan = plan || prev?.plan || prof?.plan || "";
      billing = billing || prev?.billing_period || prof?.billing_cycle || "monthly";
      name = name || prev?.customer_name || prof?.name || "Cliente";
      email = email || prev?.customer_email || prof?.email || "";
      phone = phone || prev?.customer_phone || prof?.phone || "";
      cpf = cpf || prev?.customer_cpf || "";
      if (!cpf) return json({ error: "CPF do cadastro não encontrado — fale com o suporte" }, 400);
    }

    if (!plan || !PRICES[plan]) return json({ error: "Plano inválido" }, 400);
    if (!billing || !WOOVI_FREQUENCY[billing]) return json({ error: "Ciclo inválido" }, 400);
    if (!name || !email) return json({ error: "Nome e email são obrigatórios" }, 400);

    const cpfClean = cleanDigits(cpf);
    if (!isValidCPF(cpfClean)) return json({ error: "CPF inválido" }, 400);

    const emailClean = email.trim().toLowerCase();
    const phoneClean = cleanDigits(phone);
    const amountCents = PRICES[plan][billing];

    // Promo de entrada: mensal + cliente novo + checkout (nunca em reautorização).
    const returning = await isReturningCustomer(supabase, emailClean, phoneClean);
    const trialCents = TRIAL_PRICES[plan] ?? null;
    const withTrial = mode === "checkout" && billing === "monthly" && !returning && !!trialCents;
    const entryCents = withTrial ? (trialCents as number) : amountCents;

    // Clique repetido / retomada de página reaproveitam o mesmo mandato enquanto
    // o QR continua válido — nunca criamos dois débitos automáticos para a mesma
    // intenção de checkout.
    if (requestKey) {
      const { data: prior } = await supabase
        .from("woovi_subscriptions")
        .select("subscription_id, plan, billing_period, is_trial, trial_value_cents, value_cents, qr_payload, qr_encoded_image, qr_expires_at, status, creation_status, next_charge_date")
        .eq("request_key", requestKey).maybeSingle();
      const reusable = prior?.creation_status === "completed"
        && prior.qr_payload
        && prior.subscription_id
        && prior.qr_expires_at
        && new Date(prior.qr_expires_at).getTime() > Date.now()
        && !["CANCELED", "REJECTED", "INACTIVE", "ABANDONADA"].includes(String(prior.status));
      if (reusable) {
        return json({
          authorizationId: prior.subscription_id,
          amount: (prior.is_trial ? prior.trial_value_cents : prior.value_cents) / 100,
          recurringAmount: prior.value_cents / 100,
          trial: prior.is_trial,
          trialMode: prior.is_trial ? "paid" : "none",
          trialDays: 0,
          authorizationOnly: false,
          firstRecurringChargeDate: prior.next_charge_date,
          qrCodeImage: prior.qr_encoded_image,
          copyPaste: prior.qr_payload,
          expiresAt: prior.qr_expires_at,
          pixAutomatic: true,
          gateway: "woovi",
          plan: prior.plan,
          billing: prior.billing_period,
          reused: true,
        });
      }
      if (prior && prior.creation_status === "creating") {
        return json({ error: "Sua autorização ainda está sendo preparada. Tente novamente em alguns segundos." }, 409);
      }
    }

    const now = new Date();
    // Composto (trial): a 1ª parcela do mandato só dispara em D+30 — a entrada é a
    // cobrança avulsa, não uma parcela do mandato. Nativo (sem trial): Jornada 3,
    // primeira parcela cobrada na própria aprovação (dayGenerateCharge = hoje).
    const firstChargeDate = withTrial ? addMonths(now, CYCLE_MONTHS[billing]) : now;
    const dayGenerateCharge = firstChargeDate.toISOString();
    const nextChargeDate = brtDate(addMonths(now, CYCLE_MONTHS[billing]));
    const correlationId = crypto.randomUUID();
    // Campo "contrato" mostrado no mandato: a Woovi limita a 30 caracteres.
    const comment = `Aura ${PLAN_NAMES[plan]}/${PERIOD_LABELS[billing]}`.slice(0, 29);

    // Reserva local antes de criar recurso financeiro remoto: se algo cair no
    // meio, a auditoria tem evidência e consegue reconciliar.
    const attemptId = crypto.randomUUID();
    const { error: attemptErr } = await supabase.from("woovi_subscriptions").insert({
      id: attemptId,
      request_key: requestKey,
      correlation_id: correlationId,
      plan,
      billing_period: billing,
      frequency: WOOVI_FREQUENCY[billing],
      value_cents: amountCents,
      is_trial: withTrial,
      trial_value_cents: withTrial ? trialCents : null,
      status: "CRIANDO",
      creation_status: "creating",
      start_date: brtDate(now),
      next_charge_date: nextChargeDate,
      customer_name: name,
      customer_email: emailClean,
      customer_phone: phoneClean || null,
      customer_cpf: cpfClean,
      user_id: reauthUserId,
      fbp: fbp || null,
      fbc: fbc || null,
      ga_client_id: gaClientId || null,
    });
    if (attemptErr) {
      if (attemptErr.code === "23505") {
        return json({ error: "Esta autorização já está sendo processada. Tente novamente em alguns segundos." }, 409);
      }
      throw new Error(`Não foi possível registrar a tentativa: ${attemptErr.message}`);
    }

    const customer = {
      name: name.slice(0, 200),
      taxID: cpfClean,
      email: emailClean,
      ...(phoneClean ? { phone: phoneClean.startsWith("55") ? phoneClean : `55${phoneClean}` } : {}),
      address: PLACEHOLDER_ADDRESS,
    };

    let subscriptionId = "";
    let qrPayload = "";
    let sub: Record<string, any> | undefined;
    let pixRec: Record<string, any> | undefined;
    let cobCorrelationId: string | null = null;
    let rawPayload: unknown = null;

    if (withTrial) {
      // ---- Composto: cobrança avulsa de entrada + mandato Jornada 2 fixo ----
      // O mandato sai com valor FIXO (R$ cheio) no app do banco — nada de "valor
      // variável". A entrada (R$ 6,90) vem de uma cobrança avulsa (tag 26 /cob/);
      // o mandato (tag 80 /rec/) só autoriza débitos a partir de D+30. O BR Code
      // final é composto manualmente (composeQr) para os dois num único scan.
      cobCorrelationId = crypto.randomUUID();

      const cobRes = await wooviFetch<Record<string, any>>("/api/v1/charge", {
        method: "POST",
        body: {
          correlationID: cobCorrelationId,
          value: entryCents,
          paymentType: "DYNAMIC",
          comment,
          expiresIn: QR_TTL_SECONDS,
          customer,
        },
      });
      if (!cobRes.ok) {
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: `cobrança de entrada HTTP ${cobRes.status}: ${cobRes.raw.slice(0, 240)}`,
        }).eq("id", attemptId);
        throw new Error(`Woovi recusou a cobrança de entrada (HTTP ${cobRes.status}): ${cobRes.raw.slice(0, 300)}`);
      }
      const cobCharge = ((cobRes.data as Record<string, any>)?.charge || cobRes.data) as Record<string, any>;
      const cobBrCode = cobCharge?.brCode as string | undefined;
      if (!cobBrCode) {
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: "Woovi não devolveu o brCode da cobrança de entrada",
          raw_payload: cobRes.data,
        }).eq("id", attemptId);
        throw new Error("Woovi não devolveu o BR Code da cobrança de entrada");
      }

      // Mandato recorrente em Jornada 2 (só autorização; 1ª parcela em D+30).
      const created = await wooviFetch<Record<string, any>>("/api/v1/subscriptions", {
        method: "POST",
        body: {
          name: `Aura ${PLAN_NAMES[plan]}`,
          value: amountCents,
          correlationID: correlationId,
          comment,
          frequency: WOOVI_FREQUENCY[billing],
          type: "PIX_RECURRING",
          dayGenerateCharge,
          dayDue: DAY_DUE,
          pixRecurringOptions: buildFixedPixRecurringOptions("ONLY_RECURRENCY"),
          customer,
        },
      });
      if (!created.ok) {
        // Cobrança de entrada já existe — cancela pra não deixar órfã.
        await wooviFetch(`/api/v1/charge/${encodeURIComponent(cobCorrelationId)}`, { method: "DELETE" }).catch(() => {});
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: `mandato HTTP ${created.status}: ${created.raw.slice(0, 240)}`,
        }).eq("id", attemptId);
        throw new Error(`Woovi recusou o mandato (HTTP ${created.status}): ${created.raw.slice(0, 300)}`);
      }
      rawPayload = created.data;
      sub = (created.data as Record<string, any>)?.subscription as Record<string, any> | undefined;
      pixRec = sub?.pixRecurring as Record<string, any> | undefined;
      subscriptionId = String(sub?.globalID || sub?.correlationID || correlationId);
      const returnedValue = Number(sub?.value);
      if (!Number.isFinite(returnedValue) || returnedValue !== amountCents) {
        await wooviFetch(`/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: "PUT" }).catch(() => {});
        await wooviFetch(`/api/v1/charge/${encodeURIComponent(cobCorrelationId)}`, { method: "DELETE" }).catch(() => {});
        await supabase.from("woovi_subscriptions").update({
          creation_status: "compensated", status: "FALHA_VALIDACAO",
          last_error: `mandato retornou valor inesperado: ${Number.isFinite(returnedValue) ? returnedValue : "ausente"}`,
          raw_payload: created.data,
        }).eq("id", attemptId);
        throw new Error("A Woovi não confirmou o valor fixo da recorrência. Nenhuma cobrança foi mantida.");
      }
      const recEmv = pixRec?.emv as string | undefined;
      if (!recEmv) {
        await wooviFetch(`/api/v1/charge/${encodeURIComponent(cobCorrelationId)}`, { method: "DELETE" }).catch(() => {});
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: "mandato sem pixRecurring.emv",
          raw_payload: created.data,
        }).eq("id", attemptId);
        throw new Error("Woovi não devolveu o EMV do mandato (pixRecurring.emv)");
      }
      const recUrl = extractWooviUrl(recEmv, "rec");
      if (!recUrl) {
        await wooviFetch(`/api/v1/charge/${encodeURIComponent(cobCorrelationId)}`, { method: "DELETE" }).catch(() => {});
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: "URL /rec/ não encontrada no EMV do mandato",
          raw_payload: created.data,
        }).eq("id", attemptId);
        throw new Error("URL do mandato não encontrada no EMV da Woovi");
      }
      qrPayload = composeQr(cobBrCode, recUrl);
    } else {
      // ---- Nativo Jornada 3 (sem trial: valor fixo, sem variabilidade) ----
      const created = await wooviFetch<Record<string, any>>("/api/v1/subscriptions", {
        method: "POST",
        body: {
          name: `Aura ${PLAN_NAMES[plan]}`,
          value: entryCents,
          correlationID: correlationId,
          comment,
          frequency: WOOVI_FREQUENCY[billing],
          type: "PIX_RECURRING",
          dayGenerateCharge,
          dayDue: DAY_DUE,
          pixRecurringOptions: buildFixedPixRecurringOptions("PAYMENT_ON_APPROVAL"),
          customer,
        },
      });
      if (!created.ok) {
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: `Woovi recusou a assinatura HTTP ${created.status}: ${created.raw.slice(0, 240)}`,
        }).eq("id", attemptId);
        throw new Error(`Woovi recusou a assinatura (HTTP ${created.status}): ${created.raw.slice(0, 300)}`);
      }
      rawPayload = created.data;
      sub = (created.data as Record<string, any>)?.subscription as Record<string, any> | undefined;
      pixRec = sub?.pixRecurring as Record<string, any> | undefined;
      subscriptionId = String(sub?.globalID || sub?.correlationID || correlationId);
      const emv = pixRec?.emv as string | undefined;
      if (!emv) {
        await supabase.from("woovi_subscriptions").update({
          creation_status: "failed", status: "FALHA_CRIACAO",
          last_error: "Woovi não devolveu pixRecurring.emv",
          raw_payload: created.data,
        }).eq("id", attemptId);
        throw new Error("Woovi não devolveu o QR Code do mandato (pixRecurring.emv)");
      }
      qrPayload = emv;
    }

    const qrImage = await buildQrImage(qrPayload);
    const qrExpiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000).toISOString();

    // Perfil já existente (retornante ou reautorização) para amarrar o mandato.
    let userId: string | null = reauthUserId;
    if (!userId) {
      const orParts = [`email.eq.${emailClean}`];
      if (phoneClean) orParts.push(`phone.eq.${phoneClean}`, `phone.eq.55${phoneClean}`);
      const { data: prof } = await supabase.from("profiles").select("id").or(orParts.join(",")).limit(1).maybeSingle();
      userId = prof?.id || null;
    }

    const { error: persistErr } = await supabase.from("woovi_subscriptions").update({
      subscription_id: subscriptionId,
      global_id: sub?.globalID || null,
      recurrency_id: pixRec?.recurrencyId || null,
      user_id: userId,
      // Vocabulário interno (APROVADA/AGUARDANDO/...): a auditoria e a guarda
      // anti-duplicidade filtram por ele, então nunca gravamos o status cru.
      status: normalizeMandateStatus(sub?.status, "AGUARDANDO"),
      pix_status: String(pixRec?.status || "CREATED"),
      qr_payload: qrPayload,
      qr_encoded_image: qrImage,
      qr_expires_at: qrExpiresAt,
      authorization_url: sub?.paymentLinkUrl || null,
      raw_payload: rawPayload,
      // Composto: liga a cobrança de entrada ao mandato e marca o modo de criação
      // para o webhook saber pular o bump de valor (mandato já é valor cheio).
      entry_charge_correlation_id: cobCorrelationId,
      creation_mode: withTrial ? "composed" : "native",
      creation_status: "completed",
      last_error: null,
    }).eq("id", attemptId);
    if (persistErr) {
      // Mandato existe na Woovi mas não conseguimos guardar: cancela para não
      // deixar débito automático órfão.
      await wooviFetch(`/api/v1/subscriptions/${subscriptionId}/cancel`, { method: "PUT" }).catch(() => {});
      await supabase.from("woovi_subscriptions").update({
        creation_status: "compensated", status: "FALHA_PERSISTENCIA",
        last_error: `mandato criado, mas persistência falhou: ${persistErr.message}`,
      }).eq("id", attemptId);
      throw new Error("A autorização não pôde ser confirmada. Nenhuma cobrança foi mantida.");
    }

    // Visibilidade de funil: PIX aparece em checkout_sessions junto com o cartão.
    // recovery_sent=true impede o carrinho abandonado (desenhado pro cartão) de
    // disparar mensagem para quem apenas gerou QR.
    if (mode !== "reauthorize") {
      const { error: funnelErr } = await supabase.from("checkout_sessions").insert({
        phone: phoneClean || "sem-telefone", email: emailClean, name, plan, billing,
        payment_method: "pix_auto", status: "created", recovery_sent: true,
      });
      if (funnelErr) console.warn("[criar-pix-recorrente-woovi] funil não logado:", funnelErr.message);
    }

    if (mode === "reauthorize" && previousSubscriptionId && !deferReplacement) {
      await supabase.from("woovi_subscriptions")
        .update({ replaced_by_subscription_id: subscriptionId })
        .eq("subscription_id", previousSubscriptionId);
      console.log(`[criar-pix-recorrente-woovi] reautorização: ${previousSubscriptionId} → ${subscriptionId}`);
    }

    return json({
      authorizationId: subscriptionId,
      amount: entryCents / 100,
      recurringAmount: amountCents / 100,
      trial: withTrial,
      trialMode: withTrial ? "paid" : "none",
      trialDays: 0,
      // Na jornada 3 sempre há dinheiro no ato — nunca é só autorização.
      authorizationOnly: false,
      firstRecurringChargeDate: nextChargeDate,
      qrCodeImage: qrImage,
      copyPaste: qrPayload,
      expiresAt: qrExpiresAt,
      invoiceUrl: sub?.paymentLinkUrl || null,
      frequency: WOOVI_FREQUENCY[billing],
      pixAutomatic: true,
      gateway: "woovi",
      plan,
      billing,
      reauthorize: mode === "reauthorize",
    });
  } catch (error) {
    console.error("[criar-pix-recorrente-woovi] Erro:", error);
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});
