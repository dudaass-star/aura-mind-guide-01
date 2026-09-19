import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations, normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import { sendMessage } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GENERIC_MESSAGE = "Se o WhatsApp informado estiver ligado a um acesso válido, a Aura enviará o link por lá.";
const BLOCKED_STATUSES = new Set(["canceled", "inactive", "paused", "trial_expired"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function siteOrigin(req: Request): string {
  const configured = Deno.env.get("PORTAL_SITE_URL") || "https://olaaura.com.br";
  const origin = req.headers.get("origin");
  if (origin && /^(https?:\/\/localhost(?::\d+)?|https:\/\/([a-z0-9-]+\.)*olaaura\.com\.br)$/i.test(origin)) {
    return origin;
  }
  return configured.replace(/\/$/, "");
}

function hasValidAccess(profile: { status?: string | null; plan_expires_at?: string | null }) {
  if (BLOCKED_STATUSES.has(profile.status || "")) return false;
  if (profile.plan_expires_at && Date.parse(profile.plan_expires_at) <= Date.now()) return false;
  return ["active", "trial", "past_due", "payment_failed"].includes(profile.status || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "request");

    if (action === "consume") {
      const token = String(body?.token || "");
      if (token.length < 40) return json({ error: "invalid_or_expired" }, 400);

      const actionHash = await sha256(token);
      const { data: consumed, error: consumeError } = await admin
        .rpc("consume_portal_access_request", { _action_hash: actionHash });
      const request = consumed?.[0];
      if (consumeError || !request?.profile_id) return json({ error: "invalid_or_expired" }, 400);

      const { data: profile } = await admin
        .from("profiles")
        .select("id, user_id, email, status, plan_expires_at")
        .eq("id", request.profile_id)
        .maybeSingle();
      if (!profile?.email || !hasValidAccess(profile)) return json({ error: "access_unavailable" }, 403);

      const redirectTo = `${siteOrigin(req)}/meu-espaco`;
      let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email.trim().toLowerCase(),
        options: { redirectTo },
      });
      if (linkError && /not found|does not exist/i.test(linkError.message)) {
        const signup = await admin.auth.admin.generateLink({
          type: "signup",
          email: profile.email.trim().toLowerCase(),
          password: crypto.randomUUID() + crypto.randomUUID(),
          options: { redirectTo },
        });
        linkData = signup.data;
        linkError = signup.error;
      }
      const properties = linkData?.properties;
      if (linkError || !properties?.hashed_token) return json({ error: "access_unavailable" }, 500);

      return json({ token_hash: properties.hashed_token, type: properties.verification_type || "magiclink" });
    }

    const normalized = normalizeBrazilianPhone(String(body?.phone || ""));
    if (!/^55\d{10,11}$/.test(normalized)) return json({ ok: true, message: GENERIC_MESSAGE });
    const phoneHash = await sha256(normalized);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("portal_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("phone_hash", phoneHash)
      .gte("created_at", since);
    if ((count || 0) >= 3) {
      await admin.from("portal_access_requests").insert({ phone_hash: phoneHash, status: "rate_limited" });
      return json({ ok: true, message: GENERIC_MESSAGE });
    }

    const variations = Array.from(new Set([normalized, ...getPhoneVariations(normalized)])).filter(Boolean);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, user_id, name, phone, email, status, plan_expires_at")
      .in("phone", variations)
      .order("updated_at", { ascending: false })
      .limit(1);
    const profile = profiles?.[0];
    if (!profile?.email || !hasValidAccess(profile)) {
      await admin.from("portal_access_requests").insert({ phone_hash: phoneHash, profile_id: profile?.id || null, status: "failed" });
      return json({ ok: true, message: GENERIC_MESSAGE });
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const actionHash = await sha256(token);
    const emailHash = await sha256(profile.email.trim().toLowerCase());
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: accessRequest, error: insertError } = await admin
      .from("portal_access_requests")
      .insert({ profile_id: profile.id, phone_hash: phoneHash, email_hash: emailHash, action_hash: actionHash, expires_at: expiresAt })
      .select("id")
      .single();
    if (insertError || !accessRequest) throw insertError || new Error("request_create_failed");

    const link = `${siteOrigin(req)}/meu-espaco/acesso-whatsapp#token=${encodeURIComponent(token)}`;
    const firstName = profile.name?.trim().split(/\s+/)[0] || "";
    const text = `${firstName ? `Oi, ${firstName}!` : "Oi!"} Aqui está seu link seguro para entrar no Meu Espaço da Aura:\n\n${link}\n\nEle vale por 10 minutos e funciona uma única vez.`;
    // Este pedido nasce na própria tela. O envio livre só é feito se houver janela de atendimento aberta;
    // sem uma janela, falha fechado até existir um template de autenticação aprovado.
    const sent = await sendMessage(normalized, text, undefined, profile.user_id || profile.id);
    await admin.from("portal_access_requests").update({
      status: sent.success ? "sent" : "failed",
      sent_at: sent.success ? new Date().toISOString() : null,
      delivery_provider: sent.provider,
    }).eq("id", accessRequest.id);

    return json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("[portal-whatsapp-access]", error);
    return json({ ok: true, message: GENERIC_MESSAGE });
  }
});