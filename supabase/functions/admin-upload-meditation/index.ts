import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAudioMetadata(file: File) {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  if (mime === "audio/mpeg" || mime === "audio/mp3" || name.endsWith(".mp3")) {
    return { extension: "mp3", contentType: "audio/mpeg" };
  }

  if (mime === "audio/wav" || mime === "audio/x-wav" || mime === "audio/wave" || name.endsWith(".wav")) {
    return { extension: "wav", contentType: "audio/wav" };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse({ error: "Configuração do backend incompleta." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Login obrigatório." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ error: "Sessão inválida. Faça login novamente." }, 401);
    }

    const userId = claimsData.claims.sub;
    const { data: isAdmin, error: roleError } = await serviceClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });

    if (roleError) {
      console.error("Erro ao validar admin:", roleError);
      return jsonResponse({ error: "Não foi possível validar permissão admin." }, 500);
    }

    if (!isAdmin) {
      return jsonResponse({ error: "Apenas administradoras podem substituir áudios." }, 403);
    }

    const formData = await req.formData();
    const meditationId = String(formData.get("meditation_id") || "").trim();
    const file = formData.get("file");

    if (!meditationId || !/^[a-zA-Z0-9_-]+$/.test(meditationId)) {
      return jsonResponse({ error: "Meditação inválida." }, 400);
    }

    if (!(file instanceof File)) {
      return jsonResponse({ error: "Arquivo de áudio obrigatório." }, 400);
    }

    if (file.size <= 0) {
      return jsonResponse({ error: "Arquivo de áudio vazio." }, 400);
    }

    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      return jsonResponse({ error: "Arquivo muito grande. O limite é 50MB." }, 413);
    }

    const audioMetadata = getAudioMetadata(file);
    if (!audioMetadata) {
      return jsonResponse({ error: "Formato não suportado. Use MP3 ou WAV." }, 415);
    }

    const { data: meditation, error: meditationError } = await serviceClient
      .from("meditations")
      .select("id, duration_seconds")
      .eq("id", meditationId)
      .single();

    if (meditationError || !meditation) {
      return jsonResponse({ error: "Meditação não encontrada." }, 404);
    }

    const { data: existingAudios } = await serviceClient
      .from("meditation_audios")
      .select("storage_path")
      .eq("meditation_id", meditationId);

    const { data: existingChunks } = await serviceClient
      .from("meditation_audio_chunks")
      .select("storage_path")
      .eq("meditation_id", meditationId);

    const storagePath = `${meditationId}/audio.${audioMetadata.extension}`;
    const { error: uploadError } = await serviceClient.storage
      .from("meditations")
      .upload(storagePath, file, {
        upsert: true,
        contentType: audioMetadata.contentType,
      });

    if (uploadError) {
      console.error("Erro ao enviar áudio:", uploadError);
      const message = uploadError.message?.toLowerCase().includes("mime")
        ? "Formato não suportado pelo bucket. Use MP3 ou WAV."
        : `Falha ao enviar áudio: ${uploadError.message}`;
      return jsonResponse({ error: message }, 500);
    }

    const { data: publicUrlData } = serviceClient.storage
      .from("meditations")
      .getPublicUrl(storagePath);

    const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
    const rawDuration = Number(formData.get("duration_seconds") || 0);
    const durationSeconds = Number.isFinite(rawDuration) && rawDuration > 0
      ? Math.round(rawDuration)
      : meditation.duration_seconds;

    const { error: deleteAudioError } = await serviceClient
      .from("meditation_audios")
      .delete()
      .eq("meditation_id", meditationId);

    if (deleteAudioError) {
      console.error("Erro ao remover registro anterior:", deleteAudioError);
      return jsonResponse({ error: "Falha ao atualizar registro do áudio." }, 500);
    }

    const { error: insertAudioError } = await serviceClient
      .from("meditation_audios")
      .insert({
        meditation_id: meditationId,
        storage_path: storagePath,
        public_url: publicUrl,
        duration_seconds: durationSeconds,
        generated_at: new Date().toISOString(),
      });

    if (insertAudioError) {
      console.error("Erro ao criar registro de áudio:", insertAudioError);
      return jsonResponse({ error: "Falha ao salvar novo áudio." }, 500);
    }

    const { error: deleteChunksError } = await serviceClient
      .from("meditation_audio_chunks")
      .delete()
      .eq("meditation_id", meditationId);

    if (deleteChunksError) {
      console.warn("Não foi possível limpar chunks antigos:", deleteChunksError);
    }

    const obsoletePaths = new Set<string>();
    for (const audio of existingAudios || []) {
      if (audio.storage_path && audio.storage_path !== storagePath) obsoletePaths.add(audio.storage_path);
    }
    for (const chunk of existingChunks || []) {
      if (chunk.storage_path && chunk.storage_path !== storagePath) obsoletePaths.add(chunk.storage_path);
    }

    if (obsoletePaths.size > 0) {
      const { error: removeError } = await serviceClient.storage
        .from("meditations")
        .remove([...obsoletePaths]);

      if (removeError) {
        console.warn("Não foi possível remover arquivos antigos:", removeError);
      }
    }

    return jsonResponse({
      success: true,
      meditation_id: meditationId,
      public_url: publicUrl,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
      size_bytes: file.size,
    });
  } catch (error) {
    console.error("Erro inesperado em admin-upload-meditation:", error);
    return jsonResponse({ error: "Erro inesperado ao substituir áudio." }, 500);
  }
});