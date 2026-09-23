import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  action: z.enum(["schedule", "reschedule", "cancel"]),
  scheduledAt: z.string().datetime().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function publicError(message: string) {
  const known = [
    "access_not_available",
    "future_time_required",
    "invalid_time_interval",
    "active_session_exists",
    "monthly_limit_reached",
    "session_not_available",
    "session_already_started",
  ];
  return known.find((code) => message.includes(code)) || "session_update_failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Configuração interna incompleta");

    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsError } = await auth.auth.getClaims(authHeader.slice(7));
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json({ error: "auth_required" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    if (parsed.data.action !== "cancel") {
      if (!parsed.data.scheduledAt) return json({ error: "future_time_required" }, 400);
      const scheduled = new Date(parsed.data.scheduledAt);
      if (!Number.isFinite(scheduled.getTime()) || scheduled.getUTCMinutes() % 15 !== 0 || scheduled.getUTCSeconds() !== 0) {
        return json({ error: "invalid_time_interval" }, 400);
      }
    }

    const admin = createClient(url, serviceKey);
    const { data, error } = await admin.rpc("manage_portal_session_internal", {
      _user_id: userId,
      _action: parsed.data.action,
      _scheduled_at: parsed.data.scheduledAt || null,
      _session_id: parsed.data.sessionId || null,
    });
    if (error) return json({ error: publicError(error.message) }, 409);

    return json({ result: data });
  } catch (error) {
    console.error("Falha ao gerenciar sessão pelo aplicativo:", error);
    return json({ error: "session_update_failed" }, 500);
  }
});