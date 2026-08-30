/**
 * Marca que o lead copiou o código PIX copia-e-cola.
 *
 * Por que existe: `checkout_funnel_events.pix_copy` é anônimo (não tem vínculo
 * com o lead), então era impossível saber QUEM copiou. Quem copiou é o segmento
 * de maior intenção do funil — e o que mais perdemos. Esta função grava
 * `checkout_sessions.pix_copied_at`, que é o que liga o trilho de recuperação
 * "copiou o código" (mensagens de 20 min e 2h).
 *
 * Chamada pelo checkout (cliente anônimo), então:
 *   • sem JWT (verify_jwt = false),
 *   • aceita SOMENTE o id da sessão de checkout — nada de dado do usuário,
 *   • idempotente: só grava se ainda estiver nulo, e só em checkout não concluído.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = String(body.checkoutSessionId || "");
    if (!UUID_RE.test(sessionId)) return json({ error: "checkoutSessionId inválido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase
      .from("checkout_sessions")
      .update({ pix_copied_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("status", "created")
      .is("pix_copied_at", null);

    if (error) {
      console.error("[mark-pix-copied] falha ao gravar:", error.message);
      return json({ ok: false }, 200); // nunca quebra a UX do checkout
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[mark-pix-copied] erro:", err);
    return json({ ok: false }, 200);
  }
});
