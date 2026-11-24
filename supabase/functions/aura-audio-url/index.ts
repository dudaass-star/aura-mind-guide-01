// Entrega links temporários e renováveis para as falas em áudio da Aura no App.
// Se o arquivo já foi descartado, regera a voz a partir do texto original da mensagem (somente sob pedido explícito).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.25.76";
import { TTS_BUCKET, ttsPathFromMessage } from "../_shared/tts-audio-path.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(60),
  regenerate: z.boolean().optional(),
});
const LINK_SECONDS = 60 * 60 * 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sessão necessária" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsError } = await authClient.auth.getClaims(authHeader.slice(7));
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json({ error: "Sessão inválida" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { messageIds, regenerate } = parsed.data;
    if (regenerate && messageIds.length > 1) return json({ error: "Regere um áudio por vez" }, 400);

    const admin = createClient(url, serviceKey);
    const { data: rows, error } = await admin.from("messages")
      .select("id, content, audio_url, metadata")
      .eq("user_id", userId).eq("role", "assistant").eq("is_audio", true).in("id", messageIds);
    if (error) throw error;

    const urls: Record<string, string | null> = {};
    for (const row of rows ?? []) {
      const path = ttsPathFromMessage(row.metadata, row.audio_url);
      let signedUrl: string | null = null;
      if (path) {
        const { data } = await admin.storage.from(TTS_BUCKET).createSignedUrl(path, LINK_SECONDS);
        signedUrl = data?.signedUrl ?? null;
      }
      if (!signedUrl && regenerate && row.content?.trim()) {
        const tts = await fetch(`${url}/functions/v1/aura-tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ text: row.content, userId }),
        });
        const data = tts.ok ? await tts.json() : null;
        if (data?.storagePath) {
          const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}), tts_storage_path: data.storagePath, tts_regenerated_at: new Date().toISOString() };
          await admin.from("messages").update({ metadata }).eq("id", row.id).eq("user_id", userId);
          const { data: fresh } = await admin.storage.from(TTS_BUCKET).createSignedUrl(data.storagePath, LINK_SECONDS);
          signedUrl = fresh?.signedUrl ?? null;
        }
      }
      urls[row.id] = signedUrl;
    }
    return json({ urls });
  } catch (err) {
    console.error("❌ aura-audio-url:", err instanceof Error ? err.message : err);
    return json({ error: "Não foi possível preparar o áudio" }, 500);
  }
});
