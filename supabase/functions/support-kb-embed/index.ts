import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[SUPPORT-KB-EMBED] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

/**
 * Generates a 768-dim embedding for a KB article using Gemini text-embedding-004
 * via Google Generative Language API. Stores it in support_knowledge_base.embedding.
 *
 * Body: { id: string }  -> re-embeds an existing article
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { id } = await req.json();
    if (!id) throw new Error("id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: article, error: aErr } = await supabase
      .from("support_knowledge_base")
      .select("id, title, question, answer, keywords, category")
      .eq("id", id)
      .single();
    if (aErr || !article) throw new Error(`Article not found: ${aErr?.message}`);

    // Concatenate fields with weighting (title + question repeated for emphasis)
    const text = [
      article.title,
      article.title,
      article.question,
      article.question,
      `Categoria: ${article.category}`,
      `Palavras-chave: ${(article.keywords || []).join(", ")}`,
      article.answer,
    ].filter(Boolean).join("\n\n");

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_CLOUD_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY/GOOGLE_CLOUD_API_KEY not configured");

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        }),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Gemini embedding API ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const embedding: number[] | undefined = data?.embedding?.values;
    if (!embedding || embedding.length !== 768) {
      throw new Error(`Invalid embedding response (got ${embedding?.length ?? 0} dims)`);
    }

    const { error: uErr } = await supabase
      .from("support_knowledge_base")
      .update({ embedding: embedding as unknown as string })
      .eq("id", id);
    if (uErr) throw uErr;

    log("Embedding stored", { id, dims: embedding.length });

    return new Response(JSON.stringify({ ok: true, dims: embedding.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Error", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});