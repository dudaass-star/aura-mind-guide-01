// Resolve um token legado `/meu-espaco?t=<token>` para o email do usuário,
// permitindo pré-preencher o login OTP em vez de deixar o cliente travado.
// Read-only: não cria sessão, apenas devolve o email mascarado e o profile id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("t");
    if (!token && (req.method === "POST" || req.method === "PUT")) {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.token === "string") token = body.token;
    }
    if (!token || token.length < 8) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tokenRow, error: tokenErr } = await admin
      .from("user_portal_tokens")
      .select("user_id")
      .eq("token", token)
      .maybeSingle();

    if (tokenErr) {
      console.error("resolve-portal-token lookup error", tokenErr);
      return new Response(JSON.stringify({ error: "lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!tokenRow) {
      return new Response(JSON.stringify({ resolved: false, reason: "not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email, name")
      .eq("user_id", tokenRow.user_id)
      .maybeSingle();

    if (!profile?.email) {
      return new Response(JSON.stringify({ resolved: false, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        resolved: true,
        email: profile.email,
        firstName: profile.name?.split(" ")[0] ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("resolve-portal-token error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});