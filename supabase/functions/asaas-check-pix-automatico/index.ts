// Edge function: asaas-check-pix-automatico
// Diagnóstico read-only da conta Asaas pra confirmar se PIX Automático Bacen
// (/v3/pix/automatic/authorizations) está habilitado. NÃO altera nada — só
// chama GETs na Asaas e SELECTs no Supabase.
//
// Proteção: header `x-internal-secret` precisa bater com INTERNAL_WEBHOOK_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const INTERNAL_SECRET = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || provided !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
  const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
  if (!ASAAS_API_KEY) {
    return new Response(JSON.stringify({ error: "ASAAS_API_KEY ausente" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ASAAS_BASE_URL =
    ASAAS_ENV === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";

  const asaasGet = async (path: string) => {
    try {
      const resp = await fetch(`${ASAAS_BASE_URL}${path}`, {
        method: "GET",
        headers: {
          access_token: ASAAS_API_KEY,
          "Content-Type": "application/json",
          "User-Agent": "Aura/1.0",
        },
      });
      const text = await resp.text();
      let json: unknown = null;
      try { json = JSON.parse(text); } catch { json = text; }
      return { status: resp.status, ok: resp.ok, body: json };
    } catch (e) {
      return { status: 0, ok: false, body: { error: e instanceof Error ? e.message : String(e) } };
    }
  };

  // 1. PIX Automático Bacen
  const pixAuto = await asaasGet("/pix/automatic/authorizations?limit=1");
  // Algumas contas expõem o recurso em /pix/recurring/authorizations — testa fallback se 404
  let pixAutoAlt: { status: number; ok: boolean; body: unknown } | null = null;
  if (pixAuto.status === 404) {
    pixAutoAlt = await asaasGet("/pix/recurring/authorizations?limit=1");
  }

  // 2. Conta
  const myAccount = await asaasGet("/myAccount");

  // 3. Webhooks
  const webhooks = await asaasGet("/webhooks?limit=50");

  // 4. Subscriptions legadas no nosso DB
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: legacyRows, error: legacyErr } = await supabase
    .from("asaas_payments")
    .select("asaas_subscription_id, status, billing_type, billing_period")
    .not("asaas_subscription_id", "is", null)
    .in("status", ["CONFIRMED", "RECEIVED", "PENDING", "ACTIVE", "OVERDUE"]);

  const legacy = {
    error: legacyErr?.message ?? null,
    totalRows: legacyRows?.length ?? 0,
    uniqueSubscriptions: new Set((legacyRows ?? []).map((r) => r.asaas_subscription_id)).size,
    byBillingType: (legacyRows ?? []).reduce<Record<string, number>>((acc, r) => {
      const k = r.billing_type ?? "unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    byBillingPeriod: (legacyRows ?? []).reduce<Record<string, number>>((acc, r) => {
      const k = r.billing_period ?? "unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const webhooksList = Array.isArray((webhooks.body as any)?.data)
    ? (webhooks.body as any).data.map((w: any) => ({
        name: w.name,
        url: w.url,
        enabled: w.enabled,
        events: w.events,
        hasPixAutomatico: Array.isArray(w.events)
          ? w.events.some((e: string) => /PIX_AUTOMATIC|PIX_RECURRING|AUTHORIZATION/i.test(e))
          : false,
      }))
    : webhooks.body;

  const report = {
    env: ASAAS_ENV,
    baseUrl: ASAAS_BASE_URL,
    pixAutomatico: {
      endpoint: "/pix/automatic/authorizations",
      status: pixAuto.status,
      available: pixAuto.ok,
      bodyPreview: pixAuto.body,
    },
    pixAutomaticoAlt: pixAutoAlt
      ? {
          endpoint: "/pix/recurring/authorizations",
          status: pixAutoAlt.status,
          available: pixAutoAlt.ok,
          bodyPreview: pixAutoAlt.body,
        }
      : null,
    account: {
      status: myAccount.status,
      body: myAccount.body,
    },
    webhooks: {
      status: webhooks.status,
      list: webhooksList,
    },
    legacySubscriptions: legacy,
  };

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});