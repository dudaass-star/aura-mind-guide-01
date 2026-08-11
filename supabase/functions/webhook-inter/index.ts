// Edge function: webhook do Banco Inter — trilho PIX Automático (Bacen).
//
// O Inter entrega três tipos de notificação, cada um numa rota registrada:
//   • `pix[]`   → liquidação da cobrança imediata (1ª semana / 1º ciclo). É AQUI
//                 que o dinheiro entra e o acesso é liberado.
//   • `recs[]`  → ciclo de vida do mandato (CRIADA → APROVADA | REJEITADA | CANCELADA).
//                 APROVADA = banco do cliente autorizou os débitos futuros.
//   • `cobsr[]` → cobranças dos ciclos seguintes (CRIADA → ATIVA → CONCLUIDA).
//
// Uma única função trata os três porque o Inter aceita apenas uma URL por tipo e
// o corpo identifica o tipo pela chave de topo. Tudo é idempotente por
// inter_webhook_events.event_key: o Inter reenvia até receber 200.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import { retryCharge, MAX_RETRIES } from "../_shared/inter-cycles.ts";
import { interFetch } from "../_shared/inter-pix.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial", direcao: "Direção", transformacao: "Transformação",
};
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semestral: 6, yearly: 12,
};
const CYCLE_DAYS: Record<string, number> = {
  monthly: 31, quarterly: 92, semestral: 183, yearly: 365,
};
// Sessões incluídas por plano (espelha webhook-asaas).
const PLAN_SESSIONS: Record<string, number> = {
  essencial: 1, direcao: 4, transformacao: 8,
};

/**
 * O Inter não assina o webhook e a URL registrada não carrega segredo — então a
 * confiança vem da PRÓPRIA API: antes de liberar acesso, perguntamos ao Inter o
 * status real do recurso. Payload forjado não sobrevive a essa checagem.
 * Retorna `null` quando não foi possível confirmar (a auditoria reconcilia).
 */
async function confirmWithInter(path: string): Promise<string | null> {
  try {
    const r = await interFetch<Record<string, any>>(path);
    if (!r.ok) {
      console.warn(`[webhook-inter] confirmação recusada em ${path} (HTTP ${r.status})`);
      return null;
    }
    const d = r.data as Record<string, any> | null;
    return String(d?.status ?? "") || "";
  } catch (e) {
    console.warn(`[webhook-inter] confirmação falhou em ${path}:`, (e as Error)?.message);
    return null;
  }
}

/** `aurac3<tail>` → 3. Cobranças de ciclo têm índice no próprio txid. */
function cycleIndexFromTxid(txid: string): number | null {
  const m = /^aurac(\d+)/.exec(txid || "");
  return m ? Number(m[1]) : null;
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
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

// Status de cobrança recorrente que significam "não liquidou este ciclo".
const FAILED_COBR_STATUSES = ["REJEITADA", "NAO_REALIZADA", "NAO_REALIZADO", "EXPIRADA"];

// Purchase no Meta CAPI, dedup por event_id (mesmo padrão do webhook-asaas):
// sem isso a venda por Inter fica invisível para os anúncios.
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

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${url}/functions/v1/meta-capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        event_name: "Purchase",
        event_id: args.eventId,
        event_source_url: "https://olaaura.com.br/obrigado",
        source: "webhook-inter",
        is_first_purchase: true,
        user_data: {
          email: args.email,
          phone: args.phone || undefined,
          first_name: args.firstName || undefined,
          ...(args.fbp && { fbp: args.fbp }),
          ...(args.fbc && { fbc: args.fbc }),
        },
        custom_data: {
          value: args.value,
          currency: "BRL",
          content_name: `Plano ${PLAN_NAMES[args.plan] || args.plan}`,
          content_category: args.plan,
        },
      }),
    });
  } catch (e) {
    console.warn("[webhook-inter] CAPI Purchase falhou (non-blocking):", (e as Error)?.message);
  }
}

// Claim reentrante: eventos concluídos não repetem; falhas e processamentos
// abandonados podem ser retomados. Isso evita tanto extensão dupla quanto evento
// perdido após uma indisponibilidade transitória.
async function claimEvent(supabase: any, key: string, kind: string, payload: unknown): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { data: prior } = await supabase.from("inter_webhook_events")
    .select("processing_status, attempts, updated_at")
    .eq("event_key", key).maybeSingle();
  if (prior?.processing_status === "processed") {
    console.log(`[webhook-inter] evento concluído ignorado: ${key}`);
    return false;
  }
  if (prior?.processing_status === "processing" && prior.updated_at > staleBefore) {
    console.log(`[webhook-inter] evento já em processamento: ${key}`);
    return false;
  }
  if (prior) {
    const { error } = await supabase.from("inter_webhook_events").update({
      processing_status: "processing",
      attempts: Number(prior.attempts || 0) + 1,
      processing_started_at: now.toISOString(),
      last_error: null,
      payload,
    }).eq("event_key", key).neq("processing_status", "processed");
    return !error;
  }
  const { error } = await supabase.from("inter_webhook_events").insert({
    event_key: key, kind, payload, processing_status: "processing",
    attempts: 1, processing_started_at: now.toISOString(),
  });
  if (error) {
    if ((error.code || "") === "23505") {
      return false;
    }
    console.warn("[webhook-inter] falha registrando evento (segue processando):", error.message);
  }
  return true;
}

async function finishEvent(supabase: any, key: string): Promise<void> {
  await supabase.from("inter_webhook_events").update({
    processing_status: "processed", processed_at: new Date().toISOString(), last_error: null,
  }).eq("event_key", key);
}

async function failEvent(supabase: any, key: string, error: string): Promise<void> {
  await supabase.from("inter_webhook_events").update({
    processing_status: "failed", last_error: error.slice(0, 1000),
  }).eq("event_key", key);
}

// Libera/estende o acesso. Chamado quando dinheiro entra de fato:
// cobrança imediata paga (ciclo 0) ou cobrança de ciclo CONCLUIDA.
async function activateAccess(
  supabase: any,
  rec: Record<string, any>,
  opts: { isFirstPayment: boolean; valueCents: number; eventId?: string },
): Promise<boolean> {
  try {
    const plan = rec.plan as string;
    const billing = rec.billing_period as string;
    const email = (rec.customer_email as string) || "";
    const name = (rec.customer_name as string) || "";
    const phoneRaw = (rec.customer_phone as string) || "";
    const phone = phoneRaw ? normalizeBrazilianPhone(phoneRaw) : "";

    // Perfil: procura pelo vínculo do mandato, senão por email/telefone.
    // A validade nova SEMPRE parte do `plan_expires_at` do PERFIL (o mandato não
    // guarda validade) — assim a renovação soma ao que o cliente ainda tem.
    const now = new Date();
    let profile: Record<string, any> | null = null;
    const profileCols =
      "id, user_id, plan, status, plan_expires_at, phone, email, name";
    if (rec.user_id) {
      const { data: byId } = await supabase
        .from("profiles").select(profileCols).eq("id", rec.user_id).maybeSingle();
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

    const currentExpiry = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
    const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const expiry = (opts.isFirstPayment && rec.is_trial)
      ? addDays(base, 7)
      : addMonths(base, CYCLE_MONTHS[billing] ?? 1);
    const newExpiry = expiry.toISOString();
    const today = now.toISOString().split("T")[0];
    const sessionsCount = PLAN_SESSIONS[plan] ?? 0;

    let userId: string;
    let profileRowId: string | null = profile?.id ?? null;

    if (!profile) {
      // Venda nova por PIX: o perfil nasce aqui (paridade com webhook-asaas).
      // Sem este bloco o cliente paga e não recebe nada.
      userId = crypto.randomUUID();
      const { data: inserted, error: insErr } = await supabase.from("profiles").insert({
        user_id: userId,
        name: name || "Cliente",
        phone: phone || phoneRaw.replace(/\D/g, "") || null,
        email,
        plan,
        status: "active",
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
        card_gateway: "inter",
        payment_failed_at: null,
      }).select("id").maybeSingle();
      if (insErr) {
        console.error("[webhook-inter] ❌ erro criando profile:", insErr);
        await supabase.from("inter_pix_recurrences")
          .update({ last_error: `falha criando perfil para ${email}: ${insErr.message}` })
          .eq("id_rec", rec.id_rec);
        return false;
      }
      profileRowId = inserted?.id ?? null;
      console.log(`[webhook-inter] ✅ profile novo criado: ${userId} (${email})`);
    } else {
      userId = profile.user_id as string;
      const isReturning = profile.status === "canceled";
      const updatePayload: Record<string, unknown> = {
        plan,
        status: "active",
        plan_expires_at: newExpiry,
        billing_cycle: billing,
        card_gateway: "inter",
        payment_failed_at: null,
        updated_at: now.toISOString(),
      };
      if (isReturning) {
        updatePayload.sessions_used_this_month = 0;
        updatePayload.sessions_reset_date = today;
        updatePayload.trial_phase = "listening";
        updatePayload.needs_schedule_setup = sessionsCount > 0;
      }
      const { error: updErr } = await supabase
        .from("profiles").update(updatePayload).eq("user_id", userId);
      if (updErr) {
        console.error("[webhook-inter] erro atualizando profile:", updErr);
        return false;
      }
    }
    console.log(`[webhook-inter] ✅ acesso de ${userId} estendido até ${newExpiry} (plano ${plan})`);

    await supabase.from("inter_pix_recurrences")
      .update({ user_id: profileRowId || rec.user_id, status: "ATIVA", last_error: null })
      .eq("id_rec", rec.id_rec);

    // Renovação silenciosa: não repete boas-vindas.
    if (!opts.isFirstPayment) return true;

    // Funil: fecha a linha de checkout_sessions do PIX, igual ao trilho Asaas.
    if (email) {
      try {
        await supabase.from("checkout_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .in("payment_method", ["pix", "pix_auto"])
          .eq("status", "created")
          .eq("email", email);
      } catch (e) {
        console.warn("[webhook-inter] funil PIX não fechado:", (e as Error)?.message);
      }
    }

    // Aquisição: só a 1ª liquidação do mandato conta como Purchase.
    if (email) {
      await fireMetaCapiPurchase(supabase, {
        eventId: opts.eventId || `inter-${rec.id_rec}-purchase`,
        email,
        phone: phone || undefined,
        firstName: (name || "").split(" ")[0] || undefined,
        fbp: rec.fbp || null,
        fbc: rec.fbc || null,
        value: opts.valueCents / 100,
        plan,
      });
    }

    await supabase.from("user_portal_tokens")
      .upsert({ user_id: userId }, { onConflict: "user_id" })
      .catch(() => {});

    const planName = PLAN_NAMES[plan] || "Essencial";
    const welcome = `Oi, ${name}! 🌟 Que bom te receber por aqui.\n\nEu sou a AURA — e vou ficar com você nessa jornada.\n\nVocê escolheu o plano ${planName}.\n\nComigo, você pode falar com liberdade: sem julgamento, no seu ritmo.\n\nSe preferir, pode me mandar áudio também! 🎙️\n\nDá uma olhada no que você vai ter acesso: https://olaaura.com.br/guia\n\nAcesse seu painel pessoal: https://olaaura.com.br/meu-espaco ✨\n\nMe diz: como você está hoje?`;

    await supabase.from("profiles")
      .update({ pending_insight: `[WELCOME]${welcome}` })
      .eq("user_id", userId);

    if (phone) {
      const templateText = `Olá, ${name}. Sua assinatura da Aura foi ativada com sucesso.`;
      try {
        let res = await sendProactive(phone, templateText, "welcome", userId);
        if (!res.success) {
          await new Promise((r) => setTimeout(r, 3000));
          res = await sendProactive(phone, templateText, "welcome", userId);
        }
        console.log(res.success
          ? `[webhook-inter] ✅ welcome enviado via ${res.provider}`
          : `[webhook-inter] ❌ welcome falhou: ${res.error}`);
      } catch (e) {
        console.error("[webhook-inter] erro no welcome WhatsApp:", e);
      }
    }

    if (email) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: email,
            idempotencyKey: `welcome-inter-${rec.id_rec}`,
            templateData: { name, portalUrl: "https://olaaura.com.br/meu-espaco" },
          },
        });
      } catch (e) {
        console.warn("[webhook-inter] welcome email falhou (non-blocking):", e);
      }
    }
    return true;
  } catch (err) {
    console.error("[webhook-inter] ❌ activateAccess erro (non-blocking):", err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Alguns bancos fazem GET de validação na URL antes de registrar.
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
    const body = await req.json().catch(() => ({}));
    console.log("[webhook-inter] recebido:", JSON.stringify(body).slice(0, 1200));

    // ---- 1) Liquidação da cobrança imediata (QR composto pago) -------------
    const pixList: Record<string, any>[] = body.pix || (body.endToEndId ? [body] : []);
    for (const pix of pixList) {
      const txid = pix.txid as string;
      if (!txid) continue;
      const e2e = (pix.endToEndId as string) || txid;
      const eventKey = `pix:${e2e}`;
      if (!(await claimEvent(supabase, eventKey, "pix", pix))) continue;

      const { data: charge } = await supabase
        .from("inter_pix_charges").select("*").eq("txid", txid).maybeSingle();
      if (!charge) {
        console.warn(`[webhook-inter] pix de txid desconhecido: ${txid}`);
        await failEvent(supabase, eventKey, `txid desconhecido: ${txid}`);
        continue;
      }
      if (charge.access_activated_at) {
        await finishEvent(supabase, eventKey);
        continue;
      }
      // Confirma na API do Inter que a cobrança realmente foi liquidada.
      // ATENÇÃO: ciclo 0 é `cob` (cobrança imediata do QR composto); os ciclos
      // seguintes são `cobr` (recorrentes). Consultar sempre `/cob` fazia o
      // débito automático liquidado responder 404 → acesso NUNCA era estendido.
      const cycleIdx = Number(charge.cycle_index ?? cycleIndexFromTxid(txid) ?? 0);
      const confirmPath = cycleIdx === 0 ? `/pix/v2/cob/${txid}` : `/pix/v2/cobr/${txid}`;
      const cobStatus = await confirmWithInter(confirmPath);
      if (cobStatus === null || !["CONCLUIDA", "REMOVIDA_PELO_PSP"].includes(cobStatus)) {
        console.warn(
          `[webhook-inter] ⚠️ liquidação de ${txid} não confirmada pelo Inter (status ${cobStatus}) — acesso não liberado`,
        );
        // Falha de confirmação costuma ser transitória: solta a dedupe para que
        // a reentrega do Inter (ou o replay da auditoria) volte a ser processada.
        await failEvent(supabase, eventKey, `liquidação não confirmada; status=${cobStatus}`);
        continue;
      }

      const { data: rec } = await supabase
        .from("inter_pix_recurrences").select("*").eq("id_rec", charge.id_rec).maybeSingle();
      if (rec) {
        const activated = await activateAccess(supabase, rec, {
          isFirstPayment: cycleIdx === 0,
          valueCents: charge.value_cents,
          eventId: `inter-${txid}-purchase`,
        });
        if (!activated) {
          await failEvent(supabase, eventKey, "pagamento confirmado, mas ativação do acesso falhou");
          continue;
        }
        await supabase.from("inter_pix_charges").update({
          status: "CONCLUIDA",
          paid_at: (pix.horario as string) || new Date().toISOString(),
          access_activated_at: new Date().toISOString(),
          e2e_id: pix.endToEndId || null,
          raw_payload: pix,
          updated_at: new Date().toISOString(),
        }).eq("txid", txid);
        await finishEvent(supabase, eventKey);
      } else {
        await failEvent(supabase, eventKey, `mandato local não encontrado: ${charge.id_rec}`);
      }
    }

    // ---- 2) Ciclo de vida do mandato ---------------------------------------
    const recs: Record<string, any>[] = body.recs || [];
    for (const r of recs) {
      const idRec = r.idRec as string;
      if (!idRec) continue;
      const status = (r.status as string) || "";
      const eventKey = `rec:${idRec}:${status}`;
      if (!(await claimEvent(supabase, eventKey, "rec", r))) continue;

      await supabase.from("inter_pix_recurrences").update({
        status,
        raw_payload: r,
        updated_at: new Date().toISOString(),
        ...(status === "REJEITADA" || status === "CANCELADA"
          ? { last_error: `mandato ${status.toLowerCase()} pelo pagador/banco` }
          : {}),
      }).eq("id_rec", idRec);
      console.log(`[webhook-inter] mandato ${idRec} → ${status}`);

      // Mandato revogado: marca falha de pagamento para o dunning assumir com
      // o link de reautorização (mesma escada de avisos do cartão).
      if (status === "REJEITADA" || status === "CANCELADA") {
        const { data: rec } = await supabase
          .from("inter_pix_recurrences").select("user_id").eq("id_rec", idRec).maybeSingle();
        if (rec?.user_id) {
          const { data: prof } = await supabase
            .from("profiles").select("user_id").eq("id", rec.user_id).maybeSingle();
          if (prof?.user_id) {
            await supabase.from("profiles")
              .update({ payment_failed_at: new Date().toISOString() })
              .eq("user_id", prof.user_id);
          }
        }
      }
      await finishEvent(supabase, eventKey);
    }

    // ---- 3) Cobranças dos ciclos seguintes ---------------------------------
    // O nome da chave varia entre implementações (`cobsr`/`cobrs`/`cobr`) — o
    // Bacen só documenta o exemplo de `rec`, então aceitamos as três.
    const cobrs: Record<string, any>[] = body.cobsr || body.cobrs || body.cobr || [];
    for (const c of cobrs) {
      const txid = c.txid as string;
      const idRec = c.idRec as string;
      const status = (c.status as string) || "";
      if (!txid) continue;
      const occurrence = String(c?.calendario?.dataDeVencimento || c?.horario || c?.updatedAt || "");
      const eventKey = `cobr:${txid}:${status}:${occurrence}`;
      if (!(await claimEvent(supabase, eventKey, "cobr", c))) continue;

      const paid = status === "CONCLUIDA";
      const valueCents = Math.round(Number(c?.valor?.original || 0) * 100);
      const idxFromTxid = cycleIndexFromTxid(txid);
      await supabase.from("inter_pix_charges").upsert({
        txid,
        id_rec: idRec,
        ...(idxFromTxid !== null ? { cycle_index: idxFromTxid } : {}),
        due_date: c?.calendario?.dataDeVencimento || new Date().toISOString().slice(0, 10),
        value_cents: valueCents,
        status,
        paid_at: paid ? new Date().toISOString() : null,
        raw_payload: c,
        updated_at: new Date().toISOString(),
      }, { onConflict: "txid" });
      console.log(`[webhook-inter] cobrança ${txid} (${idRec}) → ${status}`);

      if (!idRec) continue;
      const { data: rec } = await supabase
        .from("inter_pix_recurrences").select("*").eq("id_rec", idRec).maybeSingle();
      if (!rec) {
        await failEvent(supabase, eventKey, `mandato local não encontrado: ${idRec}`);
        continue;
      }
      if (rec.user_id) {
        await supabase.from("inter_pix_charges")
          .update({ user_id: rec.user_id }).eq("txid", txid).is("user_id", null);
      }

      if (paid) {
        // Mesma regra do ciclo 0: só libera acesso com confirmação na API.
        const confirmed = await confirmWithInter(`/pix/v2/cobr/${txid}`);
        if (confirmed === null || confirmed !== "CONCLUIDA") {
          console.warn(
            `[webhook-inter] ⚠️ ciclo ${txid} não confirmado pelo Inter (status ${confirmed}) — acesso não estendido`,
          );
          await failEvent(supabase, eventKey, `ciclo não confirmado; status=${confirmed}`);
          continue;
        }
        const { data: currentCharge } = await supabase.from("inter_pix_charges")
          .select("access_activated_at").eq("txid", txid).maybeSingle();
        if (!currentCharge?.access_activated_at) {
          const activated = await activateAccess(supabase, rec, { isFirstPayment: false, valueCents });
          if (!activated) {
            await failEvent(supabase, eventKey, "ciclo pago, mas ativação do acesso falhou");
            continue;
          }
          await supabase.from("inter_pix_charges").update({
            paid_at: new Date().toISOString(), access_activated_at: new Date().toISOString(),
          }).eq("txid", txid);
        }
        await finishEvent(supabase, eventKey);
        continue;
      }

      // Débito rejeitado: o Inter NÃO retenta sozinho — a política 3R/7D só
      // autoriza; quem dispara cada retentativa é este backend.
      if (FAILED_COBR_STATUSES.includes(status)) {
        const { data: chargeRow } = await supabase
          .from("inter_pix_charges")
          .select("txid, due_date, retry_count")
          .eq("txid", txid).maybeSingle();
        if (chargeRow) {
          const attempt = await retryCharge(supabase, chargeRow);
          if (attempt.retried) {
            console.log(
              `[webhook-inter] 🔁 ${txid} reagendado para ${attempt.date} (tentativa dentro do 3R/7D)`,
            );
            await finishEvent(supabase, eventKey);
            continue; // ainda há tentativa em pé: não aciona dunning.
          }
          console.log(
            `[webhook-inter] ⚠️ ${txid} sem retentativa possível (${attempt.reason}, teto ${MAX_RETRIES})`,
          );
        }
      }

      if (status === "CANCELADA" || FAILED_COBR_STATUSES.includes(status)) {
        // Sem retentativa em pé → dunning (2 avisos + escada de ofertas) assume.
        const { data: prof } = rec.user_id
          ? await supabase.from("profiles").select("user_id").eq("id", rec.user_id).maybeSingle()
          : { data: null };
        if (prof?.user_id) {
          await supabase.from("profiles")
            .update({ payment_failed_at: new Date().toISOString() })
            .eq("user_id", prof.user_id);
          console.log(`[webhook-inter] ⚠️ débito falhou — dunning acionado para ${prof.user_id}`);
        }
      }
      await finishEvent(supabase, eventKey);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook-inter] erro:", err);
    // 200 evita reentrega infinita de payload malformado; o log guarda a evidência.
    return new Response(JSON.stringify({ received: true, error: String(err) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
