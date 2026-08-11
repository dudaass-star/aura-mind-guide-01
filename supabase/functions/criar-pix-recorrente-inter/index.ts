// Edge function: cria autorização de PIX AUTOMÁTICO Bacen via Banco Inter (Jornada 3).
//
// Fluxo validado contra a API real do Inter (cdpj.partners.bancointer.com.br):
//   1. POST /pix/v2/locrec           → payload location DA RECORRÊNCIA (campo `loc` da rec)
//   2. POST /pix/v2/loc {tipoCob}    → payload location da cobrança imediata
//   3. PUT  /pix/v2/cob/{txid}       → cobrança imediata (1ª semana R$ 6,90 ou 1º ciclo cheio)
//   4. POST /pix/v2/rec              → mandato, amarrado ao txid via ativacao.dadosJornada
//
// O QR da COBRANÇA é o "QR composto": ao escanear, o cliente paga o valor imediato
// E autoriza os débitos futuros no mesmo gesto — mesma UX do QR integrado do Asaas.
// A ativação real chega no webhook (rec status APROVADA), nunca aqui.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { interFetch, buildTxid, brtDate } from "../_shared/inter-pix.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Preços cheios em centavos — espelham criar-pix-recorrente-asaas e plan-pricing.ts.
const PRICES: Record<string, Record<string, number>> = {
  essencial:     { monthly: 2990, quarterly: 5970,  semestral: 8940,  yearly: 11880 },
  direcao:       { monthly: 4990, quarterly: 10170, semestral: 14940, yearly: 20280 },
  transformacao: { monthly: 7990, quarterly: 16170, semestral: 23940, yearly: 32280 },
};

// Trial semanal: só no ciclo mensal e só na 1ª compra do cliente.
const TRIAL_PRICES: Record<string, number> = { essencial: 690, direcao: 990, transformacao: 1990 };
const TRIAL_DAYS = 7;

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial", direcao: "Direção", transformacao: "Transformação",
};

// Periodicidade Bacen (confirmada no enum da API): SEMANAL, MENSAL, TRIMESTRAL, SEMESTRAL, ANUAL.
const PERIODICIDADE_MAP: Record<string, string> = {
  monthly: "MENSAL", quarterly: "TRIMESTRAL", semestral: "SEMESTRAL", yearly: "ANUAL",
};
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semestral: 6, yearly: 12,
};
const PERIOD_LABELS: Record<string, string> = {
  monthly: "mês", quarterly: "trimestre", semestral: "semestre", yearly: "ano",
};

const QR_TTL_SECONDS = 24 * 60 * 60; // 24h: o cliente não perde o QR por demora.

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

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

// Retornante = já pagou alguma vez (perfil, Inter, Asaas ou Stripe). O semanal é
// isca de aquisição: 1× por cliente, mesma regra do cartão.
async function isReturningCustomer(supabase: any, email: string, phoneDigits: string): Promise<boolean> {
  try {
    const orParts = [`email.eq.${email}`];
    if (phoneDigits) orParts.push(`phone.eq.${phoneDigits}`, `phone.eq.55${phoneDigits}`);
    // ATENÇÃO: `profiles` não tem coluna de cliente Stripe. Selecionar coluna
    // inexistente fazia o PostgREST devolver erro e a checagem cair em silêncio,
    // liberando o trial de R$ 6,90 para quem já foi cliente.
    const { data: profiles, error: profErr } = await supabase
      .from("profiles").select("id, plan, asaas_customer_id")
      .or(orParts.join(",")).limit(5);
    if (profErr) {
      console.error("[criar-pix-recorrente-inter] checagem de perfil falhou:", profErr.message);
      return true; // fail-safe: na dúvida, sem trial.
    }
    if ((profiles || []).some((p: any) => p.plan || p.asaas_customer_id)) return true;

    const { data: interPaid } = await supabase
      .from("inter_pix_recurrences").select("id")
      .eq("customer_email", email).in("status", ["APROVADA", "ATIVA"]).limit(1);
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
    console.warn("[criar-pix-recorrente-inter] checagem de retornante falhou:", (e as Error)?.message);
  }
  return false;
}

// O Inter devolve só o `pixCopiaECola`; a imagem do QR é gerada aqui como SVG
// em data URI (o front aceita valores já prefixados com `data:`).
async function buildQrImage(payload: string): Promise<string | null> {
  try {
    const svg: string = await QRCode.toString(payload, { type: "svg", margin: 1, width: 320 });
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } catch (e) {
    console.warn("[criar-pix-recorrente-inter] falha gerando imagem do QR:", (e as Error)?.message);
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const chave = Deno.env.get("INTER_PIX_KEY");
    if (!chave) {
      console.error("[criar-pix-recorrente-inter] INTER_PIX_KEY ausente");
      return json({ error: "Configuração ausente" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
    // Novo mandato Jornada 3 cujo pagamento imediato É o ciclo corrente. Por isso
    // o link só é enviado na virada do ciclo, nunca sobre um ciclo já pago.
    let reauthUserId: string | null = null;
    let previousIdRec: string | null = null;
    if (mode === "reauthorize") {
      if (!reauthToken) return json({ error: "Token ausente" }, 400);
      const { data: tokenRow } = await supabase
        .from("user_portal_tokens").select("user_id").eq("token", reauthToken).maybeSingle();
      if (!tokenRow?.user_id) return json({ error: "Link inválido ou expirado" }, 400);
      // ATENÇÃO: `inter_pix_recurrences.user_id` referencia `profiles.id` (não o
      // `user_id` do token). Resolver aqui evita mandato órfão.
      const { data: prof } = await supabase
        .from("profiles").select("id, name, email, phone, plan, billing_cycle")
        .eq("user_id", tokenRow.user_id).maybeSingle();
      if (!prof?.id) return json({ error: "Cadastro não encontrado" }, 404);
      reauthUserId = prof.id;
      const { data: prev } = await supabase
        .from("inter_pix_recurrences").select("id_rec, plan, billing_period, customer_cpf, customer_name, customer_email, customer_phone")
        .eq("user_id", reauthUserId).is("replaced_by_id_rec", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      previousIdRec = prev?.id_rec || null;

      // O link de reautorização só carrega o token: plano, dados do cliente e CPF
      // vêm do mandato anterior e do perfil, nunca do front.
      plan = plan || prev?.plan || prof?.plan || "";
      billing = billing || prev?.billing_period || prof?.billing_cycle || "monthly";
      name = name || prev?.customer_name || prof?.name || "Cliente";
      email = email || prev?.customer_email || prof?.email || "";
      phone = phone || prev?.customer_phone || prof?.phone || "";
      cpf = cpf || prev?.customer_cpf || "";
      if (!cpf) return json({ error: "CPF do cadastro não encontrado — fale com o suporte" }, 400);
    }

    if (!plan || !PRICES[plan]) return json({ error: "Plano inválido" }, 400);
    if (!billing || !PERIODICIDADE_MAP[billing]) return json({ error: "Ciclo inválido" }, 400);
    if (!name || !email) return json({ error: "Nome e email são obrigatórios" }, 400);

    const cpfClean = cleanDigits(cpf);
    if (!isValidCPF(cpfClean)) return json({ error: "CPF inválido" }, 400);

    const emailClean = email.trim().toLowerCase();
    const phoneClean = cleanDigits(phone);
    const amountCents = PRICES[plan][billing];
    const toDecimal = (cents: number) => (cents / 100).toFixed(2);

    // Trial só existe no mensal e só para cliente novo.
    const returning = await isReturningCustomer(supabase, emailClean, phoneClean);
    const trialCents = TRIAL_PRICES[plan] ?? null;
    const withTrial = mode === "checkout" && billing === "monthly" && !returning && !!trialCents;

    // Clique repetido, timeout do navegador ou retomada da página reutilizam o
    // mesmo mandato enquanto o QR continua válido. Nunca geramos dois débitos
    // automáticos para a mesma intenção de checkout.
    if (requestKey) {
      const { data: prior } = await supabase
        .from("inter_pix_recurrences")
        .select("id_rec, plan, billing_period, is_trial, trial_value_cents, value_cents, qr_payload, qr_encoded_image, qr_expires_at, status, creation_status")
        .eq("request_key", requestKey).maybeSingle();
      const reusable = prior?.creation_status === "completed"
        && prior.qr_payload
        && prior.id_rec
        && prior.qr_expires_at
        && new Date(prior.qr_expires_at).getTime() > Date.now()
        && !["CANCELADA", "REJEITADA", "ABANDONADA"].includes(String(prior.status));
      if (reusable) {
        return json({
          authorizationId: prior.id_rec,
          amount: (prior.is_trial ? prior.trial_value_cents : prior.value_cents) / 100,
          recurringAmount: prior.value_cents / 100,
          trial: prior.is_trial,
          qrCodeImage: prior.qr_encoded_image,
          copyPaste: prior.qr_payload,
          expiresAt: prior.qr_expires_at,
          pixAutomatic: true,
          gateway: "inter",
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
    // Com trial: 1º débito automático 1 dia após o fim da semana promocional.
    // Sem trial: a cobrança imediata cobre o ciclo 1; o mandato começa no ciclo 2.
    const dataInicial = withTrial
      ? brtDate(addDays(now, TRIAL_DAYS + 1))
      : brtDate(addMonths(now, CYCLE_MONTHS[billing]));

    const immediateCents = withTrial ? (trialCents as number) : amountCents;
    const contratoId = `aura${plan[0]}${billing[0]}${Date.now().toString(36)}`.slice(0, 35);
    const objeto = `Aura ${PLAN_NAMES[plan]} / ${PERIOD_LABELS[billing]}`.slice(0, 35);
    const txid = buildTxid(`aura${plan[0]}${billing[0]}`);

    // Reserva local antes de criar qualquer recurso financeiro remoto. Se uma
    // etapa cair, a auditoria passa a ter evidência e consegue reconciliar.
    const attemptId = crypto.randomUUID();
    const { error: attemptErr } = await supabase.from("inter_pix_recurrences").insert({
      id: attemptId,
      request_key: requestKey,
      contract_id: contratoId,
      plan,
      billing_period: billing,
      periodicidade: PERIODICIDADE_MAP[billing],
      value_cents: amountCents,
      is_trial: withTrial,
      trial_value_cents: withTrial ? trialCents : null,
      status: "CRIANDO",
      creation_status: "creating",
      start_date: dataInicial,
      next_charge_date: dataInicial,
      customer_name: name,
      customer_email: emailClean,
      customer_phone: phoneClean || null,
      customer_cpf: cpfClean,
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

    let remoteTxidCreated = false;
    let remoteIdRec: string | null = null;

    // 1) locrec: payload location exclusivo da recorrência.
    const locRec = await interFetch<{ id: number; location: string }>("/pix/v2/locrec", { method: "POST" });
    if (!locRec.ok || !locRec.data?.id) {
      throw new Error(`Inter recusou locrec (HTTP ${locRec.status}): ${locRec.raw.slice(0, 300)}`);
    }

    // 2) loc da cobrança imediata.
    const loc = await interFetch<{ id: number }>("/pix/v2/loc", {
      method: "POST", body: { tipoCob: "cob" },
    });

    // 3) Cobrança imediata: é ela que gera o QR composto.
    const cob = await interFetch<Record<string, unknown>>(`/pix/v2/cob/${txid}`, {
      method: "PUT",
      body: {
        calendario: { expiracao: QR_TTL_SECONDS },
        devedor: { cpf: cpfClean, nome: name.slice(0, 200) },
        valor: { original: toDecimal(immediateCents) },
        chave,
        solicitacaoPagador: objeto,
        ...(loc.ok && loc.data?.id ? { loc: { id: loc.data.id } } : {}),
      },
    });
    if (!cob.ok) {
      await supabase.from("inter_pix_recurrences").update({
        creation_status: "failed", status: "FALHA_CRIACAO",
        last_error: `cob recusada HTTP ${cob.status}: ${cob.raw.slice(0, 240)}`,
      }).eq("id", attemptId);
      throw new Error(`Inter recusou a cobrança (HTTP ${cob.status}): ${cob.raw.slice(0, 300)}`);
    }
    remoteTxidCreated = true;

    // 4) Recorrência amarrada ao txid da cobrança (ativação = pagamento dela).
    const rec = await interFetch<Record<string, unknown>>("/pix/v2/rec", {
      method: "POST",
      body: {
        vinculo: { contrato: contratoId, devedor: { cpf: cpfClean, nome: name.slice(0, 200) }, objeto },
        calendario: { dataInicial, periodicidade: PERIODICIDADE_MAP[billing] },
        valor: { valorRec: toDecimal(amountCents) },
        politicaRetentativa: "PERMITE_3R_7D",
        loc: locRec.data.id,
        ativacao: { dadosJornada: { txid } },
      },
    });
    if (!rec.ok) {
      // Mandato falhou: remove a cobrança para não deixar QR órfão cobrável.
      await interFetch(`/pix/v2/cob/${txid}`, {
        method: "PATCH", body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
      }).catch(() => {});
      await supabase.from("inter_pix_recurrences").update({
        creation_status: "compensated", status: "FALHA_CRIACAO",
        last_error: `rec recusada HTTP ${rec.status}: ${rec.raw.slice(0, 240)}`,
      }).eq("id", attemptId);
      throw new Error(`Inter recusou a recorrência (HTTP ${rec.status}): ${rec.raw.slice(0, 300)}`);
    }

    const recData = rec.data as Record<string, any>;
    const idRec = recData?.idRec as string;
    remoteIdRec = idRec || null;
    // ATENÇÃO: o `POST /pix/v2/rec` NÃO devolve `dadosQR` — só o `GET` devolve.
    // Sem esta releitura a função caía no QR do `cob` (paga sem autorizar).
    let recRead: Record<string, any> | null = null;
    if (idRec) {
      const recGet = await interFetch<Record<string, any>>(`/pix/v2/rec/${idRec}`, { method: "GET" });
      if (recGet.ok) recRead = recGet.data as Record<string, any>;
      else console.warn(`[criar-pix-recorrente-inter] GET rec ${idRec} falhou (HTTP ${recGet.status})`);
    }
    // QR CORRETO = o da RECORRÊNCIA (`rec.dadosQR.pixCopiaECola`, jornada
    // JORNADA_2). Ele é o composto: paga a cobrança amarrada em
    // `ativacao.dadosJornada.txid` E autoriza os débitos futuros no mesmo scan.
    // O `pixCopiaECola` do `cob` paga SÓ o valor imediato e deixa o mandato em
    // CRIADA/AGUARDANDO_DEFINICAO — foi exatamente esse o bug do 1º teste real.
    const recQr = ((recRead?.dadosQR ?? recData?.dadosQR) as Record<string, any> | undefined)
      ?.pixCopiaECola as string | undefined;
    const cobQr = (cob.data as Record<string, any>)?.pixCopiaECola as string | undefined;
    if (!recQr) {
      console.error(
        `[criar-pix-recorrente-inter] rec ${idRec} sem dadosQR.pixCopiaECola — caindo no QR simples (recorrência NÃO será autorizada)`,
      );
    }
    const qrPayload = (recQr || cobQr) as string;
    if (!idRec || !qrPayload) {
      throw new Error("Inter não devolveu idRec ou pixCopiaECola");
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

    const { error: insertErr } = await supabase.from("inter_pix_recurrences").update({
      id_rec: idRec,
      user_id: userId,
      contract_id: contratoId,
      plan,
      billing_period: billing,
      periodicidade: PERIODICIDADE_MAP[billing],
      value_cents: amountCents,
      is_trial: withTrial,
      trial_value_cents: withTrial ? trialCents : null,
      status: (recData?.status as string) || "CRIADA",
      start_date: dataInicial,
      next_charge_date: dataInicial,
      qr_payload: qrPayload,
      qr_encoded_image: qrImage,
      qr_expires_at: qrExpiresAt,
      authorization_url: (recData?.loc?.location as string) || null,
      customer_name: name,
      customer_email: emailClean,
      customer_phone: phoneClean || null,
      customer_cpf: cpfClean,
      fbp: fbp || null,
      fbc: fbc || null,
      ga_client_id: gaClientId || null,
      raw_payload: recData,
      creation_status: "creating",
    }).eq("id", attemptId);
    if (insertErr) {
      await interFetch(`/pix/v2/rec/${idRec}`, { method: "PATCH", body: { status: "CANCELADA" } }).catch(() => {});
      if (remoteTxidCreated) {
        await interFetch(`/pix/v2/cob/${txid}`, { method: "PATCH", body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" } }).catch(() => {});
      }
      await supabase.from("inter_pix_recurrences").update({
        creation_status: "compensating", status: "FALHA_PERSISTENCIA",
        last_error: `mandato criado, mas persistência falhou: ${insertErr.message}`,
      }).eq("id", attemptId);
      throw new Error("A autorização não pôde ser confirmada. Nenhuma cobrança foi mantida.");
    }

    // A cobrança imediata entra como ciclo 0 (a semana promocional ou o 1º ciclo).
    const { error: chargeErr } = await supabase.from("inter_pix_charges").insert({
      txid, id_rec: idRec, user_id: userId, cycle_index: 0,
      due_date: brtDate(now), value_cents: immediateCents,
      status: "ATIVA", raw_payload: cob.data as Record<string, unknown>,
    });
    if (chargeErr) {
      if (remoteIdRec) {
        await interFetch(`/pix/v2/rec/${remoteIdRec}`, { method: "PATCH", body: { status: "CANCELADA" } }).catch(() => {});
      }
      await interFetch(`/pix/v2/cob/${txid}`, { method: "PATCH", body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" } }).catch(() => {});
      await supabase.from("inter_pix_recurrences").update({
        creation_status: "compensating", status: "FALHA_PERSISTENCIA",
        last_error: `cobrança criada, mas persistência falhou: ${chargeErr.message}`,
      }).eq("id", attemptId);
      throw new Error("A cobrança não pôde ser confirmada. O QR foi cancelado; tente novamente.");
    }

    await supabase.from("inter_pix_recurrences").update({
      creation_status: "completed",
      status: (recData?.status as string) || "CRIADA",
      last_error: null,
    }).eq("id", attemptId);

    // Visibilidade de funil: PIX aparece em checkout_sessions junto com o cartão.
    // recovery_sent=true impede que o carrinho abandonado (desenhado pra cartão)
    // dispare mensagem para quem apenas gerou QR.
    if (mode !== "reauthorize") {
      const { error: funnelErr } = await supabase.from("checkout_sessions").insert({
        phone: phoneClean || "sem-telefone", email: emailClean, name, plan, billing,
        payment_method: "pix_auto", status: "created", recovery_sent: true,
      });
      if (funnelErr) console.warn("[criar-pix-recorrente-inter] funil não logado:", funnelErr.message);
    }

    if (mode === "reauthorize" && previousIdRec && !deferReplacement) {
      await supabase.from("inter_pix_recurrences")
        .update({ replaced_by_id_rec: idRec }).eq("id_rec", previousIdRec);
      console.log(`[criar-pix-recorrente-inter] reautorização: ${previousIdRec} → ${idRec}`);
    }

    return json({
      authorizationId: idRec,
      amount: immediateCents / 100,
      recurringAmount: amountCents / 100,
      trial: withTrial,
      firstRecurringChargeDate: dataInicial,
      qrCodeImage: qrImage,
      copyPaste: qrPayload,
      expiresAt: qrExpiresAt,
      invoiceUrl: null,
      frequency: PERIODICIDADE_MAP[billing],
      pixAutomatic: true,
      gateway: "inter",
      plan,
      billing,
      reauthorize: mode === "reauthorize",
    });
  } catch (error) {
    console.error("[criar-pix-recorrente-inter] Erro:", error);
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});
