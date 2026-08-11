// Edge function: asaas-health-check
// Sonda o trilho de PIX recorrente e grava o resultado em
// system_config.pix_rail_status. O checkout lê esse registro (SELECT rápido, sem
// cold start de função) pra decidir se mostra ou esconde o PIX.
//
// Motivo: com a conta Asaas bloqueada (401 nos endpoints operacionais), todo
// cliente que escolhia PIX gerava um QR que nunca nascia — venda perdida
// silenciosa. Melhor não oferecer do que oferecer quebrado.
//
// Roda via cron a cada 15 min e também pode ser chamada manualmente com
// x-internal-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { interFetch } from "../_shared/inter-pix.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, lovable-context",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type RailProbe = {
  gateway: string;
  healthy: boolean;
  httpStatus: number;
  detail: string;
};

async function probeAsaas(): Promise<RailProbe> {
  const key = Deno.env.get("ASAAS_API_KEY");
  const env = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
  const base = env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

  if (!key) return { gateway: "asaas", healthy: false, httpStatus: 0, detail: "ASAAS_API_KEY ausente" };

  try {
    // /customers é o endpoint operacional mais barato. Quando a conta está
    // restrita, ele devolve 401 com body vazio — exatamente o sintoma atual.
    const resp = await fetch(`${base}/customers?limit=1`, {
      method: "GET",
      headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "Aura/1.0" },
    });
    const text = await resp.text();
    return {
      gateway: "asaas",
      healthy: resp.ok,
      httpStatus: resp.status,
      detail: resp.ok ? "operacional" : `HTTP ${resp.status}: ${text.slice(0, 200) || "(body vazio)"}`,
    };
  } catch (e) {
    return {
      gateway: "asaas",
      healthy: false,
      httpStatus: 0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function probeWoovi(): Promise<RailProbe> {
  const appId = Deno.env.get("WOOVI_APP_ID");
  if (!appId) {
    return { gateway: "woovi", healthy: false, httpStatus: 0, detail: "WOOVI_APP_ID ausente (conta em análise cadastral)" };
  }
  try {
    const resp = await fetch("https://api.woovi.com/api/v1/charge?limit=1", {
      method: "GET",
      headers: { Authorization: appId, "Content-Type": "application/json" },
    });
    const text = await resp.text();
    return {
      gateway: "woovi",
      healthy: resp.ok,
      httpStatus: resp.status,
      detail: resp.ok ? "operacional" : `HTTP ${resp.status}: ${text.slice(0, 200) || "(body vazio)"}`,
    };
  } catch (e) {
    return { gateway: "woovi", healthy: false, httpStatus: 0, detail: e instanceof Error ? e.message : String(e) };
  }
}

// Sonda do Banco Inter: token OAuth com mTLS + leitura de recorrências.
// `GET /pix/v2/rec` é o endpoint mais barato que exige escopo de Pix Automático,
// então cobre de uma vez: certificado válido, credencial válida e escopo ativo.
async function probeInter(): Promise<RailProbe> {
  const missing = ["INTER_CLIENT_ID", "INTER_CLIENT_SECRET", "INTER_CERT_PEM", "INTER_KEY_PEM"]
    .filter((k) => !Deno.env.get(k));
  if (missing.length) {
    return { gateway: "inter", healthy: false, httpStatus: 0, detail: `secrets ausentes: ${missing.join(", ")}` };
  }
  try {
    const inicio = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fim = new Date().toISOString();
    const r = await interFetch(`/pix/v2/rec?inicio=${inicio}&fim=${fim}`);
    return {
      gateway: "inter",
      healthy: r.ok,
      httpStatus: r.status,
      detail: r.ok ? "operacional" : `HTTP ${r.status}: ${r.raw.slice(0, 200) || "(body vazio)"}`,
    };
  } catch (e) {
    // Erro de handshake aparece aqui: certificado vencido/trocado derruba TODO
    // o trilho de uma vez, por isso o detalhe precisa chegar cru no admin.
    return { gateway: "inter", healthy: false, httpStatus: 0, detail: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const isCron = req.headers.get("Lovable-Context") === "cron";
  const internal = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!isCron && (!internal || provided !== internal)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Trilho configurado. 'off' = PIX desligado à mão, sem sonda.
  const { data: cfg } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", "pix_gateway")
    .maybeSingle();

  let gateway = "asaas";
  if (cfg?.value !== undefined && cfg?.value !== null) {
    let v: unknown = cfg.value;
    if (typeof v === "string") {
      try { v = JSON.parse(v); } catch { /* valor cru */ }
    }
    if (typeof v === "string") gateway = v;
  }

  let probe: RailProbe;
  if (gateway === "off") {
    probe = { gateway: "off", healthy: false, httpStatus: 0, detail: "PIX desligado manualmente no admin" };
  } else if (gateway === "woovi") {
    probe = await probeWoovi();
  } else if (gateway === "inter") {
    probe = await probeInter();
  } else {
    probe = await probeAsaas();
  }

  const status = {
    gateway: probe.gateway,
    healthy: probe.healthy,
    httpStatus: probe.httpStatus,
    detail: probe.detail,
    checkedAt: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("system_config")
    .upsert(
      { key: "pix_rail_status", value: JSON.stringify(status), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (upsertErr) console.error("[asaas-health-check] falha ao gravar pix_rail_status:", upsertErr.message);
  console.log(`[asaas-health-check] trilho=${status.gateway} healthy=${status.healthy} (${status.detail})`);

  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
