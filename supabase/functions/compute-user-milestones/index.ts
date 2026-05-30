// ============================================================================
// compute-user-milestones
// ----------------------------------------------------------------------------
// CRON: diário, 6h BRT (9h UTC).
// Marcos DETERMINÍSTICOS (sem LLM), baseados em contagens e eventos:
//   - 1ª sessão concluída
//   - 5ª / 10ª / 25ª / 50ª sessão concluída
//   - 1º experimento (closure_type = 'experimento')
//   - 1ª tese (closure_type = 'tese')
//   - tema marcado como 'resolved'
//   - 30 / 90 dias de jornada com a Aura
// Idempotente: usa milestone_text único por user para evitar duplicatas.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Marco = { text: string; date: string; excerpt?: string | null };

const SESSION_COUNT_MARCOS: Record<number, string> = {
  1: "Você fez sua primeira sessão com a Aura.",
  5: "Você chegou na 5ª sessão — começou a virar prática.",
  10: "Você completou 10 sessões com a Aura.",
  25: "Você passou de 25 sessões — virou ritual.",
  50: "50 sessões depois, você segue mostrando pra si mesmo que esse espaço importa.",
};

const JOURNEY_DAY_MARCOS: Record<number, string> = {
  30: "1 mês de jornada com a Aura.",
  90: "3 meses de jornada com a Aura.",
  180: "6 meses de jornada com a Aura.",
  365: "1 ano de jornada com a Aura.",
};

async function computeForUser(supabase: any, userId: string, createdAt: string): Promise<number> {
  const candidates: Marco[] = [];

  // Marcos já existentes (texto normalizado)
  const { data: existing } = await supabase
    .from("user_milestones")
    .select("milestone_text")
    .eq("user_id", userId);
  const existingTexts = new Set(
    (existing || []).map((m: any) => String(m.milestone_text || "").trim().toLowerCase()),
  );

  // Sessões completas ordenadas
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, ended_at, closure_type, closure_text, reframe_text")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("ended_at", { ascending: true });

  const completed = sessions || [];

  // (1) Marcos por contagem de sessão
  for (const n of Object.keys(SESSION_COUNT_MARCOS).map(Number)) {
    if (completed.length >= n) {
      const s = completed[n - 1];
      candidates.push({
        text: SESSION_COUNT_MARCOS[n],
        date: s.ended_at || new Date().toISOString(),
      });
    }
  }

  // (2) Primeiro de cada closure_type relevante
  const firstExperimento = completed.find((s: any) => s.closure_type === "experimento");
  if (firstExperimento) {
    candidates.push({
      text: "Você topou seu primeiro experimento em sessão.",
      date: firstExperimento.ended_at,
      excerpt: firstExperimento.closure_text || null,
    });
  }
  const firstTese = completed.find((s: any) => s.closure_type === "tese");
  if (firstTese) {
    candidates.push({
      text: "Você fechou sua primeira sessão com uma tese.",
      date: firstTese.ended_at,
      excerpt: firstTese.closure_text || null,
    });
  }
  const firstEncruzilhada = completed.find((s: any) => s.closure_type === "encruzilhada");
  if (firstEncruzilhada) {
    candidates.push({
      text: "Você encarou sua primeira encruzilhada em sessão.",
      date: firstEncruzilhada.ended_at,
      excerpt: firstEncruzilhada.closure_text || null,
    });
  }

  // (3) Temas resolvidos
  const { data: resolvedThemes } = await supabase
    .from("session_themes")
    .select("theme_name, last_mentioned_at")
    .eq("user_id", userId)
    .eq("status", "resolved");

  for (const t of resolvedThemes || []) {
    candidates.push({
      text: `Um tema seu deu sinal de virada: ${t.theme_name}.`,
      date: t.last_mentioned_at || new Date().toISOString(),
    });
  }

  // (4) Marcos por dias de jornada
  if (createdAt) {
    const start = new Date(createdAt).getTime();
    const now = Date.now();
    const days = Math.floor((now - start) / (24 * 60 * 60 * 1000));
    for (const d of Object.keys(JOURNEY_DAY_MARCOS).map(Number)) {
      if (days >= d) {
        candidates.push({
          text: JOURNEY_DAY_MARCOS[d],
          date: new Date(start + d * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  // Insere só os que ainda não existem
  let inserted = 0;
  for (const m of candidates) {
    const key = m.text.trim().toLowerCase();
    if (existingTexts.has(key)) continue;
    const { error } = await supabase.from("user_milestones").insert({
      user_id: userId,
      milestone_text: m.text,
      milestone_date: m.date,
      source: "deterministic",
      context_excerpt: m.excerpt || null,
    });
    if (!error) {
      inserted++;
      existingTexts.add(key);
    }
  }

  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  console.log("🏁 [compute-user-milestones] starting");

  // Permite alvo específico
  let targetUserId: string | null = null;
  try {
    const body = await req.json();
    targetUserId = body?.userId || null;
  } catch {
    // sem body
  }

  let users: any[] = [];
  if (targetUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, created_at")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (data) users = [data];
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, created_at, status")
      .in("status", ["active", "trial"]);
    users = data || [];
  }

  let processed = 0;
  let totalInserted = 0;

  for (const u of users) {
    try {
      const inserted = await computeForUser(supabase, u.user_id, u.created_at);
      totalInserted += inserted;
      processed++;
      if (inserted > 0) console.log(`🏆 ${inserted} marco(s) determinístico(s) p/ ${u.user_id}`);
    } catch (e) {
      console.error(`❌ Erro ${u.user_id}:`, e);
    }
  }

  const summary = { status: "done", processed, totalInserted };
  console.log("📊 [compute-user-milestones]", summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});