import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations, normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import { sendMessage } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GENERIC_MESSAGE = "Se o WhatsApp informado estiver ligado a um acesso válido, a Aura enviará o link por lá.";
const BLOCKED_STATUSES = new Set(["canceled", "inactive", "paused", "trial_expired"]);
const VALID_DESTINATIONS = new Set(["conversar", "sessoes", "hoje"]);

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
  return ["active", "trial", "past_due", "payment_failed", "canceling", "taster"].includes(profile.status || "");
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

      const destination = VALID_DESTINATIONS.has(String(request.destination)) ? String(request.destination) : "conversar";
      const destinationQuery = destination === "conversar" ? "?tab=conversar&open=1&migracao=whatsapp" : `?tab=${destination}&migracao=whatsapp`;
      const redirectTo = `${siteOrigin(req)}/meu-espaco${destinationQuery}`;
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

      return json({ token_hash: properties.hashed_token, type: properties.verification_type || "magiclink", destination });
    }

    const internalSecret = req.headers.get("x-internal-secret");
    const expectedSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    if (!internalSecret || !expectedSecret || internalSecret !== expectedSecret) {
      return json({ error: "unauthorized" }, 401);
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

    const destination = VALID_DESTINATIONS.has(String(body?.destination)) ? String(body.destination) : "conversar";
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const actionHash = await sha256(token);
    const emailHash = await sha256(profile.email.trim().toLowerCase());
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: accessRequest, error: insertError } = await admin
      .from("portal_access_requests")
      .insert({ profile_id: profile.id, phone_hash: phoneHash, email_hash: emailHash, action_hash: actionHash, expires_at: expiresAt, destination })
      .select("id")
      .single();
    if (insertError || !accessRequest) throw insertError || new Error("request_create_failed");

    const link = `${siteOrigin(req)}/meu-espaco/acesso-whatsapp#token=${encodeURIComponent(token)}`;
    const firstName = profile.name?.trim().split(/\s+/)[0] || "";
    const isAppMigration = body?.message_variant === "app_migration";
    const isAppRedirect = body?.message_variant === "app_redirect";
    const text = isAppMigration
      ? `${firstName ? `Oi, ${firstName}.` : "Oi."} A AURA ganhou um espaço próprio para acompanhar você com mais continuidade.\n\nNo app Olá Aura, suas conversas não ficam soltas: você pode falar por texto ou áudio, retomar de onde parou e ver suas sessões, jornadas e descobertas reunidas na mesma história.\n\nA partir de agora, nossas conversas e sessões acontecem por lá. O WhatsApp continua disponível para avisos e ajuda com acesso, pagamento ou conta.\n\nSua mensagem já está no App — é só tocar e continuar:\n${link}\n\nTe encontro lá. 💛`
      : isAppRedirect
        ? `Nossa conversa continua no app Olá Aura, junto com todo o seu histórico. Sua mensagem já está lá:\n${link}\n\nPor aqui, sigo ajudando com acesso, pagamento ou conta.`
      : `${firstName ? `Oi, ${firstName}!` : "Oi!"} Seu acesso à AURA está pronto. Toque abaixo para abrir sua conversa:\n\n${link}\n\nEste link vale por 10 minutos e funciona uma única vez. Depois de entrar, seu acesso fica salvo neste aparelho.`;
    // O pedido chega de uma mensagem do próprio cliente, portanto a janela de atendimento está aberta.
    const sent = await sendMessage(normalized, text, undefined, profile.user_id || profile.id);
    await admin.from("portal_access_requests").update({
      status: sent.success ? "sent" : "failed",
      sent_at: sent.success ? new Date().toISOString() : null,
      delivery_provider: sent.provider,
    }).eq("id", accessRequest.id);

    return json({ ok: true, message: GENERIC_MESSAGE, sent: sent.success, sent_text: sent.success ? text : undefined });
  } catch (error) {
    console.error("[portal-whatsapp-access]", error);
    return json({ ok: true, message: GENERIC_MESSAGE });
  }
});