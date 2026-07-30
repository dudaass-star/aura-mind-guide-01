// Edge function: asaas-pix-auto-status
// Consulta pública (por id de autorização) do status do consentimento de PIX
// Automático Bacen. Usada pelo checkout pra fazer polling na tela do QR e
// mostrar "aguardando autorização" → "autorizado" → "expirou".
// Só devolve status/expiração — nenhum dado pessoal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { authorizationId } = (await req.json()) as { authorizationId?: string };
    if (!authorizationId || !UUID_RE.test(authorizationId)) {
      return new Response(JSON.stringify({ error: "authorizationId inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase
      .from("asaas_pix_authorizations")
      .select("status, qr_expires_at, activated_at, plan, billing_period")
      .eq("asaas_authorization_id", authorizationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return new Response(JSON.stringify({ error: "Autorização não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Estado simplificado pro front: pending | active | expired
    const raw = (data.status || "PENDING").toUpperCase();
    const state =
      raw === "ACTIVE"
        ? "active"
        : ["REFUSED", "EXPIRED", "REJECTED", "CANCELLED"].includes(raw)
          ? "expired"
          : "pending";

    return new Response(
      JSON.stringify({
        state,
        status: raw,
        expiresAt: data.qr_expires_at,
        activatedAt: data.activated_at,
        plan: data.plan,
        billingPeriod: data.billing_period,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[asaas-pix-auto-status] Erro:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});