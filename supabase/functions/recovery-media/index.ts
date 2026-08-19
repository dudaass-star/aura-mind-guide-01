/**
 * Proxy autenticado de mídia da subconta Twilio de recuperação.
 *
 * O link cru de mídia do Twilio exige Basic Auth (abre a tela de login da API).
 * Aqui o admin autenticado pede o arquivo e a função busca com as credenciais
 * da subconta, devolvendo os bytes direto pro navegador.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: claimsData.claims.sub, _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url: string = (body as any)?.url || new URL(req.url).searchParams.get("url") || "";
    if (!url) return json({ error: "url obrigatória" }, 400);

    let parsed: URL;
    try { parsed = new URL(url); } catch { return json({ error: "url inválida" }, 400); }
    const allowed = ["api.twilio.com", "media.twiliocdn.com", "mcs.us1.twilio.com"];
    if (!allowed.includes(parsed.hostname)) return json({ error: "host não permitido" }, 400);

    const sid = Deno.env.get("TWILIO_RECOVERY_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_RECOVERY_AUTH_TOKEN");
    if (!sid || !authToken) return json({ error: "credenciais de recuperação ausentes" }, 500);

    const res = await fetch(parsed.toString(), {
      headers: { Authorization: `Basic ${btoa(`${sid}:${authToken}`)}` },
      redirect: "follow",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`recovery-media falhou [${res.status}]: ${text.slice(0, 300)}`);
      return json({ error: "Falha ao buscar mídia", status: res.status, details: text.slice(0, 300) }, res.status);
    }

    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("recovery-media erro:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
