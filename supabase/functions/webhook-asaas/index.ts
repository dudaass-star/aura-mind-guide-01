// Webhook do Asaas: recebe eventos PAYMENT_* e atualiza status no banco
// Autenticação: header "asaas-access-token" deve bater com ASAAS_WEBHOOK_TOKEN
// Paridade com stripe-webhook: cria profile, gera portal token, dispara welcome
// (template WhatsApp via sendProactive + email + pending_insight). Sem allocateInstance:
// Meta oficial via Twilio não usa instância (zapi está PROIBIDO).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveProfile } from "../_shared/profile-resolver.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

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
  yearly: 372,
};

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

      // Cancelamento da autorização → marca profile como canceled (perde acesso ao fim do ciclo).
      if (mapped.status === "CANCELLED" || mapped.status === "REJECTED" || mapped.status === "EXPIRED") {
        const { data: authRow } = await supabase
          .from("asaas_pix_authorizations")
          .select("customer_email")
          .eq("asaas_authorization_id", authorizationEvt.id)
          .maybeSingle();
        if (authRow?.customer_email) {
          await supabase
            .from("profiles")
            .update({ status: "canceled" })
            .eq("email", authRow.customer_email);
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
    };

    const newStatus = statusMap[event] || (payment.status as string) || "UNKNOWN";
    const isPaid = event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED";

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      raw_payload: payment,
    };
    if (isPaid) {
      updatePayload.paid_at = new Date().toISOString();
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
            asaas_subscription_id: pixAutoAuthId, // reusa coluna pra agrupar ciclos
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
      const { data: authByCustomer } = await supabase
        .from("asaas_pix_authorizations")
        .select("*")
        .eq("asaas_customer_id", asaasCustomerId)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (authByCustomer) {
        const paymentValue = Number((payment as any).value || 0);
        const expectedValue = Number(authByCustomer.value_cents || 0) / 100;
        // Tolerância R$ 0,50 para arredondamentos; rejeita valores
        // nitidamente diferentes (evita ativar por PIX aleatório de
        // outro contexto no mesmo customer).
        const valueMatches = Math.abs(paymentValue - expectedValue) <= 0.5;

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
              asaas_subscription_id: authByCustomer.asaas_subscription_id,
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
            });
            console.log(
              `[webhook-asaas] dunning WhatsApp sent=${waResult.sent} skip=${waResult.skipped || "-"} err=${waResult.error || "-"}`,
            );
          } else {
            console.warn(`[webhook-asaas] OVERDUE sem user_id resolvido — WhatsApp não enviado`);
          }
        } catch (waErr) {
          console.error("[webhook-asaas] erro disparando dunning WhatsApp:", waErr);
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
          const isRecurringCard = pm === "CREDIT_CARD" && !!overdueSubscriptionId;
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
    console.log(
      `[webhook-asaas] ✅ CAPI Purchase disparado (event_id=${args.eventId}, fbp=${!!args.fbp}, fbc=${!!args.fbc})`,
    );
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
    const days = CYCLE_DAYS[billingPeriod] ?? 31;

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
        ...(isCardPayment ? { card_gateway: "asaas" } : {}),
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
        updated_at: new Date().toISOString(),
      };
      if (isCardPayment) updatePayload.card_gateway = "asaas";
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

    // Renovação → para por aqui (sem welcome novo).
    if (isRenewal) return;

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