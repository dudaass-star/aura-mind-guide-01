import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), profile_id: z.string().uuid() }),
  z.object({
    action: z.literal("consume"),
    token: z.string().min(40).max(300),
  }),
]);

const DEMO_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    if (parsed.data.action === "create") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const callerToken = authHeader.replace(/^Bearer\s+/i, "");
      if (!callerToken) return json({ error: "unauthorized" }, 401);

      const asCaller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claims, error: claimsError } = await asCaller.auth
        .getClaims(callerToken);
      const callerId = claims?.claims?.sub as string | undefined;
      if (claimsError || !callerId) return json({ error: "unauthorized" }, 401);

      const { data: isAdmin } = await admin.rpc("has_role", {
        _user_id: callerId,
        _role: "admin",
      });
      if (!isAdmin) return json({ error: "forbidden" }, 403);

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, email, status")
        .eq("id", parsed.data.profile_id)
        .maybeSingle();
      if (profileError || !profile) {
        return json({ error: "profile_not_found" }, 404);
      }
      if (profile.status !== "demo") return json({ error: "demo_only" }, 400);
      if (!profile.email) return json({ error: "email_not_found" }, 400);

      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const token = base64Url(bytes);
      const tokenHash = await sha256(token);
      const expiresAt = new Date(Date.now() + DEMO_LINK_TTL_MS).toISOString();

      const { error: insertError } = await admin.from("demo_access_invites")
        .insert({
          profile_id: profile.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_by: callerId,
        });
      if (insertError) throw insertError;

      return json({
        status: "ok",
        email: profile.email,
        link: `https://olaaura.com.br/meu-espaco/convite-demo?token=${
          encodeURIComponent(token)
        }`,
        expires_at: expiresAt,
        expires_in_days: 7,
      });
    }

    const tokenHash = await sha256(parsed.data.token);
    const now = new Date().toISOString();
    const { data: invite, error: inviteError } = await admin
      .from("demo_access_invites")
      .select(
        "id, profile_id, expires_at, use_count, profiles!inner(email, status)",
      )
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle();

    if (inviteError || !invite) {
      return json({ error: "invalid_or_expired" }, 400);
    }
    const profile = Array.isArray(invite.profiles)
      ? invite.profiles[0]
      : invite.profiles;
    if (!profile || profile.status !== "demo" || !profile.email) {
      return json({ error: "invalid_or_expired" }, 400);
    }

    let { data: authLink, error: authError } = await admin.auth.admin
      .generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo: "https://olaaura.com.br/meu-espaco" },
      });
    if (authError && /not found|does not exist/i.test(authError.message)) {
      const signup = await admin.auth.admin.generateLink({
        type: "signup",
        email: profile.email,
        password: crypto.randomUUID(),
        options: { redirectTo: "https://olaaura.com.br/meu-espaco" },
      });
      authLink = signup.data;
      authError = signup.error;
    }
    if (authError) throw authError;

    const properties = authLink?.properties;
    if (!properties?.hashed_token) throw new Error("link_generation_failed");

    await admin.from("demo_access_invites").update({
      use_count: invite.use_count + 1,
      last_used_at: now,
    }).eq("id", invite.id);

    return json({
      token_hash: properties.hashed_token,
      type: properties.verification_type || "magiclink",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("demo-access-invite", message);
    return json({ error: message }, 500);
  }
});
