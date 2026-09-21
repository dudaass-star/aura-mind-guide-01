import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const clientMessageId = typeof body.client_message_id === "string" ? body.client_message_id : "";
    if (!text || text.length > 8000) return json({ error: "Mensagem inválida" }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)) {
      return json({ error: "Identificador de envio inválido" }, 400);
    }

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
      .select("id, sequence_no, delivery_status")
      .eq("user_id", userId)
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (existing) return json({ accepted: true, message: existing, duplicate: true }, 202);

    const { data: inserted, error: insertError } = await admin
      .from("messages")
      .insert({
        user_id: userId,
        role: "user",
        content: text,
        channel: "in_app",
        client_message_id: clientMessageId,
        delivery_status: "delivered",
      })
      .select("id, sequence_no, delivery_status, created_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: duplicate } = await admin
          .from("messages")
          .select("id, sequence_no, delivery_status, created_at")
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
        text,
        hasAudio: false,
        hasImage: false,
      }),
    }).then(async (response) => {
      if (!response.ok) console.error("Falha no processamento do chat:", response.status, await response.text());
    }).catch((error) => console.error("Falha ao iniciar processamento do chat:", error));

    (globalThis as any).EdgeRuntime.waitUntil(workerPromise);
    return json({ accepted: true, message: inserted }, 202);
  } catch (error) {
    console.error("Erro no chat do aplicativo:", error);
    return json({ error: "Não foi possível enviar agora" }, 500);
  }
});