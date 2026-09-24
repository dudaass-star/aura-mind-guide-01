import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_fact"), category: z.enum(["objetivo", "medo", "desafio", "valor", "aspiracao", "sobre_mim"]), value: z.string().trim().min(1).max(800) }),
  z.object({ action: z.literal("edit_fact"), insightId: z.string().uuid(), value: z.string().trim().min(1).max(800) }),
  z.object({ action: z.literal("delete_fact"), insightId: z.string().uuid() }),
  z.object({ action: z.literal("confirm"), section: z.enum(["intro", "pessoas", "o_que_te_move", "padroes", "preferencias", "sensiveis"]), originalText: z.string().trim().min(1).max(1200) }),
  z.object({ action: z.literal("correct"), section: z.enum(["intro", "pessoas", "o_que_te_move", "padroes", "preferencias", "sensiveis"]), originalText: z.string().trim().min(1).max(1200), correctedText: z.string().trim().min(1).max(800) }),
  z.object({ action: z.literal("remove"), section: z.enum(["intro", "pessoas", "o_que_te_move", "padroes", "preferencias", "sensiveis"]), originalText: z.string().trim().min(1).max(1200) }),
]);

const CATEGORY_LABELS: Record<string, string> = {
  objetivo: "Objetivo",
  medo: "Medo",
  desafio: "Desafio",
  valor: "Valor",
  aspiracao: "Aspiração",
  sobre_mim: "Sobre mim",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function itemKey(section: string, text: string) {
  const bytes = new TextEncoder().encode(`${section}:${text.trim().replace(/\s+/g, " ").toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function portraitContains(portrait: Record<string, unknown>, section: string, originalText: string) {
  if (section === "intro") return portrait.intro === originalText;
  const sectionValue = portrait[section];
  if (!Array.isArray(sectionValue)) return false;
  if (section === "pessoas") {
    return sectionValue.some((person) => {
      if (!person || typeof person !== "object") return false;
      const row = person as { label?: string; names?: string[]; nota?: string | null };
      return [row.label, ...(row.names ?? []), row.nota].filter(Boolean).join(" · ") === originalText;
    });
  }
  return sectionValue.includes(originalText);
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

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.slice(7));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) return json({ error: "Sessão inválida" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;
    const admin = createClient(url, serviceKey);

    if (body.action === "add_fact") {
      const { data, error } = await admin.from("user_insights").insert({
        user_id: userId, category: "contexto", key: `Declarado · ${CATEGORY_LABELS[body.category]}`, value: body.value,
        importance: 9, mentioned_count: 1,
      }).select("id, key, value, created_at").single();
      if (error) throw error;
      await admin.from("portal_value_events").insert({ user_id: userId, feature: "profile", event_type: "fact_added", metadata: { category: body.category } });
      return json({ ok: true, item: data });
    }

    if (body.action === "edit_fact" || body.action === "delete_fact") {
      const { data: insight } = await admin.from("user_insights").select("id,key,value").eq("id", body.insightId).eq("user_id", userId).eq("category", "contexto").ilike("key", "Declarado · %").maybeSingle();
      if (!insight) return json({ error: "Informação não encontrada" }, 404);
      if (body.action === "edit_fact") {
        const { error } = await admin.from("user_insights").update({ value: body.value, last_mentioned_at: new Date().toISOString() }).eq("id", insight.id).eq("user_id", userId);
        if (error) throw error;
        await admin.from("portal_value_events").insert({ user_id: userId, feature: "profile", event_type: "fact_edited", metadata: { category: insight.key } });
      } else {
        const correction = `Não considerar mais como fato: ${insight.key} — ${insight.value}.`;
        const { error: correctionError } = await admin.from("user_memory_corrections").insert({ user_id: userId, correction_text: correction, source: "user_portrait_fact_removed", confidence: 10, correction_type: "exclusao" });
        if (correctionError) throw correctionError;
        const { error } = await admin.from("user_insights").delete().eq("id", insight.id).eq("user_id", userId);
        if (error) throw error;
        await admin.from("portal_value_events").insert({ user_id: userId, feature: "profile", event_type: "fact_removed", metadata: { category: insight.key } });
        await admin.from("user_portraits").delete().eq("user_id", userId);
      }
      return json({ ok: true });
    }

    const { data: portrait } = await admin.from("user_portraits").select("*").eq("user_id", userId).maybeSingle();
    if (!portrait || !portraitContains(portrait as Record<string, unknown>, body.section, body.originalText)) {
      return json({ error: "Essa leitura não está mais no seu retrato" }, 409);
    }
    const status = body.action === "confirm" ? "confirmed" : body.action === "correct" ? "corrected" : "removed";
    const correctedText = body.action === "correct" ? body.correctedText : null;
    const key = await itemKey(body.section, body.originalText);
    const { error: feedbackError } = await admin.from("user_portrait_feedback").upsert({
      user_id: userId, item_key: key, section: body.section, original_text: body.originalText,
      source_kind: "aura_inference", status, corrected_text: correctedText,
    }, { onConflict: "user_id,item_key" });
    if (feedbackError) throw feedbackError;

    if (status !== "confirmed") {
      const correctionText = status === "corrected"
        ? `No retrato da AURA, substituir a leitura “${body.originalText}” pela correção do usuário: “${correctedText}”.`
        : `No retrato da AURA, remover e não voltar a usar a leitura “${body.originalText}”.`;
      const correctionType = status === "removed" ? "exclusao" : "rejeicao_hipotese";
      await admin.from("user_memory_corrections").insert({ user_id: userId, correction_text: correctionText, source: `user_portrait_${status}`, confidence: 10, correction_type: correctionType });
      // Mantém a última versão visível; o feedback esconde/substitui a leitura
      // imediatamente enquanto a regeneração acontece em segundo plano.
    }
    await admin.from("portal_value_events").insert({ user_id: userId, feature: "profile", event_type: `hypothesis_${status}`, metadata: { section: body.section } });
    return json({ ok: true, status, correctedText });
  } catch (error) {
    console.error("manage-user-portrait error", error);
    return json({ error: "Não foi possível salvar agora" }, 500);
  }
});