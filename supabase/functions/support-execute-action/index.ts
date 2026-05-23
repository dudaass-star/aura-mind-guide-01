import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[SUPPORT-EXECUTE-ACTION] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) throw new Error("Unauthenticated");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Not an admin");

    const { ticket_id, action } = await req.json();
    if (!ticket_id || !action?.type) throw new Error("ticket_id and action.type required");

    const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", ticket_id).single();
    if (!ticket) throw new Error("Ticket not found");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Asaas (PIX) config
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    const asaasEnv = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
    const asaasBase = asaasEnv === "production" || asaasEnv === "prod"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

    let stripeResponse: unknown = null;
    let success = false;
    let errorMessage: string | null = null;
    const params = action.params || {};

    // ============ AUTO-RESOLVE de IDs faltantes ============
    // A IA do support-agent às vezes sugere a ação certa mas esquece de preencher
    // o ID concreto. Em vez de falhar, o backend resolve automaticamente a partir
    // do email do ticket (Stripe customer + última invoice/sub paga, ou Asaas pelo profile).
    const needsStripeInvoice = action.type === "refund_invoice" && !params.invoice_id;
    const needsStripeSub = ["cancel_subscription", "pause_subscription", "change_plan"].includes(action.type) && !params.subscription_id;
    const needsAsaasPayment = action.type === "refund_asaas_payment" && !params.asaas_payment_id;
    const needsAsaasSub = action.type === "cancel_asaas_subscription" && !params.asaas_subscription_id;

    if ((needsStripeInvoice || needsStripeSub) && ticket.customer_email) {
      try {
        const customers = await stripe.customers.list({ email: ticket.customer_email, limit: 1 });
        const cust = customers.data[0];
        if (cust) {
          if (needsStripeInvoice) {
            const invs = await stripe.invoices.list({ customer: cust.id, status: "paid", limit: 1 });
            if (invs.data[0]) {
              params.invoice_id = invs.data[0].id;
              log("Auto-resolved invoice_id", { invoice_id: params.invoice_id });
            }
          }
          if (needsStripeSub) {
            // Prioriza ativa, senão pega a mais recente
            let subs = await stripe.subscriptions.list({ customer: cust.id, status: "active", limit: 1 });
            if (subs.data.length === 0) {
              subs = await stripe.subscriptions.list({ customer: cust.id, status: "all", limit: 1 });
            }
            if (subs.data[0]) {
              params.subscription_id = subs.data[0].id;
              log("Auto-resolved subscription_id", { subscription_id: params.subscription_id });
            }
          }
        }
      } catch (e) {
        log("Stripe auto-resolve failed", { error: String(e) });
      }
    }

    if ((needsAsaasPayment || needsAsaasSub) && ticket.profile_user_id) {
      try {
        const { data: prof } = await supabase
          .from("profiles").select("asaas_customer_id").eq("user_id", ticket.profile_user_id).maybeSingle();
        const asaasCustomerId = (prof as { asaas_customer_id?: string } | null)?.asaas_customer_id;
        const pq = supabase
          .from("asaas_payments")
          .select("asaas_payment_id, asaas_subscription_id, status")
          .order("created_at", { ascending: false })
          .limit(5);
        const { data: pays } = asaasCustomerId
          ? await pq.eq("asaas_customer_id", asaasCustomerId)
          : await pq.eq("customer_email", ticket.customer_email);
        if (needsAsaasPayment) {
          const paid = (pays || []).find((p: { status: string }) => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status));
          if (paid) {
            params.asaas_payment_id = (paid as { asaas_payment_id: string }).asaas_payment_id;
            log("Auto-resolved asaas_payment_id", { id: params.asaas_payment_id });
          }
        }
        if (needsAsaasSub) {
          const withSub = (pays || []).find((p: { asaas_subscription_id: string | null }) => p.asaas_subscription_id);
          if (withSub) {
            params.asaas_subscription_id = (withSub as { asaas_subscription_id: string }).asaas_subscription_id;
            log("Auto-resolved asaas_subscription_id", { id: params.asaas_subscription_id });
          }
        }
      } catch (e) {
        log("Asaas auto-resolve failed", { error: String(e) });
      }
    }

    try {
      switch (action.type) {
        case "none":
          success = true;
          stripeResponse = { skipped: true };
          break;

        case "send_portal_link": {
          if (!ticket.profile_user_id) throw new Error("No profile_user_id on ticket");
          const { data: existing } = await supabase
            .from("user_portal_tokens").select("token").eq("user_id", ticket.profile_user_id).maybeSingle();
          let token = existing?.token;
          if (!token) {
            const { data: created } = await supabase.from("user_portal_tokens")
              .insert({ user_id: ticket.profile_user_id }).select("token").single();
            token = created?.token;
          }
          stripeResponse = { portal_url: `https://olaaura.com.br/meu-espaco` };
          success = true;
          break;
        }

        case "send_stripe_billing_portal": {
          const customers = await stripe.customers.list({ email: ticket.customer_email, limit: 1 });
          if (!customers.data[0]) throw new Error("Customer not found in Stripe");
          const session = await stripe.billingPortal.sessions.create({
            customer: customers.data[0].id,
            return_url: "https://olaaura.com.br/meu-espaco",
          });
          stripeResponse = { billing_portal_url: session.url };
          success = true;
          break;
        }

        case "cancel_subscription": {
          const subId = params.subscription_id;
          if (!subId) throw new Error("subscription_id required");
          const sub = await stripe.subscriptions.cancel(subId);
          stripeResponse = { id: sub.id, status: sub.status };
          if (ticket.profile_user_id) {
            await supabase.from("profiles").update({ status: "canceled" }).eq("user_id", ticket.profile_user_id);
          }
          success = true;
          break;
        }

        case "pause_subscription": {
          const subId = params.subscription_id;
          const days = Number(params.pause_days || 30);
          if (!subId) throw new Error("subscription_id required");
          const resumeAt = Math.floor(Date.now() / 1000) + days * 86400;
          const sub = await stripe.subscriptions.update(subId, {
            pause_collection: { behavior: "void", resumes_at: resumeAt },
          });
          stripeResponse = { id: sub.id, paused_until: new Date(resumeAt * 1000).toISOString() };
          if (ticket.profile_user_id) {
            await supabase.from("profiles").update({
              sessions_paused_until: new Date(resumeAt * 1000).toISOString().slice(0, 10),
            }).eq("user_id", ticket.profile_user_id);
          }
          success = true;
          break;
        }

        case "refund_invoice": {
          const invoiceId = params.invoice_id;
          if (!invoiceId) throw new Error("invoice_id required");
          const invoice = await stripe.invoices.retrieve(invoiceId);
          const piId = typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.payment_intent?.id;
          if (!piId) throw new Error("No payment_intent on invoice");
          const refund = await stripe.refunds.create({
            payment_intent: piId,
            ...(params.amount_cents ? { amount: Number(params.amount_cents) } : {}),
          });
          stripeResponse = { id: refund.id, amount: refund.amount, status: refund.status };
          success = true;
          break;
        }

        case "retry_payment": {
          const invoiceId = params.invoice_id;
          if (!invoiceId) throw new Error("invoice_id required");
          const invoice = await stripe.invoices.pay(invoiceId);
          stripeResponse = { id: invoice.id, status: invoice.status };
          success = true;
          break;
        }

        case "change_plan": {
          const subId = params.subscription_id;
          const newPlan = params.new_plan;
          const billing = params.billing || "monthly";
          if (!subId || !newPlan) throw new Error("subscription_id and new_plan required");
          const priceMap: Record<string, string | undefined> = {
            essencial_monthly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_MONTHLY"),
            essencial_yearly: Deno.env.get("STRIPE_PRICE_ESSENCIAL_YEARLY"),
            direcao_monthly: Deno.env.get("STRIPE_PRICE_DIRECAO_MONTHLY"),
            direcao_yearly: Deno.env.get("STRIPE_PRICE_DIRECAO_YEARLY"),
            transformacao_monthly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_MONTHLY"),
            transformacao_yearly: Deno.env.get("STRIPE_PRICE_TRANSFORMACAO_YEARLY"),
          };
          const newPrice = priceMap[`${newPlan}_${billing}`];
          if (!newPrice) throw new Error(`Price not found for ${newPlan}_${billing}`);
          const sub = await stripe.subscriptions.retrieve(subId);
          const updated = await stripe.subscriptions.update(subId, {
            items: [{ id: sub.items.data[0].id, price: newPrice }],
            proration_behavior: "create_prorations",
          });
          stripeResponse = { id: updated.id, new_price: newPrice };
          if (ticket.profile_user_id) {
            await supabase.from("profiles").update({ plan: newPlan }).eq("user_id", ticket.profile_user_id);
          }
          success = true;
          break;
        }

        case "refund_asaas_payment": {
          const paymentId = params.asaas_payment_id;
          if (!paymentId) throw new Error("asaas_payment_id required");
          if (!asaasKey) throw new Error("ASAAS_API_KEY not configured");
          const body: Record<string, unknown> = {};
          if (params.amount_cents) body.value = Number(params.amount_cents) / 100;
          if (params.description) body.description = String(params.description);
          const resp = await fetch(`${asaasBase}/payments/${paymentId}/refund`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "access_token": asaasKey,
            },
            body: JSON.stringify(body),
          });
          const json = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(`Asaas refund failed (${resp.status}): ${JSON.stringify(json)}`);
          stripeResponse = json;
          success = true;
          break;
        }

        case "cancel_asaas_subscription": {
          const subId = params.asaas_subscription_id;
          if (!subId) throw new Error("asaas_subscription_id required");
          if (!asaasKey) throw new Error("ASAAS_API_KEY not configured");
          const resp = await fetch(`${asaasBase}/subscriptions/${subId}`, {
            method: "DELETE",
            headers: { "access_token": asaasKey },
          });
          const json = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(`Asaas cancel failed (${resp.status}): ${JSON.stringify(json)}`);
          stripeResponse = json;
          if (ticket.profile_user_id) {
            await supabase.from("profiles").update({ status: "canceled" }).eq("user_id", ticket.profile_user_id);
          }
          success = true;
          break;
        }

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (actionErr) {
      errorMessage = actionErr instanceof Error ? actionErr.message : String(actionErr);
      success = false;
    }

    await supabase.from("support_ticket_actions").insert({
      ticket_id,
      action_type: action.type,
      payload: params,
      executed_by: userData.user.id,
      stripe_response: stripeResponse as object | null,
      success,
      error_message: errorMessage,
    });

    return new Response(JSON.stringify({ ok: success, response: stripeResponse, error: errorMessage }), {
      status: success ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Fatal error", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});