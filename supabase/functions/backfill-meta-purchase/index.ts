// Backfill one-shot: reenvia Meta CAPI Purchase para compras Stripe das últimas N horas.
// Idempotente — Meta deduplica por event_id (= session.id). Pula renovações/upgrades/returning
// (regra: Purchase só na 1ª compra). Asaas também coberto se houver paid_at recente.
// Protegido por header x-admin-secret == INTERNAL_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { resolveProfile } from "../_shared/profile-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAN_NAMES: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    if (!adminSecret || req.headers.get("x-admin-secret") !== adminSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const hours = Math.min(Math.max(Number(body.hours) || 48, 1), 168);
    const dryRun = !!body.dryRun;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const sinceTs = Math.floor(Date.now() / 1000) - hours * 3600;
    const report: any[] = [];
    const counters = { total: 0, sent: 0, skipped_renewal_or_upgrade: 0, skipped_no_email: 0, skipped_unpaid: 0, errors: 0 };

    // ============= STRIPE =============
    // Lista checkout sessions completed/paid das últimas N horas.
    let starting_after: string | undefined = undefined;
    const sessions: Stripe.Checkout.Session[] = [];
    for (let i = 0; i < 10; i++) {
      const page: Stripe.ApiList<Stripe.Checkout.Session> = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: sinceTs },
        ...(starting_after ? { starting_after } : {}),
      });
      sessions.push(...page.data);
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
    }

    for (const session of sessions) {
      counters.total++;
      const sid = session.id;
      // Só processa sessions que efetivamente pagaram ou iniciaram trial com cobrança
      const isPaidOrTrialing =
        session.status === "complete" &&
        (session.payment_status === "paid" || session.payment_status === "no_payment_required");
      if (!isPaidOrTrialing) {
        counters.skipped_unpaid++;
        report.push({ sid, source: "stripe", skipped: "not_paid", status: session.status, payment_status: session.payment_status });
        continue;
      }

      const customerEmail =
        (session.customer_details?.email as string | undefined) ||
        (session.customer_email as string | undefined) ||
        undefined;
      const customerPhone =
        (session.customer_details?.phone as string | undefined) ||
        (session.metadata?.phone as string | undefined) ||
        undefined;
      const customerName =
        (session.customer_details?.name as string | undefined) ||
        (session.metadata?.name as string | undefined) ||
        "";
      if (!customerEmail) {
        counters.skipped_no_email++;
        report.push({ sid, source: "stripe", skipped: "no_email" });
        continue;
      }

      // 1ª compra? Resolve profile pelo email/phone, mesma lógica do stripe-webhook.
      const resolved = await resolveProfile(supabase, customerPhone || "", customerEmail);
      const existing = resolved.profile;
      const isReturning = existing?.status === "canceled";
      // No webhook real: existingProfile criado pelo próprio webhook (idempotência por session.id).
      // Como o webhook do mesmo session.id já rodou (compra real), existingProfile vai existir agora.
      // Backfill: tratamos como 1ª compra quando o profile foi criado neste mesmo ciclo
      // (sem outro pagamento Stripe prévio). Heurística simples: se profile.created_at >= session.created.
      let isFirst = false;
      if (!existing) {
        isFirst = true;
      } else {
        const profCreatedTs = existing.created_at ? Math.floor(new Date(existing.created_at).getTime() / 1000) : 0;
        const sessCreatedTs = session.created || 0;
        // tolerância 2 min: profile criado <=2min antes do checkout = mesmo ciclo
        isFirst = profCreatedTs >= sessCreatedTs - 120;
      }
      if (!isFirst || isReturning) {
        counters.skipped_renewal_or_upgrade++;
        report.push({ sid, source: "stripe", email: customerEmail, skipped: isReturning ? "returning" : "existing_profile" });
        continue;
      }

      const plan = (session.metadata?.plan as string) || "essencial";
      const planName = PLAN_NAMES[plan] || plan;
      const value = (session.amount_total || 0) / 100;
      const fbp = session.metadata?.fbp as string | undefined;
      const fbc = session.metadata?.fbc as string | undefined;
      const isTrial = (session.metadata?.is_trial as string) === "true" || !!session.subscription;
      const eventId = isTrial ? `${sid}_purchase` : sid;
      const contentName = isTrial ? `Trial ${planName}` : `Plano ${planName}`;

      if (dryRun) {
        report.push({ sid, source: "stripe", email: customerEmail, value, would_send: true, eventId, fbp: !!fbp, fbc: !!fbc });
        continue;
      }

      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            event_name: "Purchase",
            event_id: eventId,
            event_source_url: "https://olaaura.com.br/obrigado",
            source: "backfill-manual",
            is_first_purchase: true,
            user_data: {
              email: customerEmail,
              phone: customerPhone || undefined,
              first_name: (customerName || "").split(" ")[0] || undefined,
              ...(fbp && { fbp }),
              ...(fbc && { fbc }),
            },
            custom_data: {
              value,
              currency: "BRL",
              content_name: contentName,
              content_category: plan,
            },
          }),
        });
        const out = await r.json().catch(() => ({}));
        counters.sent++;
        report.push({ sid, source: "stripe", email: customerEmail, value, eventId, status: r.status, fbp: !!fbp, fbc: !!fbc, capi: out });
      } catch (e) {
        counters.errors++;
        report.push({ sid, source: "stripe", email: customerEmail, error: String(e) });
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    // ============= ASAAS =============
    const sinceIso = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data: asaasRows } = await supabase
      .from("asaas_payments")
      .select("*")
      .in("status", ["CONFIRMED", "RECEIVED"])
      .gte("paid_at", sinceIso)
      .order("paid_at", { ascending: false });

    for (const p of asaasRows || []) {
      counters.total++;
      const pid = p.asaas_payment_id;
      if (!p.customer_email) {
        counters.skipped_no_email++;
        report.push({ pid, source: "asaas", skipped: "no_email" });
        continue;
      }
      // 1ª compra da subscription?
      let isFirst = true;
      if (p.asaas_subscription_id) {
        const { data: prior } = await supabase
          .from("asaas_payments")
          .select("id, paid_at")
          .eq("asaas_subscription_id", p.asaas_subscription_id)
          .in("status", ["CONFIRMED", "RECEIVED"])
          .neq("asaas_payment_id", pid)
          .lt("paid_at", p.paid_at);
        if (prior && prior.length > 0) isFirst = false;
      }
      if (!isFirst) {
        counters.skipped_renewal_or_upgrade++;
        report.push({ pid, source: "asaas", email: p.customer_email, skipped: "renewal" });
        continue;
      }

      const value = Number(p.amount_cents || 0) / 100;
      const planName = PLAN_NAMES[p.plan] || p.plan;

      if (dryRun) {
        report.push({ pid, source: "asaas", email: p.customer_email, value, would_send: true });
        continue;
      }

      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/meta-capi`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            event_name: "Purchase",
            event_id: pid,
            event_source_url: "https://olaaura.com.br/obrigado",
            source: "backfill-manual",
            is_first_purchase: true,
            user_data: {
              email: p.customer_email,
              phone: p.customer_phone || undefined,
              first_name: (p.customer_name || "").split(" ")[0] || undefined,
              ...(p.fbp && { fbp: p.fbp }),
              ...(p.fbc && { fbc: p.fbc }),
            },
            custom_data: {
              value,
              currency: "BRL",
              content_name: `Plano ${planName}`,
              content_category: p.plan,
            },
          }),
        });
        const out = await r.json().catch(() => ({}));
        counters.sent++;
        report.push({ pid, source: "asaas", email: p.customer_email, value, status: r.status, capi: out });
      } catch (e) {
        counters.errors++;
        report.push({ pid, source: "asaas", email: p.customer_email, error: String(e) });
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    return new Response(JSON.stringify({ hours, dryRun, counters, report }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[backfill-meta-purchase] erro:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});