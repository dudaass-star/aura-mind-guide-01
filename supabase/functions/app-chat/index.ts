import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@3.25.76";
import {
  buildPortalWelcome,
  portalWelcomeSource,
  resolveEntryContext,
  type PortalEntryContext,
} from "./onboarding-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]);

const BodySchema = z.object({
  action: z.enum(["initialize", "send", "retry_response"]).default("send"),
  entry_context: z.enum(["new", "migration", "regular"]).optional(),
  text: z.string().trim().max(8000).optional(),
  client_message_id: z.string().uuid().optional(),
  source_message_id: z.string().uuid().optional(),
  audio_base64: z.string().max(14_000_000).optional(),
  audio_mime: z.string().max(80).optional(),
  audio_duration_ms: z.number().int().min(100).max(120_000).optional(),
  journey_episode_id: z.string().uuid().optional(),
  client_sent_at: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (value.action === "initialize") return;
  if (value.action === "retry_response") {
    if (!value.source_message_id) context.addIssue({ code: z.ZodIssueCode.custom, message: "Mensagem de origem necessária" });
    return;
  }
  const hasText = Boolean(value.text);
  const hasAudio = Boolean(value.audio_base64 && value.audio_mime && value.audio_duration_ms);
  if (!value.client_message_id) context.addIssue({ code: z.ZodIssueCode.custom, message: "Identificador da mensagem necessário" });
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
    const { action, entry_context: requestedEntryContext, client_message_id: clientMessageId, source_message_id: sourceMessageId, audio_base64: audioBase64, audio_duration_ms: audioDurationMs, journey_episode_id: journeyEpisodeId, client_sent_at: clientSentAt } = parsed.data;
    const text = parsed.data.text || "";
    const audioMime = parsed.data.audio_mime?.split(";")[0].toLowerCase();
    const hasAudio = Boolean(audioBase64);
    if (hasAudio && (!audioMime || !AUDIO_TYPES.has(audioMime))) return json({ error: "Formato de áudio não aceito" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, phone, status, name, created_at, converted_at, trial_started_at, pending_insight, pending_first_session_invite")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json({ error: "Conta não vinculada" }, 403);
    const { data: entitled, error: entitlementError } = await admin.rpc("has_portal_entitlement", { _user_id: userId });
    if (entitlementError) throw entitlementError;
    if (!entitled) return json({ error: "Seu acesso ainda não está liberado" }, 403);

    if (action === "initialize") {
      const entryContext = resolveEntryContext(
        (requestedEntryContext || "regular") as PortalEntryContext,
        profile,
      );
      if (entryContext === "regular") return json({ initialized: true, context: entryContext });

      const sources = [portalWelcomeSource("new"), portalWelcomeSource("migration")];
      const { count: existingInAppMessages, error: existingMessagesError } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("channel", "in_app");
      if (existingMessagesError) throw existingMessagesError;
      const { data: existingWelcome, error: existingWelcomeError } = await admin
        .from("messages")
        .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
        .eq("user_id", userId)
        .eq("channel", "in_app")
        .in("source_message_id", sources)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existingWelcomeError) throw existingWelcomeError;
      if (existingWelcome) return json({ initialized: true, context: entryContext, message: existingWelcome, duplicate: true });
      if ((existingInAppMessages || 0) > 0) return json({ initialized: true, context: "regular" });

      const firstName = profile.name?.trim().split(/\s+/)[0] || "você";
      const welcomeText = buildPortalWelcome(firstName, entryContext);
      if (!welcomeText) return json({ initialized: true, context: entryContext });
      const welcomeSource = portalWelcomeSource(entryContext);
      const { data: welcome, error: welcomeError } = await admin
        .from("messages")
        .insert({
          user_id: userId,
          role: "assistant",
          content: welcomeText,
          channel: "in_app",
          source_message_id: welcomeSource,
          delivery_status: "delivered",
          is_audio: false,
          metadata: { kind: "portal_welcome", entry_context: entryContext },
        })
        .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
        .single();
      if (welcomeError) {
        if (welcomeError.code === "23505") {
          const { data: duplicate } = await admin
            .from("messages")
            .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
            .eq("user_id", userId)
            .eq("channel", "in_app")
            .eq("source_message_id", welcomeSource)
            .single();
          return json({ initialized: true, context: entryContext, message: duplicate, duplicate: true });
        }
        throw welcomeError;
      }

      if (typeof profile.pending_insight === "string" && profile.pending_insight.startsWith("[WELCOME]")) {
        await admin.from("profiles").update({ pending_insight: null }).eq("user_id", userId);
      }
      await admin.from("portal_value_events").insert({
        user_id: userId,
        feature: "conversation",
        event_type: entryContext === "migration" ? "migration_welcome_created" : "new_customer_welcome_created",
        source: "app",
        metadata: { version: 1 },
      });
      return json({ initialized: true, context: entryContext, message: welcome }, 201);
    }

    if (journeyEpisodeId) {
      const { data: releasedEpisode, error: releasedEpisodeError } = await admin
        .from("journey_episode_progress")
        .select("episode_id")
        .eq("user_id", userId)
        .eq("episode_id", journeyEpisodeId)
        .maybeSingle();
      if (releasedEpisodeError || !releasedEpisode) return json({ error: "Episódio não disponível" }, 403);
    }

    if (action === "retry_response" && sourceMessageId) {
      const { data: sourceMessage, error: sourceError } = await admin
        .from("messages")
        .select("id, content, is_audio, audio_url, metadata")
        .eq("id", sourceMessageId)
        .eq("user_id", userId)
        .eq("role", "user")
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (!sourceMessage) return json({ error: "Mensagem não encontrada" }, 404);

      const { data: existingReplies } = await admin
        .from("messages")
        .select("id, metadata")
        .eq("user_id", userId)
        .eq("role", "assistant")
        .contains("metadata", { reply_to_message_id: sourceMessageId })
        .limit(5);
      const alreadyAnswered = existingReplies?.some((reply) => {
        const metadata = reply.metadata && typeof reply.metadata === "object" && !Array.isArray(reply.metadata)
          ? reply.metadata as Record<string, unknown>
          : {};
        return metadata.kind !== "response_failure";
      });
      if (alreadyAnswered) return json({ accepted: true, already_answered: true }, 202);

      let retryAudioUrl = sourceMessage.audio_url;
      if (sourceMessage.is_audio && sourceMessage.metadata && typeof sourceMessage.metadata === "object" && !Array.isArray(sourceMessage.metadata)) {
        const storagePath = (sourceMessage.metadata as Record<string, unknown>).audio_storage_path;
        if (typeof storagePath === "string") {
          const { data: signed } = await admin.storage.from("chat-audios").createSignedUrl(storagePath, 900);
          if (signed?.signedUrl) retryAudioUrl = signed.signedUrl;
        }
      }

      const retryId = crypto.randomUUID();
      const retryReceivedAt = new Date().toISOString();
      const { count: recentAttempts } = await admin
        .from("chat_turn_metrics")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("channel", "in_app")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString());
      if ((recentAttempts || 0) >= 5) return json({ error: "Aguarde um instante antes de tentar novamente" }, 429);

      await admin.from("chat_turn_metrics").insert({
        user_id: userId,
        client_message_id: retryId,
        channel: "in_app",
        server_received_at: retryReceivedAt,
        status: "accepted",
      });
      const retryWorker = fetch(`${supabaseUrl}/functions/v1/process-webhook-message`, {
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
          messageId: retryId,
          inboundMessageDbId: sourceMessage.id,
          text: sourceMessage.is_audio ? "" : sourceMessage.content,
          hasAudio: sourceMessage.is_audio,
          audioUrl: retryAudioUrl,
          hasImage: false,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          console.error("Falha ao retomar resposta do chat:", response.status, await response.text());
          await admin.from("chat_turn_metrics").update({
            completed_at: new Date().toISOString(),
            status: "failed",
            error_code: `worker_http_${response.status}`,
          }).eq("user_id", userId).eq("client_message_id", retryId);
        }
      }).catch(async (error) => {
        console.error("Falha ao retomar resposta do chat:", error);
        await admin.from("chat_turn_metrics").update({
          completed_at: new Date().toISOString(),
          status: "failed",
          error_code: "worker_network_error",
        }).eq("user_id", userId).eq("client_message_id", retryId);
      });
      (globalThis as any).EdgeRuntime.waitUntil(retryWorker);
      return json({ accepted: true, retry_id: retryId }, 202);
    }

    if (!clientMessageId) return json({ error: "Mensagem inválida" }, 400);

    const { data: existing } = await admin
      .from("messages")
      .select("id, sequence_no, delivery_status, created_at, is_audio, audio_url, metadata")
      .eq("user_id", userId)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (existing) return json({ accepted: true, message: existing, duplicate: true }, 202);

    const clientSentDate = clientSentAt ? new Date(clientSentAt) : null;
    const safeClientSentAt = clientSentDate && Number.isFinite(clientSentDate.getTime())
      ? clientSentDate.toISOString()
      : null;

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

    const [{ count: priorInAppUserMessages }, { count: onboardingWelcomes }] = await Promise.all([
      admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("channel", "in_app").eq("role", "user"),
      admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("channel", "in_app").eq("role", "assistant").eq("source_message_id", portalWelcomeSource("new")),
    ]);

    const { data: inserted, error: insertError } = await admin
      .from("messages")
      .insert({
        user_id: userId,
        role: "user",
        content: hasAudio ? "Áudio enviado" : text,
        channel: "in_app",
        client_message_id: clientMessageId,
        source_message_id: clientMessageId,
        delivery_status: "delivered",
        is_audio: hasAudio,
        audio_url: audioUrl,
        metadata: {
          ...(audioPath ? { audio_storage_path: audioPath, audio_mime: audioMime, audio_duration_ms: audioDurationMs } : {}),
          client_sent_at: safeClientSentAt,
          server_received_at: receivedAt,
          accepted_at: new Date().toISOString(),
          ...(journeyEpisodeId ? { journey_episode_id: journeyEpisodeId } : {}),
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

    if ((priorInAppUserMessages || 0) === 0 && (onboardingWelcomes || 0) > 0 && !profile.pending_first_session_invite) {
      await admin.from("profiles").update({ pending_first_session_invite: true }).eq("user_id", userId);
    }


    await Promise.all([
      admin.from("aura_response_state").upsert({
        user_id: userId,
        last_user_message_id: clientMessageId,
        updated_at: receivedAt,
      }, { onConflict: "user_id" }),
      admin.from("chat_turn_metrics").upsert({
        user_id: userId,
        client_message_id: clientMessageId,
        channel: "in_app",
        client_sent_at: safeClientSentAt,
        server_received_at: receivedAt,
        status: "accepted",
      }, { onConflict: "user_id,client_message_id", ignoreDuplicates: true }),
    ]);

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
        journeyEpisodeId,
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