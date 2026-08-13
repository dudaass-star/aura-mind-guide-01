// Edge function: webhook da Woovi/OpenPix — trilho PIX Automático (Bacen), Jornada 3.
//
// Eventos que importam (a Woovi envia tudo para a mesma URL):
//   • assinatura/mandato: PIX_AUTOMATIC_* / SUBSCRIPTION_* → CREATED → APPROVED
//     | REJECTED | CANCELED. APPROVED = banco do cliente autorizou os débitos.
//   • cobrança: CHARGE_COMPLETED / PIX_AUTOMATIC_COBR_COMPLETED → dinheiro entrou.
//     É AQUI que o acesso é liberado (nunca na aprovação sozinha).
//
// Segurança: não confiamos no corpo. Antes de liberar acesso, consultamos a
// própria API da Woovi para confirmar o status real do recurso — payload forjado
// não sobrevive a essa checagem (mesmo padrão do webhook-inter).
//
// Idempotência: woovi_webhook_events.event_key. A Woovi reenvia até receber 200.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { resolveMetaIdentity } from "../_shared/meta-identity.ts";
import { sendOpenAiConversion } from "../_shared/openai-capi.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import {
  wooviFetch, brtDate,
  WOOVI_APPROVED_STATUSES as APPROVED_STATUSES,
  WOOVI_REJECTED_STATUSES as REJECTED_STATUSES,
  WOOVI_CANCELED_STATUSES as CANCELED_STATUSES,
  WOOVI_PAID_STATUSES as PAID_STATUSES,
} from "../_shared/woovi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial", direcao: "Direção", transformacao: "Transformação",
};
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semestral: 6, yearly: 12,
};
const PLAN_SESSIONS: Record<string, number> = { essencial: 1, direcao: 4, transformacao: 8 };

// Vocabulário de status vive em _shared/woovi.ts (ponto único de tradução).
// Cobrança do mandato que NÃO entrou. No PIX Automático NÃO avisamos o cliente
// da falha: um clique no app do banco derruba o mandato pra sempre. Em vez de
// dunning falante, entramos na RECUPERAÇÃO SILENCIOSA de ~30 dias (reciclagem
// da parcela a cada 7 dias) e só falamos com ele no fim, já com oferta.
const UNPAID_CHARGE_STATUSES = [
  "EXPIRED", "OVERDUE", "FAILED", "REJECTED", "DECLINED", "ERROR",
  "PIX_AUTOMATIC_COBR_FAILED", "PIX_AUTOMATIC_COBR_REJECTED", "PIX_AUTOMATIC_COBR_EXPIRED",
];
// Rejeição de TENTATIVA intermediária (a própria Woovi ainda vai retentar
// dentro da política 3R/7D). Não é o fim da linha do ciclo: só registramos.
const TRY_LEVEL_MARKERS = ["TRY_REJECTED", "TRY_FAILED", "COBR_TRY"];

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

// Purchase no Meta CAPI, dedup por event_id (paridade com webhook-inter/asaas):
// sem isso a venda por PIX fica invisível para os anúncios.
async function fireMetaCapiPurchase(
  supabase: any,
  args: {
    eventId: string; email: string; phone?: string; firstName?: string;
    fbp?: string | null; fbc?: string | null; value: number; plan: string;
  },
): Promise<void> {
  try {
    const { data: prior } = await supabase
      .from("meta_capi_log").select("id")
      .eq("event_id", args.eventId).eq("event_name", "Purchase")
      .eq("meta_status", 200).limit(1).maybeSingle();
    if (prior) return;

    // Sem cookie na transação (compra em outro dispositivo, cookie apagado),
    // recupera o último fbp/fbc conhecido do lead.
    const ident = await resolveMetaIdentity(supabase, {
      email: args.email, phone: args.phone, fbp: args.fbp, fbc: args.fbc,
    });

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${url}/functions/v1/meta-capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        event_name: "Purchase",
        event_id: args.eventId,
        event_source_url: "https://olaaura.com.br/obrigado",
        source: "webhook-woovi",
        is_first_purchase: true,
        user_data: {
          email: args.email,
          phone: args.phone || undefined,
          first_name: args.firstName || undefined,
          ...(ident.fbp && { fbp: ident.fbp }),
          ...(ident.fbc && { fbc: ident.fbc }),
        },
        custom_data: {
          value: args.value, currency: "BRL",
          content_name: `Plano ${PLAN_NAMES[args.plan] || args.plan}`,
          content_category: args.plan,
        },
      }),
    });
    // ChatGPT Ads (OpenAI) — mesma conversão, mesmo event_id.
    await sendOpenAiConversion({
      eventType: "purchase",
      eventId: args.eventId,
      value: args.value,
      currency: "BRL",
      contentName: `Plano ${PLAN_NAMES[args.plan] || args.plan}`,
      source: "webhook-woovi",
    });
  } catch (e) {
    console.warn("[webhook-woovi] CAPI Purchase falhou (non-blocking):", (e as Error)?.message);
  }
}

// Claim reentrante: eventos concluídos não repetem; falhas e processamentos
// abandonados podem ser retomados.
async function claimEvent(supabase: any, key: string, kind: string, payload: unknown): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { data: prior } = await supabase.from("woovi_webhook_events")
    .select("processing_status, attempts, updated_at").eq("event_key", key).maybeSingle();
  if (prior?.processing_status === "processed") {
    console.log(`[webhook-woovi] evento concluído ignorado: ${key}`);
    return false;
  }
  if (prior?.processing_status === "processing" && prior.updated_at > staleBefore) {
    console.log(`[webhook-woovi] evento já em processamento: ${key}`);
    return false;
  }
  if (prior) {
    const { error } = await supabase.from("woovi_webhook_events").update({
      processing_status: "processing",
      attempts: Number(prior.attempts || 0) + 1,
      processing_started_at: now.toISOString(),
      last_error: null, payload,
    }).eq("event_key", key).neq("processing_status", "processed");
    return !error;
  }
  const { error } = await supabase.from("woovi_webhook_events").insert({
    event_key: key, kind, payload, processing_status: "processing",
    attempts: 1, processing_started_at: now.toISOString(),
  });
  if (error) {
    if ((error.code || "") === "23505") return false;
    console.warn("[webhook-woovi] falha registrando evento (segue processando):", error.message);
  }
  return true;
}

async function finishEvent(supabase: any, key: string): Promise<void> {
  await supabase.from("woovi_webhook_events").update({
    processing_status: "processed", processed_at: new Date().toISOString(), last_error: null,
  }).eq("event_key", key);
}

async function failEvent(supabase: any, key: string, error: string): Promise<void> {
  await supabase.from("woovi_webhook_events").update({
    processing_status: "failed", last_error: error.slice(0, 1000),
  }).eq("event_key", key);
}

// Observabilidade por banco: a jornada composta é exibida de formas diferentes em
// cada PSP (BB mostra entrada + mandato na mesma tela; Nubank em duas telas). Saber
// de qual banco vem cada aprovação/pagamento é o que permite medir onde há queda.
function extractPayerBank(body: Record<string, any>): string | null {
  const cands = [
    body?.pixRecurring?.payer?.bank,
    body?.pixRecurring?.debtorParticipant,
    body?.subscription?.pixRecurring?.payer?.bank,
    body?.charge?.payer?.bank,
    body?.pix?.payer?.bank,
    body?.pix?.endToEndId ? String(body.pix.endToEndId).slice(1, 9) : null,
    body?.charge?.pixTransaction?.payer?.bank,
    body?.charge?.pixTransaction?.endToEndId
      ? String(body.charge.pixTransaction.endToEndId).slice(1, 9)
      : null,
  ];
  for (const c of cands) {
    if (c && typeof c === "string" && c.trim()) return c.trim().slice(0, 80);
  }
  return null;
}

/**
 * Confirma na API da Woovi que a cobrança realmente foi paga. Retorna o status
 * real ou `null` quando não deu para confirmar (aí a auditoria reconcilia).
 */
async function confirmChargePaid(correlationId: string): Promise<string | null> {
  try {
    const r = await wooviFetch<Record<string, any>>(`/api/v1/charge/${encodeURIComponent(correlationId)}`);
    if (!r.ok) return null;
    const d = r.data as Record<string, any> | null;
    return String(d?.charge?.status ?? d?.status ?? "") || "";
  } catch (e) {
    console.warn("[webhook-woovi] confirmação de cobrança falhou:", (e as Error)?.message);
    return null;
  }
}

// Reserva atômica da ativação por parcela: aprovação e cobrança podem anunciar o
// mesmo dinheiro, mas só um caminho estende acesso.
async function claimChargeActivation(supabase: any, chargeRowId: string): Promise<boolean> {
  const { data, error } = await supabase.from("woovi_charges")
    .update({ access_activated_at: new Date().toISOString() })
    .eq("id", chargeRowId).is("access_activated_at", null).select("id");
  if (error) {
    console.error("[webhook-woovi] falha reservando ativação:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}

// Libera/estende o acesso — só quando dinheiro entra de fato.
async function activateAccess(
  supabase: any,
  sub: Record<string, any>,
  opts: { isFirstPayment: boolean; valueCents: number; eventId: string; trialEntry?: boolean },
): Promise<boolean> {
  try {
    const plan = sub.plan as string;
    const billing = sub.billing_period as string;
    const email = (sub.customer_email as string) || "";
    const name = (sub.customer_name as string) || "";
    const phoneRaw = (sub.customer_phone as string) || "";
    const phone = phoneRaw ? normalizeBrazilianPhone(phoneRaw) : "";

    const now = new Date();
    const profileCols = "id, user_id, plan, status, plan_expires_at, phone, email, name";
    let profile: Record<string, any> | null = null;
    if (sub.user_id) {
      const { data: byId } = await supabase
        .from("profiles").select(profileCols).eq("id", sub.user_id).maybeSingle();
      profile = byId || null;
    }
    if (!profile) {
      const orParts = [`email.eq.${email}`];
      const digits = phoneRaw.replace(/\D/g, "");
      if (digits) orParts.push(`phone.eq.${digits}`, `phone.eq.55${digits}`);
      const { data: prof } = await supabase
        .from("profiles").select(profileCols).or(orParts.join(",")).limit(1).maybeSingle();
      profile = prof || null;
    }

    // A validade nova SEMPRE parte do `plan_expires_at` do perfil, para a
    // renovação somar ao que o cliente ainda tem.
    const currentExpiry = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
    const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
    // Promo de entrada (trial pago) = 7 dias de acesso; o débito do dia 8 é que
    // estende para o ciclo mensal cheio. Demais pagamentos compram o ciclo todo.
    const newExpiry = opts.trialEntry
      ? addDaysUTC(base, TRIAL_DAYS).toISOString()
      : addMonths(base, CYCLE_MONTHS[billing] ?? 1).toISOString();
    const today = now.toISOString().split("T")[0];
    const sessionsCount = PLAN_SESSIONS[plan] ?? 0;

    let userId: string;
    let profileRowId: string | null = profile?.id ?? null;

    if (!profile) {
      // Venda nova por PIX: o perfil nasce aqui. Sem isso o cliente paga e não recebe nada.
      userId = crypto.randomUUID();
      const { data: inserted, error: insErr } = await supabase.from("profiles").insert({
        user_id: userId,
        name: name || "Cliente",
        phone: phone || phoneRaw.replace(/\D/g, "") || null,
        email, plan, status: "active",
        sessions_used_this_month: 0,
        sessions_reset_date: today,
        messages_today: 0,
        last_message_date: today,
        needs_schedule_setup: sessionsCount > 0,
        trial_started_at: now.toISOString(),
        trial_phase: "listening",
        current_journey_id: "j1-ansiedade",
        current_episode: 0,
        plan_expires_at: newExpiry,
        whatsapp_provider: "meta",
        billing_cycle: billing,
        card_gateway: "woovi",
        payment_failed_at: null,
      }).select("id").maybeSingle();
      if (insErr) {
        console.error("[webhook-woovi] ❌ erro criando profile:", insErr);
        await supabase.from("woovi_subscriptions")
          .update({ last_error: `falha criando perfil para ${email}: ${insErr.message}` })
          .eq("subscription_id", sub.subscription_id);
        return false;
      }
      profileRowId = inserted?.id ?? null;
      console.log(`[webhook-woovi] ✅ profile novo criado: ${userId} (${email})`);
    } else {
      userId = profile.user_id as string;
      const isReturning = profile.status === "canceled";
      const updatePayload: Record<string, unknown> = {
        plan, status: "active", plan_expires_at: newExpiry,
        billing_cycle: billing, card_gateway: "woovi",
        payment_failed_at: null, updated_at: now.toISOString(),
      };
      // Oferta de retenção aceita no PIX: o mandato novo vem no valor do tier,
      // então o entitlement precisa acompanhar (senão o cliente paga Lite e
      // continua com o plano cheio liberado).
      if (billing === "monthly") {
        const mandateValue = Number(sub.value_cents || 0);
        if (mandateValue === 1990) updatePayload.plan_tier = "lite";
        else if (mandateValue === 990) updatePayload.plan_tier = "base";
        else updatePayload.plan_tier = null;
      }
      if (isReturning) {
        updatePayload.sessions_used_this_month = 0;
        updatePayload.sessions_reset_date = today;
        updatePayload.trial_phase = "listening";
        updatePayload.needs_schedule_setup = sessionsCount > 0;
      }
      const { error: updErr } = await supabase
        .from("profiles").update(updatePayload).eq("user_id", userId);
      if (updErr) {
        console.error("[webhook-woovi] erro atualizando profile:", updErr);
        return false;
      }
    }
    console.log(`[webhook-woovi] ✅ acesso de ${userId} estendido até ${newExpiry} (plano ${plan})`);

    await supabase.from("woovi_subscriptions").update({
      user_id: profileRowId || sub.user_id, status: "ATIVA", last_error: null,
      next_charge_date: opts.trialEntry
        ? brtDate(addDaysUTC(now, TRIAL_DAYS))
        : brtDate(addMonths(now, CYCLE_MONTHS[billing] ?? 1)),
    }).eq("subscription_id", sub.subscription_id);

    // Renovação silenciosa: não repete boas-vindas.
    if (!opts.isFirstPayment) return true;

    if (email) {
      try {
        await supabase.from("checkout_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .in("payment_method", ["pix", "pix_auto"]).eq("status", "created").eq("email", email);
      } catch (e) {
        console.warn("[webhook-woovi] funil PIX não fechado:", (e as Error)?.message);
      }
      await fireMetaCapiPurchase(supabase, {
        eventId: opts.eventId,
        email,
        phone: phone || undefined,
        firstName: (name || "").split(" ")[0] || undefined,
        fbp: sub.fbp || null,
        fbc: sub.fbc || null,
        value: opts.valueCents / 100,
        plan,
      });
    }

    try {
      await supabase.from("user_portal_tokens").upsert({ user_id: userId }, { onConflict: "user_id" });
    } catch (e) {
      console.warn("[webhook-woovi] token do portal não criado:", (e as Error)?.message);
    }

    const planName = PLAN_NAMES[plan] || "Essencial";
    const welcome = `Oi, ${name}! 🌟 Que bom te receber por aqui.\n\nEu sou a AURA — e vou ficar com você nessa jornada.\n\nVocê escolheu o plano ${planName}.\n\nComigo, você pode falar com liberdade: sem julgamento, no seu ritmo.\n\nSe preferir, pode me mandar áudio também! 🎙️\n\nDá uma olhada no que você vai ter acesso: https://olaaura.com.br/guia\n\nAcesse seu painel pessoal: https://olaaura.com.br/meu-espaco ✨\n\nMe diz: como você está hoje?`;

    await supabase.from("profiles")
      .update({ pending_insight: `[WELCOME]${welcome}` }).eq("user_id", userId);

    if (phone) {
      const templateText = `Olá, ${name}. Sua assinatura da Aura foi ativada com sucesso.`;
      try {
        let res = await sendProactive(phone, templateText, "welcome", userId);
        if (!res.success) {
          await new Promise((r) => setTimeout(r, 3000));
          res = await sendProactive(phone, templateText, "welcome", userId);
        }
        console.log(res.success
          ? `[webhook-woovi] ✅ welcome enviado via ${res.provider}`
          : `[webhook-woovi] ❌ welcome falhou: ${res.error}`);
      } catch (e) {
        console.error("[webhook-woovi] erro no welcome WhatsApp:", e);
      }
    }

    if (email) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: email,
            idempotencyKey: `welcome-woovi-${sub.subscription_id}`,
            templateData: { name, portalUrl: "https://olaaura.com.br/meu-espaco" },
          },
        });
      } catch (e) {
        console.warn("[webhook-woovi] welcome email falhou (non-blocking):", e);
      }
    }
    return true;
  } catch (err) {
    console.error("[webhook-woovi] ❌ activateAccess erro (non-blocking):", err);
    return false;
  }
}

/** Localiza o mandato por qualquer um dos identificadores que a Woovi manda. */
async function findSubscription(
  supabase: any, ids: (string | null | undefined)[],
): Promise<Record<string, any> | null> {
  const clean = ids.filter((v): v is string => !!v);
    for (const id of clean) {
      // `entry_charge_correlation_id` liga a cobrança avulsa de entrada (Jornada
      // composta) ao mandato — sem ela, o pagamento da entrada não acha o mandato.
      for (const col of ["subscription_id", "correlation_id", "global_id", "recurrency_id", "entry_charge_correlation_id"]) {
        const { data } = await supabase.from("woovi_subscriptions").select("*").eq(col, id).maybeSingle();
        if (data) return data;
      }
    }
    return null;
}

/**
 * Ciclo do mandato não pago: registra a cobrança e entra na RECUPERAÇÃO
 * SILENCIOSA de ~30 dias.
 *
 * Por que silenciosa: no PIX Automático o cliente cancela o mandato com um
 * clique no app do banco. Avisar "seu pagamento falhou" é convite pro
 * cancelamento definitivo, enquanto a chance real é simplesmente falta de saldo
 * num dia do mês. Então:
 *   • zero mensagem de falha e zero corte de acesso por ~28 dias;
 *   • reciclagem da parcela a cada 7 dias (4 tentativas, cada uma com a
 *     política técnica 3R/7D da Woovi por baixo) → cobre o mês inteiro;
 *   • só depois de esgotar tudo, UMA conversa com oferta (30% off → Lite).
 * Isso espelha o cartão, onde o acesso segue liberado durante os ~21 dias de
 * Smart Retries do Stripe e o corte só acontece no cancelamento.
 */
async function handleUnpaidCycle(
  supabase: any,
  sub: Record<string, any>,
  charge: {
    chargeId: string; status: string; valueCents: number; dueDate: string | null;
    payload: unknown; tryLevel?: boolean;
  },
): Promise<void> {
  // 1) Persistência da cobrança em aberto (kind=cycle) para auditoria.
  const { data: existing } = await supabase.from("woovi_charges")
    .select("id").eq("installment_id", charge.chargeId).maybeSingle();
  if (existing?.id) {
    await supabase.from("woovi_charges")
      .update({ status: charge.status, raw_payload: charge.payload }).eq("id", existing.id);
  } else {
    const { count } = await supabase.from("woovi_charges")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", sub.subscription_id);
    await supabase.from("woovi_charges").insert({
      subscription_id: sub.subscription_id,
      installment_id: charge.chargeId,
      user_id: sub.user_id,
      cycle_index: Number(count || 0),
      value_cents: charge.valueCents,
      due_date: charge.dueDate,
      status: charge.status,
      kind: "cycle",
      raw_payload: charge.payload,
    });
  }

  // Rejeição de tentativa intermediária: a Woovi ainda retenta sozinha.
  if (charge.tryLevel) {
    console.log(`[webhook-woovi] tentativa intermediária ${charge.chargeId} (${charge.status}) — sem ação`);
    return;
  }

  if (!sub.user_id) {
    console.warn(`[webhook-woovi] ciclo ${charge.chargeId} não pago sem user_id — recuperação não iniciada`);
    return;
  }

  const { data: profile } = await supabase.from("profiles")
    .select("id, user_id, phone, name").eq("id", sub.user_id).maybeSingle();
  if (!profile?.user_id) {
    console.warn(`[webhook-woovi] profile ${sub.user_id} não encontrado — recuperação não iniciada`);
    return;
  }

  // NÃO gravamos payment_failed_at nem cortamos acesso: durante a janela de
  // recuperação o cliente segue com a Aura normalmente (paridade com o cartão).
  await supabase.from("woovi_subscriptions")
    .update({ last_error: `ciclo ${charge.chargeId} não pago (${charge.status}) — recuperação silenciosa iniciada` })
    .eq("id", sub.id);

  // 2) Abre a recuperação agora (idempotente por subscription_id): uma
  // tentativa na CobR viva + CobR do ciclo seguinte na janela do Bacen.
  const { data: dup } = await supabase.from("scheduled_tasks")
    .select("id").in("task_type", ["woovi_cycle_recycle", "woovi_next_cycle_cobr", "woovi_recovery_offer"])
    .eq("status", "pending")
    .contains("payload", { subscription_id: sub.subscription_id }).limit(1);
  if (Array.isArray(dup) && dup.length > 0) {
    console.log(`[webhook-woovi] reciclagem já agendada para ${sub.subscription_id}`);
    return;
  }
  const { error } = await supabase.from("scheduled_tasks").insert({
    user_id: profile.user_id,
    task_type: "woovi_cycle_recycle",
    execute_at: new Date().toISOString(),
    status: "pending",
    payload: {
      provider: "woovi",
      subscription_id: sub.subscription_id,
      payment_id: charge.chargeId,
      attempt: 1,
      started_at: new Date().toISOString(),
    },
  });
  if (error) console.error("[webhook-woovi] erro agendando reciclagem:", error.message);
  else console.log(`[webhook-woovi] recuperação silenciosa iniciada para ${sub.subscription_id}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // A Woovi faz um GET/POST de validação ao registrar a URL.
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, any>));
    console.log("[webhook-woovi] recebido:", JSON.stringify(body).slice(0, 1500));

    const event = String(body.event || "");
    const charge = (body.charge || {}) as Record<string, any>;
    const subPayload = (body.subscription || {}) as Record<string, any>;
    const pixRecurring = (body.pixRecurring || subPayload.pixRecurring || {}) as Record<string, any>;

    const subIds = [
      subPayload.globalID, subPayload.correlationID, subPayload.subscriptionId,
      pixRecurring.recurrencyId, charge.subscriptionGlobalID, charge.subscriptionID,
    ];

    // ---- 1) Ciclo de vida do mandato ---------------------------------------
    // IMPORTANTE: `subscription.status = ACTIVE` significa apenas "assinatura
    // criada na Woovi" — NÃO é a aprovação do débito automático pelo banco. Só o
    // status do `pixRecurring` autoriza marcar APROVADA; do objeto assinatura
    // aceitamos apenas cancelamento/rejeição.
    const pixMandateStatus = String(pixRecurring.status || "").toUpperCase();
    const subObjStatus = String(subPayload.status || "").toUpperCase();
    const mandateStatus = pixMandateStatus || subObjStatus;
    const canApprove = !!pixMandateStatus;
    const isMandateEvent = Boolean(subPayload.globalID || pixRecurring.recurrencyId) && !!mandateStatus;

    if (isMandateEvent) {
      const key = `mandate:${subPayload.globalID || pixRecurring.recurrencyId}:${mandateStatus}`;
      if (await claimEvent(supabase, key, "mandate", body)) {
        try {
          const sub = await findSubscription(supabase, subIds);
          if (!sub) {
            console.warn("[webhook-woovi] mandato desconhecido:", subIds.filter(Boolean).join(","));
          } else {
            const approvedNow = canApprove && APPROVED_STATUSES.includes(mandateStatus);
            let localStatus = sub.status as string;
            if (approvedNow) localStatus = "APROVADA";
            else if (REJECTED_STATUSES.includes(mandateStatus)) localStatus = "REJEITADA";
            else if (CANCELED_STATUSES.includes(mandateStatus)) localStatus = "CANCELADA";

            await supabase.from("woovi_subscriptions").update({
              status: localStatus,
              pix_status: mandateStatus,
              recurrency_id: pixRecurring.recurrencyId || sub.recurrency_id,
              raw_payload: body,
              ...(approvedNow
                ? { mandate_approved_at: sub.mandate_approved_at || new Date().toISOString() }
                : {}),
              ...(extractPayerBank(body) ? { payer_bank: extractPayerBank(body) } : {}),
            }).eq("id", sub.id);

            // Promo de entrada: o mandato foi criado com o valor promocional para
            // que o primeiro débito fosse baratinho. Depois de aprovado, subimos a
            // assinatura para o preço cheio — assim os ciclos seguintes cobram o
            // valor normal sem precisar de nova autorização (valor variável).
            // Bump do valor: só na Jornada 3 nativa. Na composta o mandato já nasce
            // no valor cheio (R$ 29,90) — a entrada vem de uma cobrança avulsa, então
            // não há valor para subir e o app do banco mostra "R$ 29,90/mês" fixo.
            if (approvedNow && sub.is_trial
                && sub.value_cents > (sub.trial_value_cents ?? 0)
                && sub.creation_mode !== "composed") {
              const upd = await wooviFetch(
                `/api/v1/subscriptions/${encodeURIComponent(sub.subscription_id)}/value`,
                { method: "PUT", body: { value: sub.value_cents } },
              );
              if (!upd.ok) {
                console.error(`[webhook-woovi] ⚠️ falha subindo valor do mandato ${sub.subscription_id}: HTTP ${upd.status}`);
                await supabase.from("woovi_subscriptions").update({
                  last_error: `valor cheio não aplicado (HTTP ${upd.status}) — ciclos podem cobrar o promocional`,
                }).eq("id", sub.id);
              } else {
                console.log(`[webhook-woovi] ✅ mandato ${sub.subscription_id} atualizado para R$ ${(sub.value_cents / 100).toFixed(2)}`);
              }
            }

            // Mandato revogado no app do banco = churn silencioso: marca falha de
            // pagamento para o fluxo de reautorização/dunning agir.
            if (CANCELED_STATUSES.includes(mandateStatus) && sub.user_id && !sub.replaced_by_subscription_id) {
              await supabase.from("profiles")
                .update({ payment_failed_at: new Date().toISOString() })
                .eq("id", sub.user_id);
            }
          }
          await finishEvent(supabase, key);
        } catch (e) {
          await failEvent(supabase, key, (e as Error)?.message || "erro no mandato");
          throw e;
        }
      }
    }

    // ---- 2) Cobrança liquidada (dinheiro entrou) ---------------------------
    const chargeStatus = String(charge.status || "").toUpperCase();
    const chargePaid = PAID_STATUSES.includes(chargeStatus)
      || PAID_STATUSES.some((s) => event.toUpperCase().includes(s));
    const chargeId = charge.correlationID || charge.globalID || charge.identifier;

    if (chargePaid && chargeId) {
      const key = `charge:${chargeId}:paid`;
      if (await claimEvent(supabase, key, "charge", body)) {
        try {
          const sub = await findSubscription(supabase, [
            ...subIds, charge.subscriptionCorrelationID, charge.correlationID,
          ]);
          if (!sub) {
            console.warn(`[webhook-woovi] cobrança ${chargeId} sem mandato conhecido — nada a ativar`);
            await finishEvent(supabase, key);
          } else {
            // Confiança vem da API, não do corpo do webhook.
            const confirmed = await confirmChargePaid(String(charge.correlationID || chargeId));
            if (confirmed !== null && !PAID_STATUSES.includes(confirmed.toUpperCase())) {
              throw new Error(`Woovi não confirma pagamento de ${chargeId} (status ${confirmed})`);
            }

            const valueCents = Number(charge.value ?? sub.value_cents ?? 0);
            const paidAt = charge.paidAt || new Date().toISOString();
            // Entrada da jornada composta: cobrança avulsa amarrada ao mandato.
            const isEntryCharge = sub.creation_mode === "composed"
              && !!sub.entry_charge_correlation_id
              && String(chargeId) === String(sub.entry_charge_correlation_id);
            const payerBank = extractPayerBank(body);
            if (isEntryCharge) {
              await supabase.from("woovi_subscriptions").update({
                entry_paid_at: sub.entry_paid_at || paidAt,
                ...(payerBank ? { payer_bank: payerBank } : {}),
              }).eq("id", sub.id);
            }

            const { data: existing } = await supabase.from("woovi_charges")
              .select("id, cycle_index, access_activated_at")
              .eq("installment_id", String(chargeId)).maybeSingle();

            let chargeRowId = existing?.id as string | undefined;
            let cycleIndex = existing?.cycle_index ?? 0;
            if (!chargeRowId) {
              // Ciclo 0 = pagamento de entrada da jornada 3; os seguintes contam a partir de 1.
              const { count } = await supabase.from("woovi_charges")
                .select("id", { count: "exact", head: true })
                .eq("subscription_id", sub.subscription_id);
              cycleIndex = Number(count || 0);
              const { data: inserted, error: insErr } = await supabase.from("woovi_charges").insert({
                subscription_id: sub.subscription_id,
                installment_id: String(chargeId),
                cobr_id: charge.globalID || null,
                user_id: sub.user_id,
                cycle_index: cycleIndex,
                value_cents: valueCents,
                due_date: charge.expiresDate ? String(charge.expiresDate).slice(0, 10) : null,
                status: chargeStatus || "COMPLETED",
                paid_at: paidAt,
                kind: isEntryCharge ? "entry" : (cycleIndex === 0 ? "entry" : "cycle"),
                payer_bank: payerBank,
                raw_payload: body,
              }).select("id").maybeSingle();
              if (insErr) throw new Error(`falha registrando cobrança: ${insErr.message}`);
              chargeRowId = inserted?.id;
            } else {
              await supabase.from("woovi_charges").update({
                status: chargeStatus || "COMPLETED", paid_at: paidAt, raw_payload: body,
                ...(payerBank ? { payer_bank: payerBank } : {}),
              }).eq("id", chargeRowId);
            }

            if (chargeRowId && await claimChargeActivation(supabase, chargeRowId)) {
              // Funil: primeira cobrança paga = compra confirmada no trilho PIX.
              if (cycleIndex === 0) {
                try {
                  await supabase.from("checkout_funnel_events").insert({
                    anon_session_id: `woovi:${sub.subscription_id}`,
                    step: "purchase_confirmed",
                    payment_method: "pix_auto",
                    detail: "woovi",
                    meta: { charge_id: String(chargeId), value_cents: valueCents, payer_bank: payerBank ?? null },
                  });
                } catch (e) {
                  console.warn("[webhook-woovi] ⚠️ falha registrando purchase_confirmed:", e instanceof Error ? e.message : e);
                }
              }
              const ok = await activateAccess(supabase, sub, {
                isFirstPayment: cycleIndex === 0,
                valueCents,
                eventId: `woovi-${chargeId}-purchase`,
              });
              if (!ok) {
                // Libera a reserva para o reenvio da Woovi tentar de novo.
                await supabase.from("woovi_charges")
                  .update({ access_activated_at: null }).eq("id", chargeRowId);
                throw new Error("ativação de acesso falhou — devolvendo para retentativa");
              }
            }

            // Dinheiro entrou: mata qualquer cadência de recuperação pendente.
            // Sem isso o cliente que regularizou ainda podia receber a oferta
            // de 30% off dias depois.
            if (sub?.subscription_id) {
              await supabase.from("scheduled_tasks")
                .update({ status: "canceled", executed_at: new Date().toISOString() })
                .in("task_type", [
                  "woovi_cycle_recycle", "woovi_next_cycle_cobr",
                  "woovi_recovery_offer", "woovi_recovery_final",
                ])
                .eq("status", "pending")
                .contains("payload", { subscription_id: sub.subscription_id });
            }
            await finishEvent(supabase, key);
          }
        } catch (e) {
          await failEvent(supabase, key, (e as Error)?.message || "erro na cobrança");
          throw e;
        }
      }
    }

    // ---- 3) Cobrança de ciclo não paga → recuperação silenciosa -----------
    // A entrada não entra aqui: QR de checkout abandonado é assunto do
    // recover-abandoned-checkout / woovi-pix-audit, não de dunning.
    const chargeUnpaid = UNPAID_CHARGE_STATUSES.includes(chargeStatus)
      || UNPAID_CHARGE_STATUSES.some((s) => event.toUpperCase().includes(s));
    if (chargeUnpaid && chargeId && !chargePaid) {
      const key = `charge:${chargeId}:unpaid:${chargeStatus || "unknown"}`;
      if (await claimEvent(supabase, key, "charge_unpaid", body)) {
        try {
          const sub = await findSubscription(supabase, [
            ...subIds, charge.subscriptionCorrelationID, charge.correlationID,
          ]);
          const isEntryCharge = !!sub && sub.creation_mode === "composed"
            && !!sub.entry_charge_correlation_id
            && String(chargeId) === String(sub.entry_charge_correlation_id);
          if (!sub || isEntryCharge) {
            console.log(`[webhook-woovi] cobrança ${chargeId} não paga ignorada (entrada ou sem mandato)`);
          } else {
            await handleUnpaidCycle(supabase, sub, {
              chargeId: String(chargeId),
              status: chargeStatus || "UNPAID",
              valueCents: Number(charge.value ?? sub.value_cents ?? 0),
              dueDate: charge.expiresDate ? String(charge.expiresDate).slice(0, 10) : null,
              payload: body,
              tryLevel: TRY_LEVEL_MARKERS.some((m) =>
                (chargeStatus || "").includes(m) || event.toUpperCase().includes(m)),
            });
          }
          await finishEvent(supabase, key);
        } catch (e) {
          await failEvent(supabase, key, (e as Error)?.message || "erro na recuperação do ciclo");
          throw e;
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[webhook-woovi] erro:", error);
    // 500 faz a Woovi reenviar — melhor reprocessar do que perder dinheiro.
    return new Response(JSON.stringify({ error: (error as Error)?.message || "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
