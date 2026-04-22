import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[SUPPORT-KB-SEARCH] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

/**
 * Generates an embedding for an arbitrary query string and returns the top-N
 * matching KB articles via the match_support_kb SQL function.
 *
 * Body: { query: string, threshold?: number, count?: number }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const query: string = body.query;
    const threshold: number = typeof body.threshold === "number" ? body.threshold : 0.6;
    const count: number = typeof body.count === "number" ? body.count : 5;
    if (!query || typeof query !== "string") throw new Error("query (string) required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const apiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_CLOUD_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY/GOOGLE_CLOUD_API_KEY not configured");

    const embResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: query }] },
          outputDimensionality: 768,
        }),
      },
    );
    if (!embResp.ok) throw new Error(`Embedding API ${embResp.status}: ${await embResp.text()}`);
    const embData = await embResp.json();
    const embedding: number[] = embData?.embedding?.values || [];
    if (embedding.length !== 768) throw new Error(`Invalid embedding (${embedding.length} dims)`);

    const { data: matches, error: mErr } = await supabase.rpc("match_support_kb", {
      query_embedding: embedding as unknown as string,
      match_threshold: threshold,
      match_count: count,
    });
    if (mErr) throw mErr;

    log("Search done", { query: query.slice(0, 80), threshold, hits: matches?.length || 0 });

    return new Response(JSON.stringify({ ok: true, matches: matches || [] }), {
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