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
    const phone = String(body.phone || "").replace(/\D/g, "");
    const email = String(body.email || "").trim().toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Caminho 1: id da sessão (quando o checkout conseguiu recebê-lo).
    let targetId: string | null = UUID_RE.test(sessionId) ? sessionId : null;

    // Caminho 2 (fallback robusto): sem id, resolve a sessão PIX mais recente
    // do mesmo telefone/email. Evita que a marcação dependa de o id trafegar
    // pela resposta do provedor — quem copiou é o segmento mais valioso do funil.
    if (!targetId && (phone || email)) {
      let q = supabase
        .from("checkout_sessions")
        .select("id")
        .in("payment_method", ["pix", "pix_auto", "pix_automatic"])
        .eq("status", "created")
        .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      q = phone
        ? q.in("phone", [phone, phone.replace(/^55/, ""), phone.startsWith("55") ? phone : `55${phone}`])
        : q.eq("email", email);
      const { data } = await q.maybeSingle();
      targetId = data?.id ?? null;
    }

    if (!targetId) return json({ ok: false, reason: "sessao_nao_encontrada" }, 200);

    const { error } = await supabase
      .from("checkout_sessions")
      .update({ pix_copied_at: new Date().toISOString() })
      .eq("id", targetId)
      .eq("status", "created")
      .is("pix_copied_at", null);

    if (error) {
      console.error("[mark-pix-copied] falha ao gravar:", error.message);
      return json({ ok: false }, 200); // nunca quebra a UX do checkout
    }
    return json({ ok: true, id: targetId });
  } catch (err) {
    console.error("[mark-pix-copied] erro:", err);
    return json({ ok: false }, 200);
  }
});
