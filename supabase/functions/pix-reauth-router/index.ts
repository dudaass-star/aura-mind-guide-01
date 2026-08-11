// Edge function: roteador da reautorização de PIX Automático.
//
// A página /reautorizar-pix só conhece o token do portal — quem sabe se o cliente
// está no trilho Asaas ou Inter é o backend (`profiles.card_gateway`). Sem este
// roteador, cliente do Inter batia sempre no Asaas e o link do dunning morria.
//
// Duas ações:
//   • create (default) → gera o QR composto no gateway certo
//   • status           → informa se a autorização/pagamento já foi confirmado
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const token = body.token;
    const action = body.action || "create";
    if (!token) return json({ error: "Token ausente" }, 400);

    const { data: tokenRow } = await supabase
      .from("user_portal_tokens").select("user_id").eq("token", token).maybeSingle();
    if (!tokenRow?.user_id) return json({ error: "Link inválido ou expirado" }, 400);

    const { data: profile } = await supabase
      .from("profiles").select("id, user_id, card_gateway")
      .eq("user_id", tokenRow.user_id).maybeSingle();
    if (!profile) return json({ error: "Cadastro não encontrado" }, 404);

    const gateway = profile.card_gateway === "inter" ? "inter" : "asaas";

    if (action === "status") {
      if (gateway === "inter") {
        // No Inter a confirmação é o pagamento do QR composto (ciclo mais recente
        // do mandato novo) — o mandato só fica APROVADA depois disso.
        const { data: rec } = await supabase
          .from("inter_pix_recurrences").select("id_rec, status")
          .eq("user_id", profile.id).is("replaced_by_id_rec", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!rec?.id_rec) return json({ state: "pending", status: "PENDING" });
        const { data: charge } = await supabase
          .from("inter_pix_charges").select("paid_at, status")
          .eq("id_rec", rec.id_rec).order("cycle_index", { ascending: true })
          .limit(1).maybeSingle();
        const paid = !!charge?.paid_at;
        return json({
          state: paid ? "active" : "pending",
          status: paid ? "CONFIRMED" : (rec.status || "PENDING"),
          gateway,
        });
      }
      const { data: st } = await supabase.functions.invoke("asaas-pix-auto-status", {
        body: { authorizationId: body.authorizationId },
      });
      return json({ ...(st as object), gateway });
    }

    const fn = gateway === "inter"
      ? "criar-pix-recorrente-inter"
      : "criar-pix-recorrente-asaas";
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { mode: "reauthorize", token },
    });
    if (error) {
      console.error(`[pix-reauth-router] ${fn} falhou:`, error.message);
      return json({ error: "Não conseguimos gerar o QR Code agora. Tente em alguns minutos." }, 502);
    }
    if ((data as Record<string, unknown>)?.error) return json(data, 400);
    return json({ ...(data as object), gateway });
  } catch (err) {
    console.error("[pix-reauth-router] erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
