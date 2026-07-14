// Edge function TEMPORÁRIA para auditoria visual do portal.
// Gera magic link para um email arbitrário, protegida por INTERNAL_WEBHOOK_SECRET.
// APAGAR após o uso.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== Deno.env.get("INTERNAL_WEBHOOK_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { email, redirect_to } = await req.json();
  if (!email) {
    return new Response(JSON.stringify({ error: "email required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: redirect_to || "http://localhost:8080/meu-espaco" },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ action_link: data.properties?.action_link }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});