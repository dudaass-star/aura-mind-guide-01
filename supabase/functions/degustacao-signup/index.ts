// Entrada da campanha "Experimente grátis": cria o perfil de degustação
// (1 sessão cortesia + 1 oração + 1 meditação), sem plano e sem cobrança, e
// devolve um token de entrada única para o App abrir já autenticado.
//
// Segurança: o token só é devolvido para cadastro NOVO. Contato que já existe
// nunca recebe sessão por esta rota (evita tomar conta alheia) — vai para a
// entrada normal do App.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBrazilianPhone, getPhoneVariations } from "../_shared/zapi-client.ts";
import { sendWelcomeWhatsApp } from "../_shared/welcome-delivery.ts";
import { saveMetaIdentity } from "../_shared/meta-identity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = normalizeBrazilianPhone(String(body?.phone || ""));
    const source = String(body?.source || "degustacao").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "degustacao";

    if (name.length < 2) return json({ error: "Informe seu nome." }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (!/^55\d{10,11}$/.test(phone)) return json({ error: "Informe um WhatsApp válido com DDD." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // Contato já conhecido (cliente, ex-cliente ou degustação anterior): sem nova cortesia.
    const variations = Array.from(new Set([phone, ...getPhoneVariations(phone)])).filter(Boolean);
    const orParts = [`email.eq.${email}`, ...variations.map((v) => `phone.eq.${v}`)];
    const { data: existing, error: lookupErr } = await admin
      .from("profiles").select("id, status").or(orParts.join(",")).limit(1);
    if (lookupErr) throw lookupErr;
    if (existing && existing.length > 0) {
      return json({ existing: true, message: "Você já tem um acesso ao Olá Aura. Entre pelo App com seu WhatsApp ou e-mail." });
    }

    void saveMetaIdentity(admin, { email, phone, fbp: body?.fbp, fbc: body?.fbc, source: "degustacao-signup" });

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const userId = crypto.randomUUID();
    const { error: insErr } = await admin.from("profiles").insert({
      user_id: userId,
      name,
      email,
      phone,
      plan: null,
      status: "degustacao",
      plan_expires_at: null,
      degustacao_started_at: now.toISOString(),
      degustacao_source: source,
      sessions_used_this_month: 0,
      sessions_reset_date: today,
      messages_today: 0,
      last_message_date: today,
      needs_schedule_setup: false,
      pending_first_session_invite: true,
      whatsapp_provider: "meta",
    });
    if (insErr) {
      // Corrida com outra aba/clique: trata como existente.
      if (String(insErr.code) === "23505") return json({ existing: true, message: "Seu acesso já foi criado. Entre pelo App." });
      throw insErr;
    }

    // Lead server-side (CAPI), deduplicado com o Pixel pelo mesmo event_id.
    const leadEventId = `lead_degustacao_${userId}`;
    admin.functions.invoke("meta-capi", { body: {
      event_name: "Lead",
      event_id: leadEventId,
      event_source_url: String(body?.page_url || "https://olaaura.com.br/degustacao").slice(0, 500),
      user_data: {
        email, phone, first_name: name.split(" ")[0], external_id: userId,
        client_ip_address: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || undefined,
        client_user_agent: req.headers.get("user-agent") || undefined,
        fbp: body?.fbp || undefined, fbc: body?.fbc || undefined,
      },
      custom_data: { content_name: "degustacao_gratuita" },
    } }).catch((e) => console.warn("[degustacao-signup] CAPI Lead falhou:", (e as Error)?.message));

    const origin = (() => {
      const o = req.headers.get("origin");
      if (o && /^(https?:\/\/localhost(?::\d+)?|https:\/\/([a-z0-9-]+\.)*(olaaura\.com\.br|lovable\.app))$/i.test(o)) return o;
      return (Deno.env.get("PORTAL_SITE_URL") || "https://olaaura.com.br").replace(/\/$/, "");
    })();
    const redirectTo = `${origin}/meu-espaco?onboarding=degustacao`;

    let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo },
    });
    if (linkError && /not found|does not exist/i.test(linkError.message)) {
      const signup = await admin.auth.admin.generateLink({
        type: "signup", email, password: crypto.randomUUID() + crypto.randomUUID(), options: { redirectTo },
      });
      linkData = signup.data;
      linkError = signup.error;
    }
    const properties = linkData?.properties;
    if (linkError || !properties?.hashed_token) {
      console.error("[degustacao-signup] falha gerando entrada:", linkError?.message);
      return json({ created: true, lead_event_id: leadEventId, token_hash: null, message: "Cadastro feito. Enviamos o acesso pelo WhatsApp." });
    }

    // Aviso no WhatsApp é rede de segurança para voltar ao App; não bloqueia a entrada.
    try {
      await admin.from("user_portal_tokens").upsert({ user_id: userId }, { onConflict: "user_id" });
    } catch (_) { /* não bloqueante */ }
    sendWelcomeWhatsApp(admin, { phone, name: name.split(" ")[0], userId, functionName: "degustacao-signup" })
      .catch((e) => console.warn("[degustacao-signup] welcome falhou:", (e as Error)?.message));

    return json({
      created: true,
      lead_event_id: leadEventId,
      token_hash: properties.hashed_token,
      type: properties.verification_type || "magiclink",
    });
  } catch (error) {
    console.error("[degustacao-signup]", error);
    return json({ error: "Não foi possível liberar seu acesso agora. Tente novamente em instantes." }, 500);
  }
});
