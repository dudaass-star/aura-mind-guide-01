import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { hashCheckoutAccessToken, isCheckoutAccessToken } from "../_shared/checkout-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function allowedOrigin(req: Request): string {
  const configured = (Deno.env.get("PORTAL_SITE_URL") || "https://olaaura.com.br").replace(/\/$/, "");
  const origin = req.headers.get("origin") || "";
  return /^(https?:\/\/localhost(?::\d+)?|https:\/\/([a-z0-9-]+\.)*(olaaura\.com\.br|lovable\.app))$/i.test(origin)
    ? origin
    : configured;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "");
    if (!isCheckoutAccessToken(token)) return json({ error: "invalid_or_expired" }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Configuração interna incompleta");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const tokenHash = await hashCheckoutAccessToken(token);
    const { data: claims } = await admin.from("checkout_access_claims")
      .select("id,status,profile_id,name,plan,billing,expires_at")
      .eq("token_hash", tokenHash)
      .order("created_at", { ascending: false });
    const validClaims = (claims || []).filter((item) => Date.parse(item.expires_at) > Date.now());
    if (validClaims.length === 0) return json({ error: "invalid_or_expired" }, 400);
    const paidClaim = validClaims.find((item) => item.status === "paid");
    const consumedClaim = validClaims.find((item) => item.status === "consumed");
    const claim = paidClaim || consumedClaim || validClaims[0];

    if (body?.action === "status") {
      return json({ status: claim.status, paid: Boolean(paidClaim || consumedClaim), name: claim.name, plan: claim.plan, billing: claim.billing });
    }
    if (body?.action !== "consume") return json({ error: "invalid_action" }, 400);
    if (claim.status === "consumed") return json({ error: "already_used" }, 409);
    if (claim.status !== "paid" || !claim.profile_id) return json({ error: "payment_pending" }, 409);

    const { data: profile } = await admin.from("profiles").select("user_id,email").eq("id", claim.profile_id).maybeSingle();
    if (!profile?.email) return json({ error: "access_unavailable" }, 403);
    const { data: entitled } = await admin.rpc("has_portal_entitlement", { _user_id: profile.user_id });
    if (!entitled) return json({ error: "access_unavailable" }, 403);

    const redirectTo = `${allowedOrigin(req)}/meu-espaco`;
    let link = await admin.auth.admin.generateLink({ type: "magiclink", email: profile.email.trim().toLowerCase(), options: { redirectTo } });
    if (link.error && /not found|does not exist/i.test(link.error.message)) {
      link = await admin.auth.admin.generateLink({ type: "signup", email: profile.email.trim().toLowerCase(), password: crypto.randomUUID() + crypto.randomUUID(), options: { redirectTo } });
    }
    const properties = link.data?.properties;
    if (link.error || !properties?.hashed_token) return json({ error: "access_unavailable" }, 500);

    const { data: consumed } = await admin.from("checkout_access_claims").update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("id", claim.id).eq("status", "paid").select("id").maybeSingle();
    if (!consumed) return json({ error: "already_used" }, 409);
    return json({ token_hash: properties.hashed_token, type: properties.verification_type || "magiclink" });
  } catch (error) {
    console.error("[checkout-app-access]", error);
    return json({ error: "temporary_error" }, 500);
  }
});