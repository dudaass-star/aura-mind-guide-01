import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  action: z.enum(["start", "switch", "pause", "resume", "open", "progress", "reflect", "discuss", "complete"]),
  journeyId: z.string().max(120).nullable().optional(),
  episodeId: z.string().uuid().nullable().optional(),
  progressPercent: z.number().int().min(1).max(99).nullable().optional(),
  reflectionText: z.string().max(2000).nullable().optional(),
  goal: z.string().max(240).nullable().optional(),
  portalToken: z.string().min(32).max(200).nullable().optional(),
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function publicError(message: string) {
  const known = ["access_not_available", "profile_not_found", "journey_not_available", "episode_not_released", "episode_not_available", "journey_not_current", "reflection_required", "reflection_too_long", "invalid_journey_action"];
  return known.find((code) => message.includes(code)) || "journey_update_failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Configuração interna incompleta");

    let userId: string | null = null;
    const authorization = req.headers.get("authorization") || "";
    if (authorization.startsWith("Bearer ")) {
      const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
      const { data } = await auth.auth.getClaims(authorization.slice(7));
      userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    }
    const admin = createClient(url, serviceKey);
    if (!userId && parsed.data.portalToken) {
      const { data } = await admin.from("user_portal_tokens").select("user_id").eq("token", parsed.data.portalToken).maybeSingle();
      userId = data?.user_id || null;
    }
    if (!userId) return json({ error: "auth_required" }, 401);

    const { data, error } = await admin.rpc("manage_portal_journey_internal", {
      _user_id: userId,
      _action: parsed.data.action,
      _journey_id: parsed.data.journeyId || null,
      _episode_id: parsed.data.episodeId || null,
      _progress_percent: parsed.data.progressPercent || null,
      _reflection_text: parsed.data.reflectionText || null,
      _goal: parsed.data.goal || null,
    });
    if (error) return json({ error: publicError(error.message) }, 409);

    await admin.from("portal_value_events").insert({
      user_id: userId,
      feature: "journey",
      event_type: `journey_${parsed.data.action}`,
      metadata: { journey_id: parsed.data.journeyId || null, episode_id: parsed.data.episodeId || null },
    }).then(() => undefined, () => undefined);
    return json({ result: data });
  } catch (error) {
    console.error("Falha ao gerenciar jornada no aplicativo:", error);
    return json({ error: "journey_update_failed" }, 500);
  }
});