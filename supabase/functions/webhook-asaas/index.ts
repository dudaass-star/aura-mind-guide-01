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

    const { data: updated, error: updateErr } = await supabase
      .from("asaas_payments")
      .update(updatePayload)
      .eq("asaas_payment_id", payment.id)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.error("[webhook-asaas] Erro atualizando pagamento:", updateErr);
    } else if (!updated) {
      console.warn(`[webhook-asaas] Pagamento ${payment.id} não encontrado no banco`);
    } else {
      console.log(`[webhook-asaas] Pagamento ${payment.id} atualizado para ${newStatus}`);
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