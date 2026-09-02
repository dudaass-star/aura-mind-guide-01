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

    if (needsStripeInvoice || needsStripeSub) {
      try {
        // Coleta candidatos a Stripe customer em múltiplas fontes,
        // sem repetir IDs já vistos. Ordem de preferência:
        //   1. profiles.stripe_customer_id WHERE user_id = profile_user_id
        //   2. profiles.stripe_customer_id WHERE email = customer_email
        //   3. stripe.customers.list({ email: customer_email })
        //   4. stripe.customers.search por metadata.email
        const candidateCustomers: Array<{ id: string; source: string }> = [];
        const seen = new Set<string>();
        const pushCandidate = (id: string | null | undefined, source: string) => {
          if (id && !seen.has(id)) { seen.add(id); candidateCustomers.push({ id, source }); }
        };

        // Também tenta puxar subscription_id direto do profile (fonte mais
        // confiável que o Stripe quando ele está populado).
        let profileSubId: string | null = null;
        let profileInvoiceFallback: string | null = null;

        if (ticket.profile_user_id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("stripe_customer_id, stripe_subscription_id")
            .eq("user_id", ticket.profile_user_id)
            .maybeSingle();
          const p = prof as { stripe_customer_id?: string; stripe_subscription_id?: string } | null;
          pushCandidate(p?.stripe_customer_id, "profile_by_user_id");
          if (p?.stripe_subscription_id) profileSubId = p.stripe_subscription_id;
        }

        if (ticket.customer_email) {
          const { data: profByEmail } = await supabase
            .from("profiles")
            .select("stripe_customer_id, stripe_subscription_id")
            .ilike("email", ticket.customer_email)
            .limit(1)
            .maybeSingle();
          const p = profByEmail as { stripe_customer_id?: string; stripe_subscription_id?: string } | null;
          pushCandidate(p?.stripe_customer_id, "profile_by_email");
          if (!profileSubId && p?.stripe_subscription_id) profileSubId = p.stripe_subscription_id;

          try {
            const listed = await stripe.customers.list({ email: ticket.customer_email, limit: 3 });
            for (const c of listed.data) pushCandidate(c.id, "stripe_list_by_email");
          } catch (e) {
            log("stripe.customers.list failed", { error: String(e) });
          }

          try {
            const searched = await stripe.customers.search({
              query: `metadata['email']:'${ticket.customer_email.replace(/'/g, "")}'`,
              limit: 5,
            });
            for (const c of searched.data) pushCandidate(c.id, "stripe_search_metadata_email");
          } catch (e) {
            log("stripe.customers.search failed", { error: String(e) });
          }
        }

        log("Stripe auto-resolve candidates", {
          candidates: candidateCustomers,
          profile_sub_hint: profileSubId,
        });

        // Validação rápida do subscription_id vindo do profile: confirma que
        // ainda existe no Stripe e não está cancelado/incompleto.
        if (needsStripeSub && profileSubId) {
          try {
            const sub = await stripe.subscriptions.retrieve(profileSubId);
            if (sub && !["canceled", "incomplete_expired"].includes(sub.status)) {
              params.subscription_id = sub.id;
              log("Auto-resolved subscription_id via profile", { subscription_id: sub.id, status: sub.status });
            } else {
              log("Profile subscription_id stale, falling back", { id: profileSubId, status: sub?.status });
            }
          } catch (e) {
            log("Profile subscription_id retrieve failed", { id: profileSubId, error: String(e) });
          }
        }

        for (const cust of candidateCustomers) {
          if (needsStripeInvoice && !params.invoice_id) {
            try {
              const invs = await stripe.invoices.list({ customer: cust.id, status: "paid", limit: 1 });
              if (invs.data[0]) {
                params.invoice_id = invs.data[0].id;
                log("Auto-resolved invoice_id", { invoice_id: params.invoice_id, source: cust.source });
              }
              if (!params.invoice_id) profileInvoiceFallback = profileInvoiceFallback; // noop
            } catch (e) {
              log("invoices.list failed", { customer: cust.id, error: String(e) });
            }
          }
          if (needsStripeSub && !params.subscription_id) {
            try {
              // Prioriza active → trialing → past_due → mais recente (status all)
              for (const status of ["active", "trialing", "past_due", "all"] as const) {
                const listParams: Record<string, unknown> = { customer: cust.id, limit: 1 };
                listParams.status = status;
                const subs = await stripe.subscriptions.list(listParams as never);
                if (subs.data[0]) {
                  params.subscription_id = subs.data[0].id;
                  log("Auto-resolved subscription_id", {
                    subscription_id: params.subscription_id,
                    customer: cust.id,
                    source: cust.source,
                    matched_status: status,
                  });
                  break;
                }
              }
            } catch (e) {
              log("subscriptions.list failed", { customer: cust.id, error: String(e) });
            }
          }
          if ((!needsStripeInvoice || params.invoice_id) && (!needsStripeSub || params.subscription_id)) break;
        }
      } catch (e) {
        log("Stripe auto-resolve outer failed", { error: String(e) });
      }
    }

    if (needsAsaasPayment || needsAsaasSub) {
      try {
        // Resolve asaas_customer_id por profile_user_id OU email,
        // pra cobrir tickets cujo profile foi limpo pelo cleanup de inativos.
        let asaasCustomerId: string | undefined;
        if (ticket.profile_user_id) {
          const { data: prof } = await supabase
            .from("profiles").select("asaas_customer_id").eq("user_id", ticket.profile_user_id).maybeSingle();
          asaasCustomerId = (prof as { asaas_customer_id?: string } | null)?.asaas_customer_id;
        }
        if (!asaasCustomerId && ticket.customer_email) {
          const { data: profByEmail } = await supabase
            .from("profiles").select("asaas_customer_id").ilike("email", ticket.customer_email).limit(1).maybeSingle();
          asaasCustomerId = (profByEmail as { asaas_customer_id?: string } | null)?.asaas_customer_id;
        }
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
          // Portal usa login direto (Google + OTP por email) em /meu-espaco.
          // Não há mais token UUID na URL — link é público e estático.
          stripeResponse = { portal_url: "https://olaaura.com.br/meu-espaco" };
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
          // Idempotente: se já está cancelada no provedor, trata como sucesso.
          const current = await stripe.subscriptions.retrieve(subId);
          const sub = current.status === "canceled" ? current : await stripe.subscriptions.cancel(subId);
          stripeResponse = { id: sub.id, status: sub.status, already_canceled: current.status === "canceled" };
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

          // Idempotente: se a fatura já foi estornada (total ou no valor pedido), não tenta de novo.
          const existing = await stripe.refunds.list({ payment_intent: piId, limit: 100 });
          const refundedSoFar = existing.data
            .filter((r) => r.status !== "failed" && r.status !== "canceled")
            .reduce((sum, r) => sum + (r.amount || 0), 0);
          const wanted = params.amount_cents ? Number(params.amount_cents) : (invoice.amount_paid || 0);
          if (refundedSoFar > 0 && refundedSoFar >= wanted) {
            stripeResponse = {
              already_refunded: true,
              refunded_amount: refundedSoFar,
              refund_id: existing.data[0]?.id ?? null,
            };
            success = true;
            break;
          }

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