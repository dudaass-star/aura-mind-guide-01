import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("snapshot") }),
  z.object({ action: z.literal("reach"), referralCode: z.string().trim().min(4).max(40), visitorKey: z.string().min(12).max(100) }),
  z.object({ action: z.literal("claim"), visitorKey: z.string().min(12).max(100) }),
  z.object({ action: z.literal("recognition-consent"), recognitionId: z.string().uuid(), decision: z.enum(["accepted", "declined"]) }),
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    if (parsed.data.action === "snapshot") {
      const { data, error } = await admin.rpc("movement_public_snapshot");
      if (error) throw error;
      return json({ result: data });
    }

    if (parsed.data.action === "reach") {
      const { data, error } = await admin.rpc("record_movement_reach", {
        _referral_code: parsed.data.referralCode.toLowerCase(),
        _visitor_key: parsed.data.visitorKey,
      });
      if (error) throw error;
      return json({ result: data });
    }

    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "auth_required" }, 401);
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: claimsData, error: claimsError } = await auth.auth.getClaims(authorization.slice(7));
    const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
    if (claimsError || !userId) return json({ error: "invalid_session" }, 401);
    if (parsed.data.action === "recognition-consent") {
      const { data, error } = await admin.rpc("movement_recognition_consent_internal", {
        _recognition_id: parsed.data.recognitionId,
        _user_id: userId,
        _decision: parsed.data.decision,
      });
      if (error) throw error;
      return json({ result: data });
    }

    const { data, error } = await admin.rpc("claim_movement_referral_internal", { _visitor_key: parsed.data.visitorKey, _user_id: userId });
    if (error) throw error;
    return json({ result: Boolean(data) });
  } catch (error) {
    console.error("Falha no acesso público do Movimento:", error);
    return json({ error: "movement_request_failed" }, 500);
  }
});
