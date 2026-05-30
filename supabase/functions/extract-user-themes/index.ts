// ============================================================================
// extract-user-themes
// ----------------------------------------------------------------------------
// CRON: diário, 5h BRT (8h UTC).
// Para cada usuário ativo, lê as últimas 5 sessões completas (com closure)
// e usa Gemini Flash-Lite para identificar 1-5 temas recorrentes.
// Faz UPSERT em session_themes (incrementa session_count e atualiza
// last_mentioned_at quando o tema reaparece). Marca como 'resolved' temas
// que não aparecem há 60+ dias.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractThemesForUser(supabase: any, userId: string): Promise<{ upserted: number; resolved: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { upserted: 0, resolved: 0 };

  // Últimas 5 sessões completas com algum sinal de conteúdo
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, ended_at, theme_label, focus_topic, session_summary, reframe_text, closure_text")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("ended_at", { ascending: false })
    .limit(5);

  if (!sessions || sessions.length === 0) return { upserted: 0, resolved: 0 };

  // Monta corpus compacto
  const corpus = sessions
    .map((s: any, i: number) => {
      const parts = [
        s.theme_label ? `tema: ${s.theme_label}` : null,
        s.focus_topic ? `foco: ${s.focus_topic}` : null,
        s.session_summary ? `resumo: ${String(s.session_summary).substring(0, 600)}` : null,
        s.reframe_text ? `reframe: ${String(s.reframe_text).substring(0, 400)}` : null,
        s.closure_text ? `fechamento: ${String(s.closure_text).substring(0, 240)}` : null,
      ].filter(Boolean).join(" | ");
      return `Sessão ${i + 1} (${s.ended_at?.substring(0, 10) || "?"}): ${parts}`;
    })
    .join("\n")
    .substring(0, 12000);

  const systemPrompt = `Você é um analista que identifica TEMAS RECORRENTES em sessões terapêuticas.

Um tema é um padrão emocional ou existencial que atravessa MAIS DE UMA sessão. Exemplos: "medo de errar no trabalho", "relação com a mãe", "sensação de paralisia para decidir", "auto-cobrança".

REGRAS:
- Retorne 1 a 5 temas. Use PT-BR, frases curtas (3-7 palavras), em minúsculas, sem aspas.
- Use linguagem do usuário/sessão, não jargão clínico.
- NÃO invente temas que não estão no material. Se houver menos sinal, retorne menos temas.
- Cada tema deve ser único e específico (não "ansiedade" genérico — "ansiedade antes de reuniões").`;

  const userPrompt = `Sessões recentes:\n\n${corpus}\n\nIdentifique os temas recorrentes.`;

  let extractedThemes: string[] = [];
  try {
    const resp = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_themes",
            description: "Emite até 5 temas recorrentes.",
            parameters: {
              type: "object",
              properties: {
                themes: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string", description: "Tema curto, 3-7 palavras, minúsculas" },
                },
              },
              required: ["themes"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_themes" } },
      }),
    });

    if (!resp.ok) {
      console.error(`❌ AI ${resp.status} user ${userId}:`, (await resp.text()).substring(0, 200));
      return { upserted: 0, resolved: 0 };
    }
    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return { upserted: 0, resolved: 0 };
    const args = JSON.parse(toolCall.function.arguments);
    extractedThemes = (Array.isArray(args.themes) ? args.themes : [])
      .map((t: any) => String(t || "").trim().toLowerCase().substring(0, 80))
      .filter((t: string) => t.length >= 3 && t.length <= 80);
  } catch (e) {
    console.error(`❌ Extract exception user ${userId}:`, e);
    return { upserted: 0, resolved: 0 };
  }

  if (extractedThemes.length === 0) return { upserted: 0, resolved: 0 };

  // Carrega temas existentes pra fazer fuzzy match (norma sem acento)
  const { data: existing } = await supabase
    .from("session_themes")
    .select("id, theme_name, session_count, status")
    .eq("user_id", userId);

  const existingMap = new Map<string, any>();
  for (const row of existing || []) {
    existingMap.set(norm(row.theme_name), row);
  }

  let upserted = 0;
  const now = new Date().toISOString();
  const matchedIds = new Set<string>();

  for (const theme of extractedThemes) {
    const key = norm(theme);
    const match = existingMap.get(key);
    if (match) {
      matchedIds.add(match.id);
      const { error } = await supabase
        .from("session_themes")
        .update({
          last_mentioned_at: now,
          session_count: (match.session_count || 1) + 1,
          status: "active",
        })
        .eq("id", match.id);
      if (!error) upserted++;
    } else {
      const { error } = await supabase.from("session_themes").insert({
        user_id: userId,
        theme_name: theme,
        status: "active",
        first_mentioned_at: now,
        last_mentioned_at: now,
        session_count: 1,
      });
      if (!error) upserted++;
    }
  }

  // Marca como 'resolved' temas ativos sem menção há 60+ dias
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("session_themes")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .lt("last_mentioned_at", sixtyDaysAgo);

  let resolved = 0;
  for (const row of stale || []) {
    if (matchedIds.has(row.id)) continue;
    const { error } = await supabase
      .from("session_themes")
      .update({ status: "resolved", resolution_notes: "sem menção há 60+ dias" })
      .eq("id", row.id);
    if (!error) resolved++;
  }

  return { upserted, resolved };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  console.log("🎯 [extract-user-themes] starting");

  // Suporta payload opcional { userId } para reprocesso pontual
  let targetUserId: string | null = null;
  try {
    const body = await req.json();
    targetUserId = body?.userId || null;
  } catch {
    // sem body, segue em modo batch
  }

  let users: any[] = [];
  if (targetUserId) {
    users = [{ user_id: targetUserId }];
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, status")
      .in("status", ["active", "trial"]);
    users = data || [];
  }

  let processed = 0;
  let totalUpserted = 0;
  let totalResolved = 0;

  for (const u of users) {
    try {
      const { upserted, resolved } = await extractThemesForUser(supabase, u.user_id);
      totalUpserted += upserted;
      totalResolved += resolved;
      processed++;
      if (upserted || resolved) {
        console.log(`✨ user ${u.user_id}: +${upserted} temas, ${resolved} resolvidos`);
      }
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      console.error(`❌ Erro processando ${u.user_id}:`, e);
    }
  }

  const summary = { status: "done", processed, totalUpserted, totalResolved };
  console.log("📊 [extract-user-themes]", summary);

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});