import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const META_API_VERSION = "v21.0";
const META_AUDIENCE_ID = "120251134554750004";
const HISTORICAL_INCREMENT_START = "2026-09-08T03:00:00.000Z";
const BATCH_SIZE = 5_000;

type CheckoutBuyer = {
  email: string | null;
  phone: string | null;
};

type ProfileIdentity = {
  email: string | null;
  phone: string | null;
  status: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  let digits = value?.replace(/\D/g, "") || "";
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 13 ? digits : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function identityKeys(identity: Pick<ProfileIdentity, "email" | "phone">): string[] {
  const keys: string[] = [];
  const email = normalizeEmail(identity.email);
  const phone = normalizePhone(identity.phone);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  return keys;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let auditClient: ReturnType<typeof createClient> | null = null;
  let dryRun = false;
  try {
    const authorization = req.headers.get("authorization") || "";
    const adminSecret = req.headers.get("x-admin-secret") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") || "";
    let authorized = authorization === `Bearer ${serviceRoleKey}` ||
      (internalSecret.length > 0 && adminSecret === internalSecret);

    if (!authorized && authorization.toLowerCase().startsWith("bearer ") && supabaseUrl && serviceRoleKey) {
      const accessToken = authorization.slice(7);
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { data: authData } = await supabase.auth.getUser(accessToken);
      const userId = authData.user?.id;
      if (userId) {
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
        authorized = isAdmin === true;
      }
    }

    if (!authorized) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    dryRun = body?.dryRun === true;
    const metaToken = Deno.env.get("META_ADS_ACCESS_TOKEN");
    if (!metaToken || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuração obrigatória ausente");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    auditClient = supabase;

    const audienceResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${META_AUDIENCE_ID}?fields=id,name,subtype,operation_status&access_token=${encodeURIComponent(metaToken)}`,
    );
    const audience = await audienceResponse.json();
    if (!audienceResponse.ok) {
      throw new Error(`Público da Meta indisponível: ${audience?.error?.message || audienceResponse.status}`);
    }

    const { data: buyers, error: buyersError } = await supabase
      .from("checkout_sessions")
      .select("email,phone")
      .eq("status", "completed")
      .gte("completed_at", HISTORICAL_INCREMENT_START);
    if (buyersError) throw buyersError;

    const { data: demoProfiles, error: demosError } = await supabase
      .from("profiles")
      .select("email,phone,status")
      .eq("status", "demo");
    if (demosError) throw demosError;

    const demoKeys = new Set(
      ((demoProfiles || []) as ProfileIdentity[]).flatMap(identityKeys),
    );
    const uniqueBuyers = new Map<string, { email: string | null; phone: string | null }>();

    for (const buyer of (buyers || []) as CheckoutBuyer[]) {
      const email = normalizeEmail(buyer.email);
      const phone = normalizePhone(buyer.phone);
      if ((!email && !phone) || (email && demoKeys.has(`email:${email}`)) || (phone && demoKeys.has(`phone:${phone}`))) {
        continue;
      }
      const key = email ? `email:${email}` : `phone:${phone}`;
      uniqueBuyers.set(key, { email, phone });
    }

    const hashedUsers = await Promise.all(
      [...uniqueBuyers.values()].map(async ({ email, phone }) => [
        email ? await sha256(email) : "",
        phone ? await sha256(phone) : "",
      ]),
    );

    let received = 0;
    let invalidEntries = 0;
    const sessions: string[] = [];

    if (!dryRun) {
      for (let offset = 0; offset < hashedUsers.length; offset += BATCH_SIZE) {
        const batch = hashedUsers.slice(offset, offset + BATCH_SIZE);
        const form = new URLSearchParams({
          access_token: metaToken,
          payload: JSON.stringify({ schema: ["EMAIL", "PHONE"], data: batch }),
        });
        const uploadResponse = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${META_AUDIENCE_ID}/users`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form },
        );
        const upload = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(`Falha ao atualizar público: ${upload?.error?.message || uploadResponse.status}`);
        }
        received += Number(upload.num_received || batch.length);
        invalidEntries += Number(upload.num_invalid_entries || 0);
        if (upload.session_id) sessions.push(String(upload.session_id));
      }
    }

    console.log("[sync-meta-customer-audience] concluído", {
      dryRun,
      audienceId: audience.id,
      buyersFound: buyers?.length || 0,
      uniqueBuyers: uniqueBuyers.size,
      received,
      invalidEntries,
    });

    await supabase.from("meta_capi_log").insert({
      event_name: "CustomerAudienceSync",
      event_id: `customer-audience-${Date.now()}`,
      source: dryRun ? "dry_run" : "scheduled_sync",
      email_present: hashedUsers.some(([email]) => Boolean(email)),
      phone_present: hashedUsers.some(([, phone]) => Boolean(phone)),
      fbp_present: false,
      fbc_present: false,
      external_id_present: false,
      meta_status: 200,
      raw_response: {
        audience_id: audience.id,
        completed_purchases_found: buyers?.length || 0,
        unique_buyers: uniqueBuyers.size,
        received,
        invalid_entries: invalidEntries,
        dry_run: dryRun,
      },
    });

    return json({
      ok: true,
      dryRun,
      audience: { id: audience.id, name: audience.name, subtype: audience.subtype },
      source_since: HISTORICAL_INCREMENT_START,
      completed_purchases_found: buyers?.length || 0,
      unique_buyers: uniqueBuyers.size,
      received,
      invalid_entries: invalidEntries,
      batches: dryRun ? 0 : sessions.length,
    });
  } catch (error) {
    console.error("[sync-meta-customer-audience] erro", error);
    if (auditClient) {
      await auditClient.from("meta_capi_log").insert({
        event_name: "CustomerAudienceSync",
        event_id: `customer-audience-error-${Date.now()}`,
        source: dryRun ? "dry_run" : "scheduled_sync",
        email_present: false,
        phone_present: false,
        fbp_present: false,
        fbc_present: false,
        external_id_present: false,
        meta_status: 500,
        meta_error: error instanceof Error ? error.message.slice(0, 1000) : "Erro inesperado",
      });
    }
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});