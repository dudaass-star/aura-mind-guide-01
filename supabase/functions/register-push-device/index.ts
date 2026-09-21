import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    token: z.string().min(20).max(4096),
    platform: z.enum(["web", "ios", "android", "desktop"]),
    userAgent: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("disable_current") }),
  z.object({ action: z.literal("permission_denied") }),
  z.object({
    action: z.literal("event"),
    eventType: z.enum(["invite_shown", "activation_started", "opened"]),
    notificationType: z.string().max(80).optional(),
    path: z.string().max(300).optional(),
  }),
]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sessão necessária" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Configuração interna incompleta");
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsError } = await auth.auth.getClaims(authHeader.slice(7));
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json({ error: "Sessão inválida" }, 401);
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados inválidos" }, 400);

    const admin = createClient(url, serviceKey);
    if (parsed.data.action === "event") {
      await admin.from("push_notification_events").insert({
        user_id: userId,
        event_type: parsed.data.eventType,
        notification_type: parsed.data.notificationType || null,
        path: parsed.data.path || null,
      });
      return json({ recorded: true });
    }
    if (parsed.data.action === "permission_denied") {
      await admin.from("push_notification_events").insert({ user_id: userId, event_type: "permission_denied" });
      return json({ recorded: true });
    }
    if (parsed.data.action === "disable_current") {
      await admin.from("push_devices").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", userId);
      await admin.from("push_notification_events").insert({ user_id: userId, event_type: "disabled" });
      return json({ disabled: true });
    }

    const tokenHash = await sha256(parsed.data.token);
    const { data: device, error } = await admin.from("push_devices").upsert({
      user_id: userId,
      token: parsed.data.token,
      token_hash: tokenHash,
      platform: parsed.data.platform,
      user_agent: parsed.data.userAgent || null,
      permission: "granted",
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,token_hash" }).select("id").single();
    if (error) throw error;
    await admin.from("push_notification_events").insert([
      { user_id: userId, device_id: device.id, event_type: "permission_granted" },
      { user_id: userId, device_id: device.id, event_type: "registered" },
    ]);
    return json({ registered: true });
  } catch (error) {
    console.error("Falha ao registrar notificações:", error);
    return json({ error: "Não foi possível registrar este aparelho" }, 500);
  }
});
