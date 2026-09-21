import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

const BodySchema = z.object({
  text: z.string().trim().max(8000).optional(),
  client_message_id: z.string().uuid(),
  audio_base64: z.string().max(14_000_000).optional(),
  audio_mime: z.string().max(80).optional(),
  audio_duration_ms: z.number().int().min(100).max(120_000).optional(),
  client_sent_at: z.string().datetime().optional(),
}).superRefine((value, context) => {
  const hasText = Boolean(value.text);
  const hasAudio = Boolean(value.audio_base64 && value.audio_mime && value.audio_duration_ms);
  if (hasText === hasAudio) context.addIssue({ code: z.ZodIssueCode.custom, message: "Envie texto ou áudio" });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sessão necessária" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET");
    if (!supabaseUrl || !anonKey || !serviceKey || !internalSecret) {
      throw new Error("Configuração interna incompleta");
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.slice(7);
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json({ error: "Sessão inválida" }, 401);

    const receivedAt = new Date().toISOString();
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Mensagem inválida", details: parsed.error.flatten().fieldErrors }, 400);
    const { client_message_id: clientMessageId, audio_base64: audioBase64, audio_duration_ms: audioDurationMs, client_sent_at: clientSentAt } = parsed.data;
    const text = parsed.data.text || "";
    const audioMime = parsed.data.audio_mime?.split(";")[0].toLowerCase();
    const hasAudio = Boolean(audioBase64);
    if (hasAudio && (!audioMime || !AUDIO_TYPES.has(audioMime))) return json({ error: "Formato de áudio não aceito" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, phone, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json({ error: "Conta não vinculada" }, 403);

    const { data: existing } = await admin
      .from("messages")
      .select("id, sequence_no, delivery_status, created_at, is_audio, audio_url, metadata")
      .eq("user_id", userId)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (existing) return json({ accepted: true, message: existing, duplicate: true }, 202);

    let audioUrl: string | null = null;
    let audioPath: string | null = null;
    if (hasAudio && audioBase64 && audioMime) {
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("channel", "in_app")
        .eq("is_audio", true)
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if ((count || 0) >= 5) return json({ error: "Aguarde um instante antes de enviar outro áudio" }, 429);

      let bytes: Uint8Array;
      try {
        const binary = atob(audioBase64);
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      } catch {
        return json({ error: "Áudio inválido" }, 400);
      }
      if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) return json({ error: "O áudio deve ter no máximo 10 MB" }, 400);
      const extension = audioMime.includes("mp4") ? "m4a" : audioMime.split("/")[1];
      audioPath = `${userId}/${clientMessageId}.${extension}`;
      const { error: uploadError } = await admin.storage.from("chat-audios").upload(audioPath, bytes, {
        contentType: audioMime,
        upsert: false,
      });
      if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) throw uploadError;
      const { data: signed, error: signedError } = await admin.storage.from("chat-audios").createSignedUrl(audioPath, 21_600);
      if (signedError || !signed?.signedUrl) throw signedError || new Error("Falha ao proteger o áudio");
      audioUrl = signed.signedUrl;
    }

    const { data: inserted, error: insertError } = await admin
      .from("messages")
      .insert({
        user_id: userId,
        role: "user",
        content: hasAudio ? "Áudio enviado" : text,
        channel: "in_app",
        client_message_id: clientMessageId,
        delivery_status: "delivered",
        is_audio: hasAudio,
        audio_url: audioUrl,
        metadata: {
          ...(audioPath ? { audio_storage_path: audioPath, audio_mime: audioMime, audio_duration_ms: audioDurationMs } : {}),
          client_sent_at: clientSentAt || null,
          server_received_at: receivedAt,
          accepted_at: new Date().toISOString(),
        },
      })
      .select("id, sequence_no, delivery_status, created_at, is_audio, audio_url, metadata")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: duplicate } = await admin
          .from("messages")
          .select("id, sequence_no, delivery_status, created_at, is_audio, audio_url, metadata")
          .eq("user_id", userId)
          .eq("client_message_id", clientMessageId)
          .single();
        return json({ accepted: true, message: duplicate, duplicate: true }, 202);
      }
      throw insertError;
    }

    const workerPromise = fetch(`${supabaseUrl}/functions/v1/process-webhook-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        channel: "in_app",
        userId,
        cleanPhone: profile.phone,
        phone: profile.phone,
        messageId: clientMessageId,
        inboundMessageDbId: inserted.id,
        text: hasAudio ? "" : text,
        hasAudio,
        audioUrl,
        hasImage: false,
      }),
    }).then(async (response) => {
      if (!response.ok) console.error("Falha no processamento do chat:", response.status, await response.text());
    }).catch((error) => console.error("Falha ao iniciar processamento do chat:", error));

    (globalThis as any).EdgeRuntime.waitUntil(workerPromise);
    return json({ accepted: true, message: inserted, server_received_at: receivedAt }, 202);
  } catch (error) {
    console.error("Erro no chat do aplicativo:", error);
    return json({ error: "Não foi possível enviar agora" }, 500);
  }
});