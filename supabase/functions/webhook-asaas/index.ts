// Webhook do Asaas: recebe eventos PAYMENT_* e atualiza status no banco
// Autenticação: header "asaas-access-token" deve bater com ASAAS_WEBHOOK_TOKEN
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    if (!event || !payment?.id) {
      console.warn("[webhook-asaas] Payload inválido:", body);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[webhook-asaas] Evento ${event} para payment ${payment.id}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    } else if (updated) {
      console.log(`[webhook-asaas] Pagamento ${payment.id} atualizado para ${newStatus}`);
    } else if (!subscriptionId) {
      console.warn(`[webhook-asaas] Pagamento ${payment.id} não encontrado no banco`);
    }

    // Concede / estende acesso no profile quando o pagamento é confirmado.
    if (isPaid && updated?.customer_email) {
      const cycleDays: Record<string, number> = {
        monthly: 31, quarterly: 93, semestral: 186, yearly: 372,
      };
      const days = cycleDays[updated.billing_period as string] ?? 31;

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, plan_expires_at")
        .eq("email", updated.customer_email)
        .maybeSingle();

      if (profile?.user_id) {
        const base = profile.plan_expires_at && new Date(profile.plan_expires_at) > new Date()
          ? new Date(profile.plan_expires_at)
          : new Date();
        const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        const { error: profErr } = await supabase
          .from("profiles")
          .update({
            plan: updated.plan,
            status: "active",
            plan_expires_at: newExpiry.toISOString(),
          })
          .eq("user_id", profile.user_id);
        if (profErr) {
          console.error("[webhook-asaas] Erro atualizando profile:", profErr);
        } else {
          console.log(`[webhook-asaas] Profile ${profile.user_id} estendido até ${newExpiry.toISOString()}`);
        }
      } else {
        console.warn(`[webhook-asaas] Profile não encontrado para ${updated.customer_email} (pagamento ok, criação manual?)`);
      }
    }

    // Eventos terminais de assinatura → marca status e expira acesso no fim do ciclo atual.
    if ((event === "SUBSCRIPTION_DELETED" || event === "PAYMENT_OVERDUE") && subscriptionId) {
      const { data: subRow } = await supabase
        .from("asaas_payments")
        .select("customer_email")
        .eq("asaas_subscription_id", subscriptionId)
        .limit(1)
        .maybeSingle();
      if (subRow?.customer_email) {
        await supabase
          .from("profiles")
          .update({ status: event === "SUBSCRIPTION_DELETED" ? "canceled" : "past_due" })
          .eq("email", subRow.customer_email);
        console.log(`[webhook-asaas] Profile ${subRow.customer_email} marcado como ${event}`);
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