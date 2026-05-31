// Gera o "retrato" curado do usuário para a aba Sobre você do /meu-espaco.
// Lê user_insights + session_themes + profiles, manda pro Gemini Flash com
// schema estruturado e grava em user_portraits. Reaproveita cache via hash.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const STALE_HOURS = 24;

type Insight = {
  category: string;
  key: string | null;
  value: string | null;
  importance: number | null;
  last_mentioned_at: string | null;
};

async function md5(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildPrompt(name: string | null, insights: Insight[], themes: any[]): string {
  const insightLines = insights
    .map((i) => `- [${i.category}] ${i.key ?? "—"}: ${i.value ?? ""} (importância ${i.importance ?? 0})`)
    .join("\n");
  const themeLines = themes
    .map((t) => `- ${t.theme_name} (${t.status}, ${t.session_count}x)`)
    .join("\n");

  return `Você é a Aura escrevendo um RETRATO pessoal do usuário ${name ?? "(sem nome)"} pra ele mesmo ler no portal /meu-espaco.

REGRAS DUROS:
- Português Brasil, informal, voz da Aura ("eu percebi", "você costuma")
- Só use o que está nos dados abaixo. NUNCA invente fato, nome ou evento.
- AGRUPE entradas semanticamente parecidas em UM item (ex: "Padrão de comportamento: adiamento" + "Comportamento: adiamento" viram um só)
- DESCARTE entradas operacionais, fragmentos sem sentido ("Comida: felicidade", "Sorvete: resolveu conflito" só entra se virar uma frase real), keys soltas como "fazer"/"sentir"/"acao"
- Cada item de o_que_te_move/padroes/preferencias deve ser UMA FRASE inteira humana, sem rótulo-chave artificial
- Máx 4 itens por seção. Menos é mais.
- Se não tem sinal pra uma seção, devolve array vazio. Não invente.
- "intro": 1 frase curta (até 140 char) sintetizando quem é a pessoa hoje. Ex: "Eduardo, pai da Bella e da Selena, em transição de hábitos e procurando mais liberdade no dia a dia."
- "pessoas": só relações reais com nome próprio OU com nota de contexto curta. Sem chip vazio.
- "sensiveis": frases curtas e respeitosas; só temas de trauma/medo/dor reais.

SCHEMA (retorne SÓ JSON válido):
{
  "intro": "string",
  "pessoas": [{"label":"Filhas","names":["Bella","Selena"],"nota":"(opcional)"}],
  "o_que_te_move": ["frase 1", "frase 2"],
  "padroes": ["frase 1"],
  "preferencias": ["frase 1"],
  "conquistas": ["frase curta"],
  "sensiveis": ["frase curta"]
}

DADOS BRUTOS (user_insights):
${insightLines || "(nenhum)"}

TEMAS DE SESSÃO:
${themeLines || "(nenhum)"}
`;
}

async function callGemini(prompt: string): Promise<any> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`gemini ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content);
}

function normalize(parsed: any) {
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    intro: typeof parsed.intro === "string" ? parsed.intro.trim() : null,
    pessoas: arr(parsed.pessoas)
      .filter((p: any) => p && typeof p.label === "string")
      .map((p: any) => ({
        label: String(p.label).trim(),
        names: Array.isArray(p.names) ? p.names.filter((n: any) => typeof n === "string") : [],
        nota: typeof p.nota === "string" ? p.nota.trim() : null,
      }))
      .filter((p: any) => p.names.length > 0 || (p.nota && p.nota.length > 0)),
    o_que_te_move: arr(parsed.o_que_te_move).filter((s: any) => typeof s === "string").map((s: string) => s.trim()).slice(0, 4),
    padroes: arr(parsed.padroes).filter((s: any) => typeof s === "string").map((s: string) => s.trim()).slice(0, 4),
    preferencias: arr(parsed.preferencias).filter((s: any) => typeof s === "string").map((s: string) => s.trim()).slice(0, 4),
    conquistas: arr(parsed.conquistas).filter((s: any) => typeof s === "string").map((s: string) => s.trim()).slice(0, 6),
    sensiveis: arr(parsed.sensiveis).filter((s: any) => typeof s === "string").map((s: string) => s.trim()).slice(0, 4),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, force } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. Carrega dados brutos
    const [{ data: insights }, { data: themes }, { data: profile }] = await Promise.all([
      supa.from("user_insights")
        .select("category, key, value, importance, last_mentioned_at")
        .eq("user_id", user_id)
        .neq("category", "contexto")
        .order("importance", { ascending: false })
        .limit(200),
      supa.from("session_themes")
        .select("theme_name, status, session_count")
        .eq("user_id", user_id)
        .order("session_count", { ascending: false })
        .limit(40),
      supa.from("profiles").select("name").eq("user_id", user_id).maybeSingle(),
    ]);

    const insightsArr = (insights || []) as Insight[];
    const themesArr = themes || [];

    // 2. Hash de versão pra cache
    const versionInput = JSON.stringify({
      i: insightsArr.map((x) => [x.category, x.key, x.value, x.importance]),
      t: themesArr.map((x: any) => [x.theme_name, x.status, x.session_count]),
    });
    const version = await md5(versionInput);

    // 3. Cache hit?
    if (!force) {
      const { data: existing } = await supa
        .from("user_portraits")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();
      if (existing) {
        const ageHours = (Date.now() - new Date(existing.generated_at).getTime()) / 36e5;
        if (existing.insights_version === version && ageHours < STALE_HOURS * 7) {
          return new Response(JSON.stringify({ portrait: existing, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // 4. Sem dados? grava retrato vazio
    if (insightsArr.length === 0 && themesArr.length === 0) {
      const empty = {
        user_id, intro: null, pessoas: [], o_que_te_move: [], padroes: [],
        preferencias: [], conquistas: [], sensiveis: [], insights_version: version,
        generated_at: new Date().toISOString(),
      };
      await supa.from("user_portraits").upsert(empty);
      return new Response(JSON.stringify({ portrait: empty, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Gera via LLM
    const prompt = buildPrompt(profile?.name ?? null, insightsArr, themesArr);
    const parsed = await callGemini(prompt);
    const norm = normalize(parsed);

    const row = {
      user_id,
      ...norm,
      insights_version: version,
      generated_at: new Date().toISOString(),
    };
    const { error: upErr } = await supa.from("user_portraits").upsert(row);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ portrait: row, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-user-portrait error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});