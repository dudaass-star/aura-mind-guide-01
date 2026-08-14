// Webhook do Asaas: recebe eventos PAYMENT_* e atualiza status no banco
// Autenticação: header "asaas-access-token" deve bater com ASAAS_WEBHOOK_TOKEN
// Paridade com stripe-webhook: cria profile, gera portal token, dispara welcome
// (template WhatsApp via sendProactive + email + pending_insight). Sem allocateInstance:
// Meta oficial via Twilio não usa instância (zapi está PROIBIDO).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveProfile } from "../_shared/profile-resolver.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { reconcileOrphanPayments } from "../_shared/asaas-reconcile.ts";
import { resolveMetaIdentity } from "../_shared/meta-identity.ts";
import { sendOpenAiConversion } from "../_shared/openai-capi.ts";
import { sendGa4Purchase } from "../_shared/ga4-purchase.ts";
import { fireSubscribeConversion } from "../_shared/meta-subscribe.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mapeamento de nomes de plano (idêntico ao stripe-webhook).
const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

// Sessões/mês por plano. Essencial = 0 (a 1ª é o convite D0).
const PLAN_SESSIONS: Record<string, number> = {
  essencial: 0,
  direcao: 4,
  transformacao: 8,
};

const CYCLE_DAYS: Record<string, number> = {
  monthly: 31,
  quarterly: 93,
  semestral: 186,
  semiannual: 186,
  yearly: 372,
};

// Dias liberados quando o pagamento é a 1ª semana promocional do PIX Automático.
const TRIAL_DAYS = 7;

// Um pagamento é "da 1ª semana" quando a autorização foi criada com trial e o
// valor pago bate com o valor do trial (tolerância R$ 0,50 por arredondamento).
function isTrialPayment(authRow: any, paidValue: number): boolean {
  const trialCents = Number(authRow?.trial_value_cents || 0);
  if (!authRow?.is_trial || !trialCents) return false;
  return Math.abs(paidValue - trialCents / 100) <= 0.5;
}

// Normaliza o billing period pra chave que o portal/plan-pricing usa ("semiannual").
// Legacy: rows antigas de asaas_payments podem trazer "semestral".
function normalizeBillingCycle(bp: string): string {
  return bp === "semestral" ? "semiannual" : bp;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Valida token de autenticação enviado pelo Asaas
    const receivedToken = req.headers.get("asaas-access-token");
    if (!WEBHOOK_TOKEN || receivedToken !== WEBHOOK_TOKEN) {
      console.warn("[webhook-asaas] Token inválido ou ausente");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const event = body?.event as string | undefined;
    const payment = body?.payment as Record<string, unknown> | undefined;
    const authorizationEvt = body?.authorization as Record<string, unknown> | undefined;
    const paymentInstruction = body?.paymentInstruction as Record<string, unknown> | undefined;

    if (!event) {
      console.warn("[webhook-asaas] Payload inválido:", body);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[webhook-asaas] Evento ${event} recebido`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ============================================================
    // PIX AUTOMÁTICO BACEN — eventos da autorização.
    // PAYMENT_RECEIVED real chega via evento PAYMENT_* mais abaixo.
    // ============================================================
    if (event.startsWith("PIX_AUTOMATIC_RECURRING_AUTHORIZATION_") && authorizationEvt?.id) {
      const authStatusMap: Record<string, { status: string; field?: string }> = {
        PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED:   { status: "PENDING" },
        PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED: { status: "ACTIVE", field: "activated_at" },
        PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED: { status: "CANCELLED", field: "cancelled_at" },
        PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REJECTED:  { status: "REJECTED", field: "cancelled_at" },
        PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED:   { status: "EXPIRED",  field: "cancelled_at" },
        // REFUSED = consentimento não concluído (na prática, QR expirado antes do
        // cliente autorizar no app do banco). Não é cobrança recusada: nenhuma
        // cobrança chega a existir. Tratado explícito pra virar sinal, não ruído.
        PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED:   { status: "REFUSED",  field: "cancelled_at" },
      };
      const mapped = authStatusMap[event] || { status: (authorizationEvt.status as string) || "UNKNOWN" };
      const updatePayload: Record<string, unknown> = {
        status: mapped.status,
        raw_payload: authorizationEvt,
      };
      if (mapped.field) updatePayload[mapped.field] = new Date().toISOString();
      if (event === "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED") {
        updatePayload.cancellation_reason = (authorizationEvt as any).cancellationReason || "asaas_event";
      }
      if (mapped.status === "REFUSED") {
        updatePayload.cancellation_reason =
          (authorizationEvt as any).cancellationReason || "consentimento_nao_concluido";
      }

      // Asaas devolve `subscriptionId` na ativação do PIX Automático Bacen.
      // Persistimos pra que PAYMENT_* consigam linkar via payment.subscription.
      const evtSubscriptionId = (authorizationEvt as any)?.subscriptionId as string | undefined;
      if (evtSubscriptionId) {
        updatePayload.asaas_subscription_id = evtSubscriptionId;
      }

      const { error: authUpdErr } = await supabase
        .from("asaas_pix_authorizations")
        .update(updatePayload)
        .eq("asaas_authorization_id", authorizationEvt.id);
      if (authUpdErr) {
        console.error("[webhook-asaas] Erro atualizando authorization:", authUpdErr);
      } else {
        console.log(`[webhook-asaas] Authorization ${authorizationEvt.id} → ${mapped.status}`);
      }

      // Cancelamento/recusa da autorização.
      // CANCELLED = o pagador derrubou o consentimento no app do banco. Se o ciclo
      // atual está pago, ele NÃO perde acesso agora: mantemos `active` até
      // plan_expires_at e só registramos a perda do consentimento, pra a auditoria
      // disparar a reautorização na virada. Sem isso, cancelar consentimento virava
      // churn silencioso com acesso cortado em cima de ciclo pago.
      if (mapped.status === "CANCELLED" || mapped.status === "REJECTED" || mapped.status === "EXPIRED") {
        const { data: authRow } = await supabase
          .from("asaas_pix_authorizations")
          .select("customer_email, customer_name, plan, billing_period, replaced_by_authorization_id")
          .eq("asaas_authorization_id", authorizationEvt.id)
          .maybeSingle();
        if (authRow?.customer_email) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, status, plan_expires_at")
            .eq("email", authRow.customer_email)
            .maybeSingle();
          const expiresAt = prof?.plan_expires_at ? new Date(prof.plan_expires_at) : null;
          const cicloPagoVigente =
            mapped.status === "CANCELLED" && !!expiresAt && expiresAt.getTime() > Date.now();

          if (prof?.id) {
            await supabase
              .from("profiles")
              .update(
                cicloPagoVigente
                  ? { pix_consent_lost_at: new Date().toISOString() }
                  : { status: "canceled", pix_consent_lost_at: new Date().toISOString() },
              )
              .eq("id", prof.id);
          }

          // Alerta admin: só quando o consentimento cai por ação do pagador e a
          // autorização não foi substituída por uma reautorização nossa.
          if (mapped.status === "CANCELLED" && !authRow.replaced_by_authorization_id) {
            const alertEmail = Deno.env.get("ADMIN_ALERT_EMAIL");
            if (alertEmail) {
              supabase.functions
                .invoke("send-transactional-email", {
                  body: {
                    templateName: "admin-pix-auto-alert",
                    recipientEmail: alertEmail,
                    idempotencyKey: `pix-consent-lost-${authorizationEvt.id}`,
                    templateData: {
                      date: new Date().toISOString().slice(0, 10),
                      lostAuthorizations: 1,
                      recoveryEmailsSent: 0,
                      lines: [
                        `Consentimento PIX cancelado no app do banco · ${authRow.customer_name || "?"} · ${authRow.customer_email} · plano ${authRow.plan || "?"} (${authRow.billing_period || "?"}) · motivo: ${(authorizationEvt as any).cancellationReason || "não informado"} · acesso até ${prof?.plan_expires_at ? String(prof.plan_expires_at).slice(0, 10) : "desconhecido"}`,
                      ],
                    },
                  },
                })
                .catch((e) =>
                  console.warn("[webhook-asaas] alerta de consentimento perdido falhou:", e?.message || e),
                );
            }
            console.error(
              `[webhook-asaas] ⚠️ Consentimento PIX perdido — ${authRow.customer_email} (auth ${authorizationEvt.id}), acesso mantido até ${prof?.plan_expires_at || "?"}`,
            );
          }
        }
      }

      // Reautorização concluída: limpa a marca de consentimento perdido.
      if (mapped.status === "ACTIVE") {
        const { data: authRow } = await supabase
          .from("asaas_pix_authorizations")
          .select("customer_email")
          .eq("asaas_authorization_id", authorizationEvt.id)
          .maybeSingle();
        if (authRow?.customer_email) {
          await supabase
            .from("profiles")
            .update({ pix_consent_lost_at: null })
            .eq("email", authRow.customer_email)
            .not("pix_consent_lost_at", "is", null);
        }
      }

      // REFUSED nunca ativou nada: não mexe em profile. Só grita no log pra
      // aparecer na auditoria diária e alimentar a recuperação.
      if (mapped.status === "REFUSED") {
        console.error(
          `[webhook-asaas] PIX Automático NÃO autorizado — auth ${authorizationEvt.id} (consentimento não concluído no app do banco)`,
        );
      }

      // Ativação da autorização → fecha a corrida de ordem de eventos do QR
      // integrado (Jornada 3): o pagamento imediato chega ANTES da ativação e
      // sem `subscription`. Aqui buscamos na Asaas os pagamentos pagos recentes
      // desse customer e reenviamos ao webhook os que faltam na base.
      if (mapped.status === "ACTIVE") {
        try {
          const { data: authRow } = await supabase
            .from("asaas_pix_authorizations")
            .select("asaas_customer_id")
            .eq("asaas_authorization_id", authorizationEvt.id)
            .maybeSingle();
          if (authRow?.asaas_customer_id) {
            const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);
            const res = await reconcileOrphanPayments(supabase, {
              customer: authRow.asaas_customer_id,
              "paymentDate[ge]": since,
            });
            if (res.recovered.length) {
              console.log(
                `[webhook-asaas] ✅ Reconciliados na ativação: ${res.recovered.join(", ")}`,
              );
            }
          }
        } catch (e) {
          console.warn(
            "[webhook-asaas] Reconciliação na ativação falhou:",
            (e as Error).message,
          );
        }
      }

      return new Response(JSON.stringify({ ok: true, event, status: mapped.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_* → só logamos (PAYMENT_* trata o resto).
    if (event.startsWith("PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_")) {
      console.log(`[webhook-asaas] Instruction ${event}`, paymentInstruction?.id);
      return new Response(JSON.stringify({ ok: true, event }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payment?.id) {
      console.warn("[webhook-asaas] Evento sem payment.id:", event);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mapeia evento → status interno
    const statusMap: Record<string, string> = {
      PAYMENT_CREATED: "PENDING",
      PAYMENT_CONFIRMED: "CONFIRMED",
      PAYMENT_RECEIVED: "RECEIVED",
      PAYMENT_OVERDUE: "OVERDUE",
      PAYMENT_REFUNDED: "REFUNDED",
      PAYMENT_DELETED: "DELETED",
      PAYMENT_AWAITING_RISK_ANALYSIS: "AWAITING_RISK_ANALYSIS",
      PAYMENT_APPROVED_BY_RISK_ANALYSIS: "CONFIRMED",
      PAYMENT_REPROVED_BY_RISK_ANALYSIS: "REFUSED",
    };

    const newStatus = statusMap[event] || (payment.status as string) || "UNKNOWN";
    const isPaid =
      event === "PAYMENT_CONFIRMED" ||
      event === "PAYMENT_RECEIVED" ||
      event === "PAYMENT_APPROVED_BY_RISK_ANALYSIS";

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      raw_payload: payment,
    };
    if (isPaid) {
      updatePayload.paid_at = new Date().toISOString();
    }

    // Fecha a linha de funil PIX (checkout_sessions) quando o pagamento entra —
    // assim o funil de PIX fica comparável ao do cartão no admin.
    if (isPaid) {
      try {
        const { data: payerRow } = await supabase
          .from("asaas_payments")
          .select("customer_email")
          .eq("asaas_payment_id", payment.id)
          .maybeSingle();
        const { data: authRow } = payerRow?.customer_email
          ? { data: null as { customer_email?: string } | null }
          : await supabase
              .from("asaas_pix_authorizations")
              .select("customer_email")
              .eq("asaas_customer_id", (payment as any)?.customer || "")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
        const payerEmail = (
          payerRow?.customer_email ||
          authRow?.customer_email ||
          (payment as any)?.customerEmail ||
          ""
        )
          .toString()
          .trim()
          .toLowerCase();
        if (payerEmail) {
          await supabase
            .from("checkout_sessions")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .in("payment_method", ["pix", "pix_auto"])
            .eq("status", "created")
            .eq("email", payerEmail);
        }
      } catch (e) {
        console.warn("[webhook-asaas] funil PIX não fechado:", (e as Error)?.message);
      }
    }

    let { data: updated, error: updateErr } = await supabase
      .from("asaas_payments")
      .update(updatePayload)
      .eq("asaas_payment_id", payment.id)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error("[webhook-asaas] Erro atualizando pagamento:", updateErr);
    }

    // Se o payment veio de uma /subscriptions (renovação PIX recorrente) e ainda não
    // existe na nossa tabela, criamos um registro novo herdando dados da assinatura.
    const subscriptionId = (payment as any)?.subscription as string | undefined;
    if (!updated && subscriptionId) {
      const { data: parent } = await supabase
        .from("asaas_payments")
        .select("*")
        .eq("asaas_subscription_id", subscriptionId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (parent) {
        const { data: inserted, error: insErr } = await supabase
          .from("asaas_payments")
          .insert({
            asaas_payment_id: payment.id,
            asaas_customer_id: parent.asaas_customer_id,
            asaas_subscription_id: subscriptionId,
            user_id: parent.user_id,
            customer_name: parent.customer_name,
            customer_email: parent.customer_email,
            customer_phone: parent.customer_phone,
            customer_cpf: parent.customer_cpf,
            plan: parent.plan,
            billing_period: parent.billing_period,
            amount_cents: Math.round(Number((payment as any).value || 0) * 100) || parent.amount_cents,
            status: newStatus,
            payment_method: "PIX",
            pix_qr_code: (payment as any).encodedImage || null,
            pix_copy_paste: (payment as any).payload || null,
            invoice_url: (payment as any).invoiceUrl || null,
            paid_at: isPaid ? new Date().toISOString() : null,
            raw_payload: payment,
          })
          .select()
          .maybeSingle();
        if (insErr) {
          console.error("[webhook-asaas] Erro criando renovação:", insErr);
        } else {
          updated = inserted;
          console.log(`[webhook-asaas] Renovação ${payment.id} registrada (sub ${subscriptionId})`);
        }
      } else {
        console.warn(`[webhook-asaas] Subscription ${subscriptionId} sem parent payment`);
      }
    }

    // PIX Automático Bacen: paymentos criados pelo modo SUBSCRIPTION trazem
    // pixAutomaticAuthorizationId em vez de subscription. Linkamos via asaas_pix_authorizations.
    const pixAutoAuthId =
      ((payment as any)?.pixAutomaticAuthorizationId as string) ||
      ((payment as any)?.authorization?.id as string) ||
      undefined;
    if (!updated && pixAutoAuthId) {
      const { data: authRow } = await supabase
        .from("asaas_pix_authorizations")
        .select("*")
        .eq("asaas_authorization_id", pixAutoAuthId)
        .maybeSingle();
      if (authRow) {
        const { data: inserted, error: insErr } = await supabase
          .from("asaas_payments")
          .insert({
            asaas_payment_id: payment.id,
            asaas_customer_id: authRow.asaas_customer_id,
            // Cascata: sub da autorização → sub do payload → id da autorização
            // (a coluna é reusada pra agrupar ciclos quando não há subscription).
            asaas_subscription_id:
              authRow.asaas_subscription_id || subscriptionId || pixAutoAuthId,
            user_id: authRow.user_id,
            customer_name: authRow.customer_name,
            customer_email: authRow.customer_email,
            customer_phone: authRow.customer_phone,
            customer_cpf: authRow.customer_cpf,
            plan: authRow.plan,
            billing_period: authRow.billing_period,
            amount_cents:
              Math.round(Number((payment as any).value || 0) * 100) || authRow.value_cents,
            status: newStatus,
            payment_method: "PIX_AUTOMATIC",
            is_trial: isTrialPayment(authRow, Number((payment as any).value || 0)),
            invoice_url: (payment as any).invoiceUrl || null,
            paid_at: isPaid ? new Date().toISOString() : null,
            fbp: authRow.fbp || null,
            fbc: authRow.fbc || null,
            ga_client_id: authRow.ga_client_id || null,
            raw_payload: payment,
          })
          .select()
          .maybeSingle();
        if (insErr) {
          console.error("[webhook-asaas] Erro criando payment PIX Automático:", insErr);
        } else {
          updated = inserted;
          console.log(`[webhook-asaas] Payment ${payment.id} vinculado à auth ${pixAutoAuthId}`);
        }
      } else {
        console.warn(`[webhook-asaas] Authorization ${pixAutoAuthId} não encontrada`);
      }
    }

    // Fallback PIX Automático Bacen — 1º payment do ciclo costuma chegar com
    // `subscription: sub_xxx` SEM pixAutomaticAuthorizationId. Procuramos a auth
    // já gravada pelo subscriptionId persistido no AUTHORIZATION_ACTIVATED.
    if (!updated && subscriptionId) {
      const { data: authBySub } = await supabase
        .from("asaas_pix_authorizations")
        .select("*")
        .eq("asaas_subscription_id", subscriptionId)
        .maybeSingle();
      if (authBySub) {
        const { data: inserted, error: insErr } = await supabase
          .from("asaas_payments")
          .insert({
            asaas_payment_id: payment.id,
            asaas_customer_id: authBySub.asaas_customer_id,
            asaas_subscription_id: subscriptionId,
            user_id: authBySub.user_id,
            customer_name: authBySub.customer_name,
            customer_email: authBySub.customer_email,
            customer_phone: authBySub.customer_phone,
            customer_cpf: authBySub.customer_cpf,
            plan: authBySub.plan,
            billing_period: authBySub.billing_period,
            amount_cents:
              Math.round(Number((payment as any).value || 0) * 100) || authBySub.value_cents,
            status: newStatus,
            payment_method: "PIX_AUTOMATIC",
            is_trial: isTrialPayment(authBySub, Number((payment as any).value || 0)),
            invoice_url: (payment as any).invoiceUrl || null,
            paid_at: isPaid ? new Date().toISOString() : null,
            fbp: authBySub.fbp || null,
            fbc: authBySub.fbc || null,
            ga_client_id: authBySub.ga_client_id || null,
            raw_payload: payment,
          })
          .select()
          .maybeSingle();
        if (insErr) {
          console.error("[webhook-asaas] Erro criando payment via subscriptionId:", insErr);
        } else {
          updated = inserted;
          console.log(
            `[webhook-asaas] Payment ${payment.id} vinculado à auth ${authBySub.asaas_authorization_id} (via subscription ${subscriptionId})`,
          );
        }
      }
    }

    // ============================================================
    // Fallback PIX Automático Bacen — cobrança avulsa por customer.
    // O Asaas provisiona a 1ª fatura do ciclo Bacen com QR próprio.
    // Se o cliente paga via outra chave/QR do mesmo recebedor, o Asaas
    // gera cobrança avulsa (subscription=null, pixAutomaticAuthorizationId=null,
    // apenas customer preenchido). Esse pagamento É a ativação legítima
    // da subscription Bacen — reconciliamos via customer + valor.
    // ============================================================
    const asaasCustomerId = (payment as any)?.customer as string | undefined;
    if (!updated && asaasCustomerId && isPaid) {
      // A autorização pode estar em QUALQUER status: no QR integrado (Jornada 3)
      // o PAYMENT_RECEIVED chega ANTES do AUTHORIZATION_ACTIVATED, então exigir
      // status ACTIVE descartava pagamentos legítimos. Janela de 30 dias +
      // tolerância de valor continuam sendo as travas.
      const authWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: authByCustomer } = await supabase
        .from("asaas_pix_authorizations")
        .select("*")
        .eq("asaas_customer_id", asaasCustomerId)
        .gte("created_at", authWindowStart)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (authByCustomer) {
        const paymentValue = Number((payment as any).value || 0);
        const expectedValue = Number(authByCustomer.value_cents || 0) / 100;
        // Tolerância R$ 0,50 para arredondamentos; rejeita valores
        // nitidamente diferentes (evita ativar por PIX aleatório de
        // outro contexto no mesmo customer). Com trial semanal, o 1º
        // pagamento vale o trial (R$ 6,90) e não o ciclo cheio.
        const paidTrial = isTrialPayment(authByCustomer, paymentValue);
        const valueMatches = Math.abs(paymentValue - expectedValue) <= 0.5 || paidTrial;

        if (!valueMatches) {
          console.warn(
            `[webhook-asaas] Payment ${payment.id} (R$${paymentValue}) não bate com auth ${authByCustomer.asaas_authorization_id} (R$${expectedValue}). Ignorado.`,
          );
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("asaas_payments")
            .insert({
              asaas_payment_id: payment.id,
              asaas_customer_id: asaasCustomerId,
              // Cascata: sub da autorização → sub do payload → id da autorização.
              // Sem isso a linha nasce órfã e o funil trata renovação como venda nova.
              asaas_subscription_id:
                authByCustomer.asaas_subscription_id ||
                subscriptionId ||
                authByCustomer.asaas_authorization_id,
              user_id: authByCustomer.user_id,
              customer_name: authByCustomer.customer_name,
              customer_email: authByCustomer.customer_email,
              customer_phone: authByCustomer.customer_phone,
              customer_cpf: authByCustomer.customer_cpf,
              plan: authByCustomer.plan,
              billing_period: authByCustomer.billing_period,
              amount_cents:
                Math.round(paymentValue * 100) || authByCustomer.value_cents,
              status: newStatus,
              payment_method: "PIX_AUTOMATIC",
              is_trial: paidTrial,
              invoice_url: (payment as any).invoiceUrl || null,
              paid_at: new Date().toISOString(),
              fbp: authByCustomer.fbp || null,
              fbc: authByCustomer.fbc || null,
              ga_client_id: authByCustomer.ga_client_id || null,
              raw_payload: payment,
            })
            .select()
            .maybeSingle();

          if (insErr) {
            console.error(
              "[webhook-asaas] Erro reconciliando pagamento Bacen avulso:",
              insErr,
            );
          } else {
            updated = inserted;
            console.log(
              `[webhook-asaas] ✅ Payment ${payment.id} reconciliado com auth ${authByCustomer.asaas_authorization_id} via customer ${asaasCustomerId}`,
            );
            // Fecha o vínculo na autorização pra que os próximos ciclos já nasçam ligados.
            if (!authByCustomer.asaas_subscription_id && subscriptionId) {
              await supabase
                .from("asaas_pix_authorizations")
                .update({ asaas_subscription_id: subscriptionId })
                .eq("asaas_authorization_id", authByCustomer.asaas_authorization_id);
            }
          }
        }
      }
    }

    if (updated) {
      console.log(`[webhook-asaas] Pagamento ${payment.id} atualizado para ${newStatus}`);
    } else if (isPaid) {
      // Pagamento confirmado que não conseguimos vincular a nenhum cliente:
      // ERROR (não warn) pra ficar visível nos logs / alertas.
      console.error(
        `[webhook-asaas] ⚠️ Pagamento ${payment.id} CONFIRMADO mas não vinculado a nenhum cliente (customer=${asaasCustomerId ?? "n/a"}, sub=${subscriptionId ?? "n/a"})`,
      );
    } else if (!subscriptionId && !pixAutoAuthId) {
      console.warn(`[webhook-asaas] Pagamento ${payment.id} não encontrado no banco`);
    }

    // ============================================================
    // PIX Automático Bacen — fatura gêmea do ciclo 1.
    // A autorização é criada com `paymentCreationMode: SUBSCRIPTION` e
    // `startDate` = hoje, então o Asaas emite (a) o QR imediato, que é o
    // primeiro pagamento e ativa o consentimento, e (b) a fatura do ciclo 1
    // da assinatura, com o MESMO vencimento e valor. A segunda é duplicada:
    // fica PENDING, vira OVERDUE e o Asaas cobra por e-mail quem já pagou.
    // Cancelamos em tempo real, com condição estrita: só quando existe uma
    // cobrança PIX_AUTOMATIC já paga, do mesmo customer, mesmo valor e mesmo
    // vencimento. Sem gêmea paga, nada é cancelado.
    // ============================================================
    const dueDateRaw = (payment as any)?.dueDate as string | undefined;
    const isOpenStatus = newStatus === "PENDING" || newStatus === "OVERDUE";
    if (isOpenStatus && !isPaid && dueDateRaw && (subscriptionId || pixAutoAuthId)) {
      const dueDay = String(dueDateRaw).slice(0, 10);
      const customerId =
        ((payment as any)?.customer as string | undefined) ||
        (updated?.asaas_customer_id as string | undefined);
      const amountCents =
        Math.round(Number((payment as any).value || 0) * 100) ||
        (updated?.amount_cents as number | undefined) ||
        0;

      if (customerId && amountCents > 0) {
        const { data: twins } = await supabase
          .from("asaas_payments")
          .select("asaas_payment_id, status, payment_method, raw_payload, paid_at, created_at")
          .eq("asaas_customer_id", customerId)
          .eq("amount_cents", amountCents)
          .in("status", ["RECEIVED", "CONFIRMED"])
          .neq("asaas_payment_id", payment.id);

        const paidTwin = (twins || []).find((t) => {
          if (t.payment_method !== "PIX_AUTOMATIC") return false;
          // A cobrança do QR imediato é reconciliada sem dueDate: cai pra data de
          // pagamento, com tolerância de 1 dia (virada de dia / fuso).
          const twinDay = String(
            (t.raw_payload as any)?.dueDate ||
              (t.raw_payload as any)?.paymentDate ||
              t.paid_at ||
              t.created_at ||
              "",
          ).slice(0, 10);
          if (!twinDay) return false;
          const diff = Math.abs(
            new Date(`${twinDay}T00:00:00Z`).getTime() - new Date(`${dueDay}T00:00:00Z`).getTime(),
          );
          return diff <= 24 * 60 * 60 * 1000;
        });

        if (paidTwin) {
          const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
          const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
          const ASAAS_BASE_URL =
            ASAAS_ENV === "production"
              ? "https://api.asaas.com/v3"
              : "https://api-sandbox.asaas.com/v3";
          let cancelledRemote = false;
          if (ASAAS_API_KEY) {
            try {
              const delResp = await fetch(`${ASAAS_BASE_URL}/payments/${payment.id}`, {
                method: "DELETE",
                headers: {
                  access_token: ASAAS_API_KEY,
                  "Content-Type": "application/json",
                  "User-Agent": "Aura/1.0",
                },
              });
              cancelledRemote = delResp.ok;
              if (!delResp.ok) {
                console.warn(
                  `[webhook-asaas] DELETE /payments/${payment.id} → ${delResp.status}`,
                );
              }
            } catch (e) {
              console.warn(
                `[webhook-asaas] Falha cancelando gêmea ${payment.id}:`,
                (e as Error).message,
              );
            }
          }

          if (cancelledRemote) {
            await supabase
              .from("asaas_payments")
              .update({ status: "CANCELLED" })
              .eq("asaas_payment_id", payment.id);
            console.log(
              `[webhook-asaas] 🧹 Fatura gêmea ${payment.id} cancelada (venc. ${dueDay}, gêmea paga ${paidTwin.asaas_payment_id})`,
            );
            return new Response(
              JSON.stringify({ ok: true, event, duplicate_cancelled: payment.id }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }
    }

    // Concede / estende acesso no profile quando o pagamento é confirmado.
    if (isPaid && updated?.customer_email) {
      await handleActivation(supabase, updated, payment);
    }

    // Eventos terminais de assinatura → marca status e expira acesso no fim do ciclo atual.
    const overdueSubscriptionId =
      subscriptionId ||
      (pixAutoAuthId as string | undefined) ||
      (updated?.asaas_subscription_id as string | undefined);
    if ((event === "SUBSCRIPTION_DELETED" || event === "PAYMENT_OVERDUE") && overdueSubscriptionId) {
      const { data: subRow } = await supabase
        .from("asaas_payments")
        .select("customer_email, user_id, customer_name, customer_phone")
        .eq("asaas_subscription_id", overdueSubscriptionId)
        .limit(1)
        .maybeSingle();
      if (subRow?.customer_email) {
        await supabase
          .from("profiles")
          .update({ status: event === "SUBSCRIPTION_DELETED" ? "canceled" : "past_due" })
          .eq("email", subRow.customer_email);
        console.log(`[webhook-asaas] Profile ${subRow.customer_email} marcado como ${event}`);
      }

      // Dunning via WhatsApp (apenas PAYMENT_OVERDUE — cobre PIX recorrente e PIX Automático Bacen).
      if (event === "PAYMENT_OVERDUE") {
        try {
          const { sendDunningWhatsApp } = await import("../_shared/dunning-whatsapp.ts");
          // Resolve user_id e telefone via profile (asaas_payments pode não ter user_id ainda).
          let userId = subRow?.user_id as string | undefined;
          let phone = subRow?.customer_phone as string | undefined;
          let name = subRow?.customer_name as string | undefined;
          if (subRow?.customer_email) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("user_id, phone, name")
              .eq("email", subRow.customer_email)
              .maybeSingle();
            if (prof) {
              userId = prof.user_id;
              phone = prof.phone || phone;
              name = prof.name || name;
            }
          }
          if (userId) {
            const waResult = await sendDunningWhatsApp({
              supabase,
              profile: { user_id: userId, phone, name },
              eventId: `asaas-${event}-${payment.id}`,
              provider: "asaas",
              paymentId: payment.id,
              subscriptionId: overdueSubscriptionId,
              paymentMethod: (updated?.payment_method as string | null) || null,
            });
            console.log(
              `[webhook-asaas] dunning WhatsApp sent=${waResult.sent} skip=${waResult.skipped || "-"} err=${waResult.error || "-"}`,
            );
          } else {
            // MODO DEGRADADO: sem profile no banco, ainda avisamos usando o
            // telefone do cliente no Asaas + link da fatura.
            const degradedPhone = phone || null;
            const degradedLink = (updated?.invoice_url as string | null)
              || (payment as any)?.invoiceUrl
              || "https://olaaura.com.br/v2/checkout";
            if (degradedPhone) {
              const { sendDunningWhatsAppDegraded } = await import("../_shared/dunning-whatsapp.ts");
              const degraded = await sendDunningWhatsAppDegraded({
                supabase,
                phone: degradedPhone,
                name: name || null,
                link: degradedLink,
                eventId: `asaas-${event}-${payment.id}`,
                provider: "asaas",
                paymentId: payment.id,
                subscriptionId: overdueSubscriptionId,
              });
              console.log(
                `[webhook-asaas] dunning degradado sent=${degraded.sent} skip=${degraded.skipped || "-"} err=${degraded.error || "-"}`,
              );
            } else {
              console.warn(`[webhook-asaas] OVERDUE sem user_id e sem telefone — WhatsApp não enviado`);
            }
          }
        } catch (waErr) {
          console.error("[webhook-asaas] erro disparando dunning WhatsApp:", waErr);
        }

        // ────────────────────────────────────────────────────────────────
        // Cadência de dunning do PIX (recorrente e PIX Automático Bacen).
        // O Asaas emite PAYMENT_OVERDUE só uma vez por cobrança e o PIX não
        // tem retry de cartão, então sem estas tarefas a escada pararia no
        // aviso 1 e nunca chegaria às ofertas (30% → Lite).
        // Escada do PIX tem 3 degraus (2 avisos + Lite) e o envio do
        // PAYMENT_OVERDUE já gasta o degrau 1 → só faltam 2 follow-ups.
        // Agenda D+2 e D+4. Idempotente por payment_id.
        // ────────────────────────────────────────────────────────────────
        try {
          const pmPix = (updated?.payment_method as string | undefined) || "";
          // Exige subscription: cobrança PIX avulsa sem recorrência não entra na escada.
          const isPix = pmPix.toUpperCase().includes("PIX") && !!overdueSubscriptionId;
          if (isPix) {
            const { data: existingPixTask } = await supabase
              .from("scheduled_tasks")
              .select("id")
              .eq("task_type", "dunning_pix_followup")
              .eq("status", "pending")
              .contains("payload", { payment_id: payment.id })
              .limit(1)
              .maybeSingle();
            if (!existingPixTask) {
              const nowMs = Date.now();
              const rows = [2, 4].map((delayDays, idx) => ({
                user_id: (updated?.user_id as string | null) || null,
                task_type: "dunning_pix_followup",
                execute_at: new Date(nowMs + delayDays * 86400_000).toISOString(),
                status: "pending",
                payload: {
                  payment_id: payment.id,
                  subscription_id: overdueSubscriptionId,
                  customer_id: (updated?.asaas_customer_id as string | null) || null,
                  attempt: idx + 1,
                  payment_method: pmPix || "PIX",
                },
              }));
              const { error: pixInsErr } = await supabase.from("scheduled_tasks").insert(rows);
              if (pixInsErr) {
                console.error("[webhook-asaas] erro agendando dunning PIX:", pixInsErr);
              } else {
                console.log(`[webhook-asaas] cadência dunning PIX agendada para ${payment.id}`);
              }
            } else {
              console.log(`[webhook-asaas] cadência dunning PIX já agendada para ${payment.id}, skip`);
            }
          }
        } catch (pixErr) {
          console.error("[webhook-asaas] erro no scheduling de dunning PIX:", pixErr);
        }

        // ────────────────────────────────────────────────────────────────
        // Retry automático de cartão (paridade com Smart Retries do Stripe).
        // Só roda pra CREDIT_CARD recorrente (sub) — installment não tem
        // creditCardToken reusável e PIX não tem cartão salvo.
        // Agenda 3 retries em D+2, D+4, D+7 usando `scheduled_tasks`.
        // Idempotente: só agenda se ainda não houver retry pendente pra esse payment.
        // ────────────────────────────────────────────────────────────────
        try {
          const pm = (updated?.payment_method as string | undefined) || "";
          // Cartão recorrente é gravado como "CREDIT_CARD_RECURRING" pelo criar-cartao-asaas.
          // Aceita variantes legadas ("CREDIT_CARD") por defesa.
          const isRecurringCard =
            (pm === "CREDIT_CARD_RECURRING" || pm === "CREDIT_CARD") &&
            !!overdueSubscriptionId;
          if (isRecurringCard) {
            const { data: existingRetry } = await supabase
              .from("scheduled_tasks")
              .select("id")
              .eq("task_type", "card_retry_asaas")
              .eq("status", "pending")
              .contains("payload", { paymentId: payment.id })
              .limit(1)
              .maybeSingle();
            if (!existingRetry) {
              const now = Date.now();
              const retries = [
                { attempt: 1, delayDays: 2 },
                { attempt: 2, delayDays: 4 },
                { attempt: 3, delayDays: 7 },
              ];
              const rows = retries.map((r) => ({
                user_id: (updated?.user_id as string | null) || null,
                task_type: "card_retry_asaas",
                execute_at: new Date(now + r.delayDays * 86400_000).toISOString(),
                status: "pending",
                payload: {
                  paymentId: payment.id,
                  subscriptionId: overdueSubscriptionId,
                  customerId: (updated?.asaas_customer_id as string | null) || null,
                  value: Number((payment as any).value) || 0,
                  attempt: r.attempt,
                  maxAttempts: retries.length,
                },
              }));
              const { error: insErr } = await supabase.from("scheduled_tasks").insert(rows);
              if (insErr) {
                console.error("[webhook-asaas] erro agendando card retries:", insErr);
              } else {
                console.log(`[webhook-asaas] 3 card retries agendados para payment ${payment.id}`);
              }
            } else {
              console.log(`[webhook-asaas] card retries já agendados para ${payment.id}, skip`);
            }
          }
        } catch (retryErr) {
          console.error("[webhook-asaas] erro no scheduling de card retries:", retryErr);
        }
      }
    }

    // Sempre retornar 200 para o Asaas não ficar reenviando (idempotente)
    return new Response(JSON.stringify({ ok: true, event, status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[webhook-asaas] Erro:", error);
    // 200 mesmo em erro pra evitar retry storm; logamos pra investigar
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// Ativação de assinatura — paridade com stripe-webhook.
// Detecta novo / returning / upgrade / renovação e dispara welcome
// (profile + portal token + template WhatsApp + email + pending_insight).
// ============================================================
// Dispara Purchase via Meta CAPI com dedup por event_id (meta_capi_log).
// Evita duplicar quando o mesmo payment passa por mais de um caminho de ativação
// (webhook normal, recovered-*, reprocessamento manual).
async function fireMetaCapiPurchase(
  supabase: any,
  args: {
    eventId: string;
    email: string;
    phone?: string;
    firstName?: string;
    fbp?: string | null;
    fbc?: string | null;
    value: number;
    plan: string;
    isFirstPurchase: boolean;
  },
): Promise<void> {
  try {
    // Dedup: já existe sucesso (200) para este event_id?
    const { data: prior } = await supabase
      .from("meta_capi_log")
      .select("id")
      .eq("event_id", args.eventId)
      .eq("event_name", "Purchase")
      .eq("meta_status", 200)
      .limit(1)
      .maybeSingle();
    if (prior) {
      console.log(`[webhook-asaas] ⏭️ CAPI Purchase já registrado (event_id=${args.eventId}), pulando`);
      return;
    }

    // Fallback de atribuição: último fbp/fbc conhecido do lead quando a
    // transação chegou sem cookie.
    const ident = await resolveMetaIdentity(supabase, {
      email: args.email, phone: args.phone, fbp: args.fbp, fbc: args.fbc,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        event_name: "Purchase",
        event_id: args.eventId,
        event_source_url: "https://olaaura.com.br/obrigado",
        source: "webhook-asaas",
        is_first_purchase: args.isFirstPurchase,
        user_data: {
          email: args.email,
          phone: args.phone || undefined,
          first_name: args.firstName || undefined,
          ...(ident.fbp && { fbp: ident.fbp }),
          ...(ident.fbc && { fbc: ident.fbc }),
        },
        custom_data: {
          value: args.value,
          currency: "BRL",
          content_name: `Plano ${PLAN_NAMES[args.plan] || args.plan}`,
          content_category: args.plan,
        },
      }),
    });
    console.log(
      `[webhook-asaas] ✅ CAPI Purchase disparado (event_id=${args.eventId}, fbp=${!!ident.fbp}, fbc=${!!ident.fbc})`,
    );
    // ChatGPT Ads (OpenAI) — mesma conversão, mesmo event_id.
    await sendOpenAiConversion({
      eventType: "purchase",
      eventId: args.eventId,
      value: args.value,
      currency: "BRL",
      contentName: `Plano ${PLAN_NAMES[args.plan] || args.plan}`,
      source: "webhook-asaas",
    });
  } catch (capiErr) {
    console.warn("[webhook-asaas] ⚠️ CAPI Purchase falhou (non-blocking):", capiErr);
  }
}

async function handleActivation(
  supabase: any,
  updated: any,
  payment: Record<string, unknown>,
): Promise<void> {
  try {
    const customerEmail = (updated.customer_email as string).toLowerCase();
    const customerPhone = (updated.customer_phone as string) || "";
    const customerName = (updated.customer_name as string) || "Cliente";
    const customerPlan = (updated.plan as string) || "essencial";
    const billingPeriod = (updated.billing_period as string) || "monthly";
    const subscriptionId = (updated.asaas_subscription_id as string) || null;
    const paymentMethodLabel = (updated.payment_method as string) || "";
    const isCardPayment = paymentMethodLabel.startsWith("CREDIT_CARD");
    const paymentId = payment.id as string;
    // 1ª semana promocional do PIX Automático libera 7 dias; o 1º débito
    // recorrente (D+7) estende para o ciclo cheio.
    const isTrialActivation = (updated as any).is_trial === true;
    const days = isTrialActivation ? TRIAL_DAYS : (CYCLE_DAYS[billingPeriod] ?? 31);

    // 1) Idempotência: se já existe outro payment pago para esta subscription,
    //    é renovação → só estende plan_expires_at e sai.
    let isRenewal = false;
    if (subscriptionId) {
      const { data: priorPaid } = await supabase
        .from("asaas_payments")
        .select("id")
        .eq("asaas_subscription_id", subscriptionId)
        .in("status", ["CONFIRMED", "RECEIVED"])
        .neq("asaas_payment_id", paymentId)
        .limit(1);
      isRenewal = !!(priorPaid && priorPaid.length > 0);
    }

    // 2) Resolve profile (phone + email fallback).
    const resolveResult = await resolveProfile(supabase, customerPhone, customerEmail);
    const existingProfile = resolveResult.profile;
    const isReturning = !isRenewal && existingProfile?.status === "canceled";
    const isUpgrade =
      !isRenewal &&
      !!existingProfile &&
      !isReturning &&
      existingProfile.plan !== customerPlan;
    const isNew = !isRenewal && !existingProfile;

    // Telefone normalizado p/ Meta oficial (Twilio).
    const cleanPhone = (customerPhone || "").replace(/\D/g, "");
    const formattedPhone = cleanPhone ? normalizeBrazilianPhone(cleanPhone) : "";

    // 3) Cria ou atualiza profile.
    let profileUserId: string;
    let profileRowId: string | null = null;
    const today = new Date().toISOString().split("T")[0];
    const newExpiryBase =
      existingProfile && (existingProfile as any).plan_expires_at &&
      new Date((existingProfile as any).plan_expires_at) > new Date()
        ? new Date((existingProfile as any).plan_expires_at)
        : new Date();
    const newExpiry = new Date(newExpiryBase.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const sessionsCount = PLAN_SESSIONS[customerPlan] ?? 0;

    if (isNew) {
      profileUserId = crypto.randomUUID();
      const { data: insertedProfile, error: insErr } = await supabase.from("profiles").insert({
        user_id: profileUserId,
        name: customerName,
        phone: formattedPhone || cleanPhone || null,
        email: customerEmail,
        plan: customerPlan,
        status: "active",
        sessions_used_this_month: 0,
        sessions_reset_date: today,
        messages_today: 0,
        last_message_date: today,
        needs_schedule_setup: sessionsCount > 0,
        trial_started_at: new Date().toISOString(),
        trial_phase: "listening",
        current_journey_id: "j1-ansiedade",
        current_episode: 0,
        plan_expires_at: newExpiry,
        asaas_customer_id: updated.asaas_customer_id || null,
        whatsapp_provider: "meta",
        billing_cycle: billingPeriod,
        card_gateway: "asaas",
        payment_failed_at: null,
      }).select("id").maybeSingle();
      if (insErr) {
        console.error("[webhook-asaas] Erro criando profile:", insErr);
      } else {
        profileRowId = insertedProfile?.id ?? null;
        console.log(`[webhook-asaas] ✅ Profile novo criado: ${profileUserId} (${customerEmail})`);
      }
    } else {
      profileUserId = existingProfile!.user_id;
      profileRowId = (existingProfile as any).id ?? null;
      const updatePayload: Record<string, unknown> = {
        plan: customerPlan,
        status: "active",
        plan_expires_at: newExpiry,
        billing_cycle: billingPeriod,
        card_gateway: "asaas",
        payment_failed_at: null,
        ...(updated.asaas_customer_id ? { asaas_customer_id: updated.asaas_customer_id } : {}),
        updated_at: new Date().toISOString(),
      };
      if (isReturning) {
        updatePayload.sessions_used_this_month = 0;
        updatePayload.sessions_reset_date = today;
        updatePayload.trial_phase = "listening";
        updatePayload.needs_schedule_setup = sessionsCount > 0;
      }
      const { error: updErr } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("user_id", profileUserId);
      if (updErr) {
        console.error("[webhook-asaas] Erro atualizando profile:", updErr);
      } else {
        console.log(
          `[webhook-asaas] ✅ Profile ${profileUserId} (${isRenewal ? "renovação" : isReturning ? "returning" : isUpgrade ? "upgrade" : "update"}) estendido até ${newExpiry}`,
        );
        // Em returning/upgrade: limpa sessões órfãs (scheduled sem started_at)
        // do ciclo anterior para evitar reativação de fantasmas pelo agente.
        if (isReturning || isUpgrade) {
          try {
            const { data: cleanedSessions } = await supabase
              .from("sessions")
              .update({ status: "cancelled", session_summary: "plan_change_cleanup" })
              .eq("user_id", profileUserId)
              .eq("status", "scheduled")
              .is("started_at", null)
              .select("id");
            if (cleanedSessions && cleanedSessions.length > 0) {
              console.log(`[webhook-asaas] 🧹 Cancelled ${cleanedSessions.length} orphan scheduled sessions (plan change cleanup)`);
            }
          } catch (cleanupErr) {
            console.warn("[webhook-asaas] ⚠️ Orphan session cleanup failed (non-blocking):", cleanupErr);
          }
        }
      }
    }

    // Vincula payment ao profile via FK (asaas_payments.user_id → profiles.id).
    if (profileRowId) {
      await supabase
        .from("asaas_payments")
        .update({ user_id: profileRowId })
        .eq("asaas_payment_id", paymentId);
    }

    // Renovação → para por aqui (sem welcome novo). Antes disso, envia o
    // `Subscribe`: a cobrança cheia do ciclo é a conversão comercial real e é o
    // que dá valor correto ao Meta/GA4/ChatGPT Ads (o `Purchase` da entrada sai
    // sempre em R$ 6,90).
    if (isRenewal) {
      await fireSubscribeConversion(supabase, {
        eventId: `asaas-sub-${paymentId}`,
        email: customerEmail || null,
        phone: formattedPhone || cleanPhone || null,
        firstName: (customerName || "").split(" ")[0] || null,
        fbp: (updated.fbp as string | null) || null,
        fbc: (updated.fbc as string | null) || null,
        value: Number((updated.amount_cents as number) || 0) / 100,
        plan: customerPlan,
        source: "webhook-asaas",
      });
      try {
        await supabase.from("checkout_funnel_events").insert({
          anon_session_id: `asaas:${paymentId}`,
          step: "subscription_confirmed",
          plan: customerPlan,
          payment_method: "pix",
          detail: "asaas",
          meta: { payment_id: paymentId, amount_cents: updated.amount_cents },
        });
      } catch (e) {
        console.warn("[webhook-asaas] ⚠️ falha registrando subscription_confirmed:", (e as Error)?.message);
      }
      return;
    }

    // ============================================================
    // Migration cleanup: se cliente tinha Stripe ativa (migrou de cartão pra
    // PIX Asaas), cancela a Stripe sub pra parar cobranças duplicadas / retries.
    // Non-blocking: erro nunca aborta a ativação Asaas.
    // ============================================================
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && customerEmail) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const customers = await stripe.customers.list({ email: customerEmail, limit: 5 });
        for (const cust of customers.data) {
          for (const status of ["active", "past_due", "trialing"] as const) {
            const subs = await stripe.subscriptions.list({ customer: cust.id, status, limit: 10 });
            for (const sub of subs.data) {
              await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
              console.log(`[migration-cleanup] Stripe sub ${sub.id} (${status}) cancelada para ${customerEmail}`);
            }
          }
        }
      }
    } catch (stripeErr) {
      console.error("[migration-cleanup] Falha cancelando Stripe (non-blocking):", stripeErr);
    }

    // ============================================================
    // Cartão parcelado (installment) não renova sozinho — Asaas cobra as N
    // parcelas e para. Agenda lembrete D-3 antes do fim do ciclo para reativação.
    // ============================================================
    if (paymentMethodLabel === "CREDIT_CARD_INSTALLMENT") {
      try {
        const remindAt = new Date(new Date(newExpiry).getTime() - 3 * 24 * 60 * 60 * 1000);
        // Se já passou (ciclo curtíssimo ou clock skew), pula.
        if (remindAt.getTime() > Date.now()) {
          const { error: schedErr } = await supabase.from("scheduled_tasks").insert({
            user_id: profileUserId,
            task_type: "installment_renewal_reminder",
            execute_at: remindAt.toISOString(),
            status: "pending",
            payload: {
              plan: customerPlan,
              billing: billingPeriod,
              expires_at: newExpiry,
              customer_name: customerName,
              customer_email: customerEmail,
            },
          });
          if (schedErr) {
            console.warn("[webhook-asaas] ⚠️ agendar renewal reminder falhou:", schedErr.message);
          } else {
            console.log(`[webhook-asaas] ✅ Renewal reminder agendado para ${remindAt.toISOString()}`);
          }
        }
      } catch (schedCatch) {
        console.warn("[webhook-asaas] ⚠️ scheduled_tasks insert catch:", schedCatch);
      }
    }

    // ============================================================
    // Meta CAPI Purchase — APENAS na 1ª compra (novo cliente vindo do anúncio).
    // Renovações Asaas (isRenewal=true) já retornaram acima. Upgrade/returning
    // não são "1ª compra" no sentido de aquisição → não disparam Purchase.
    // ============================================================
    // CAPI Purchase: dispara em TODA ativação que não seja renovação (novo,
    // returning, upgrade). Dedup por event_id em meta_capi_log evita duplicata
    // quando o mesmo paymentId passa por caminhos alternativos (recovered-*,
    // reprocessamento manual). Renovações puras já saíram via `return` acima.
    const amountValue = Number((updated.amount_cents as number) || 0) / 100;
    // event_id estável: payment normal usa paymentId; payments "recovered-*"
    // (reprocessamento manual) caem para a authorization, preservando dedup.
    const stableEventId = paymentId.startsWith("recovered-")
      ? `asaas-pix-${paymentId.replace(/^recovered-/, "")}-purchase`
      : paymentId;
    await fireMetaCapiPurchase(supabase, {
      eventId: stableEventId,
      email: customerEmail,
      phone: formattedPhone || cleanPhone || undefined,
      firstName: (customerName || "").split(" ")[0] || undefined,
      fbp: (updated.fbp as string | null) || null,
      fbc: (updated.fbc as string | null) || null,
      value: amountValue,
      plan: customerPlan,
      isFirstPurchase: isNew,
    });
    if (!isNew) {
      console.log(
        `[webhook-asaas] ℹ️ CAPI Purchase enviado em ativação ${isReturning ? "returning" : isUpgrade ? "upgrade" : "outro"} (não-1ª compra)`,
      );
    }

    // Funil: linha de chegada gravada pelo servidor (paridade com Woovi/Stripe).
    try {
      await supabase.from("checkout_funnel_events").insert({
        anon_session_id: `asaas:${stableEventId}`,
        step: "purchase_confirmed",
        plan: customerPlan,
        payment_method: "pix",
        detail: "asaas",
        meta: { payment_id: paymentId, value: amountValue, is_new: isNew },
      });
    } catch (e) {
      console.warn("[webhook-asaas] ⚠️ falha registrando purchase_confirmed:", (e as Error)?.message);
    }

    // GA4 (Measurement Protocol) — paridade com o trilho do cartão.
    await sendGa4Purchase({
      email: customerEmail,
      transactionId: stableEventId,
      value: amountValue,
      plan: customerPlan,
      planName: PLAN_NAMES[customerPlan] || customerPlan,
      eventSourceUrl: "https://olaaura.com.br/obrigado",
      source: "webhook-asaas",
    });

    // 4) Portal token.
    let portalLink = "";
    try {
      await supabase
        .from("user_portal_tokens")
        .upsert({ user_id: profileUserId }, { onConflict: "user_id" });
      const { data: tokenData } = await supabase
        .from("user_portal_tokens")
        .select("token")
        .eq("user_id", profileUserId)
        .single();
      if (tokenData?.token) {
        portalLink = `https://olaaura.com.br/meu-espaco`;
      }
    } catch (tokenErr) {
      console.warn("[webhook-asaas] ⚠️ Portal token falhou (non-blocking):", tokenErr);
    }
    const portalLine = portalLink ? `\n\nAcesse seu painel pessoal: ${portalLink} ✨` : "";

    // 5) Monta welcome (3 variantes idênticas ao stripe-webhook).
    const planName = PLAN_NAMES[customerPlan] || "Essencial";
    const guideLinkText = "https://olaaura.com.br/guia";
    let welcomeMessage: string;
    if (isReturning) {
      welcomeMessage = `Oi, ${customerName}! 💜\n\nQue bom ter você de volta! 🌟\n\nVocê escolheu o plano ${planName}.${portalLine}\n\nVamos retomar de onde paramos?`;
    } else if (isUpgrade) {
      welcomeMessage = `Oi, ${customerName}! 💜 Que notícia boa!\n\nAgora somos oficiais. Você escolheu o plano ${planName}.${portalLine}\n\nVamos continuar de onde paramos?`;
    } else {
      welcomeMessage = `Oi, ${customerName}! 🌟 Que bom te receber por aqui.\n\nEu sou a AURA — e vou ficar com você nessa jornada.\n\nVocê escolheu o plano ${planName}.\n\nComigo, você pode falar com liberdade: sem julgamento, no seu ritmo.\n\nSe preferir, pode me mandar áudio também! 🎙️\n\nDá uma olhada no que você vai ter acesso: ${guideLinkText}${portalLine}\n\nMe diz: como você está hoje?`;
    }

    // 6) Salva pending_insight com marker [WELCOME] (entrega ao clicar "Começar").
    try {
      await supabase
        .from("profiles")
        .update({ pending_insight: `[WELCOME]${welcomeMessage}` })
        .eq("user_id", profileUserId);
      console.log("[webhook-asaas] ✅ Pending welcome salvo");
    } catch (pendErr) {
      console.warn("[webhook-asaas] ⚠️ Pending welcome falhou:", pendErr);
    }

    // 7) Template WhatsApp curto via sendProactive (Meta oficial via Twilio). Retry 3s.
    if (formattedPhone) {
      if (isReturning) {
        // Returning → mensagem de welcome back direta (texto livre se janela aberta).
        const welcomeBackMessage = `Oi, ${customerName}! 💜\n\nQue bom ter você de volta! 🌟\n\nSua assinatura AURA foi reativada e estou aqui, pronta pra continuar nossa jornada.\n\nMe conta: como você está hoje?`;
        try {
          let res = await sendProactive(formattedPhone, welcomeBackMessage, "welcome", profileUserId);
          if (!res.success) {
            await new Promise((r) => setTimeout(r, 3000));
            res = await sendProactive(formattedPhone, welcomeBackMessage, "welcome", profileUserId);
          }
          if (res.success) {
            console.log("[webhook-asaas] ✅ Welcome back enviado via", res.provider);
            await supabase.from("messages").insert({
              user_id: profileUserId,
              role: "assistant",
              content: welcomeBackMessage,
            });
          } else {
            console.error("[webhook-asaas] ❌ Welcome back falhou após retry:", res.error);
          }
        } catch (e) {
          console.error("[webhook-asaas] ❌ Erro welcome back:", e);
        }
      } else {
        const templateText = `Olá, ${customerName}. Sua assinatura da Aura foi ativada com sucesso.`;
        try {
          let res = await sendProactive(formattedPhone, templateText, "welcome", profileUserId);
          if (!res.success) {
            console.warn("[webhook-asaas] ⚠️ Welcome template falhou, retry 3s:", res.error);
            await new Promise((r) => setTimeout(r, 3000));
            res = await sendProactive(formattedPhone, templateText, "welcome", profileUserId);
          }
          if (res.success) {
            console.log("[webhook-asaas] ✅ Welcome template enviado via", res.provider);
          } else {
            console.error("[webhook-asaas] ❌ Welcome template falhou após retry:", res.error);
          }
        } catch (e) {
          console.error("[webhook-asaas] ❌ Erro welcome template:", e);
        }
      }
    } else {
      console.warn("[webhook-asaas] ⚠️ Sem telefone — pulando template WhatsApp");
    }

    // 8) Email welcome (backup caso template WhatsApp esteja pendente).
    if (customerEmail) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: customerEmail,
            idempotencyKey: `welcome-asaas-${paymentId}`,
            templateData: { name: customerName, portalUrl: portalLink || undefined },
          },
        });
        console.log("[webhook-asaas] ✅ Welcome email enfileirado");
      } catch (emailErr) {
        console.warn("[webhook-asaas] ⚠️ Welcome email falhou (non-blocking):", emailErr);
      }
    }
  } catch (err) {
    console.error("[webhook-asaas] ❌ handleActivation erro fatal (non-blocking):", err);
  }
}