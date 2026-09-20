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
import { findRetentionOfferByCode, recordRetentionOfferEvent } from "../_shared/retention-offers.ts";

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
    let token = body.token;
    const retentionCode = body.retentionCode;
    const action = body.action || "create";
    const retentionOffer = retentionCode ? await findRetentionOfferByCode(supabase, retentionCode) : null;
    if (retentionCode && !retentionOffer) return json({ error: "Oferta inválida ou expirada" }, 400);
    if (!token && retentionOffer?.profile_user_id) {
      const { data: portal } = await supabase.from("user_portal_tokens").select("token")
        .eq("user_id", retentionOffer.profile_user_id).maybeSingle();
      token = portal?.token;
    }
    if (!token) return json({ error: "Token ausente" }, 400);

    const { data: tokenRow } = await supabase
      .from("user_portal_tokens").select("user_id").eq("token", token).maybeSingle();
    if (!tokenRow?.user_id) return json({ error: "Link inválido ou expirado" }, 400);

    const { data: profile } = await supabase
      .from("profiles").select("id, user_id, card_gateway")
      .eq("user_id", tokenRow.user_id).maybeSingle();
    if (!profile) return json({ error: "Cadastro não encontrado" }, 404);

    const gateway = profile.card_gateway === "inter"
      ? "inter"
      : profile.card_gateway === "woovi"
        ? "woovi"
        : "asaas";
    // Oferta de retenção: o mandato novo nasce já no valor reduzido (no PIX não
    // existe cupom). Só a Woovi suporta hoje.
    const requestedOffer = retentionOffer?.tier || body.offer;
    const offer = ["discount_30", "lite", "base"].includes(String(requestedOffer))
      ? String(requestedOffer)
      : null;

    if (action === "status") {
      if (gateway === "woovi") {
        // Confirmação = pagamento da entrada do mandato novo (Jornada 3: um
        // scan cobra e autoriza), então olhamos a cobrança mais recente.
        const { data: sub } = await supabase
          .from("woovi_subscriptions").select("subscription_id, status")
          .eq("user_id", profile.id).is("replaced_by_subscription_id", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!sub?.subscription_id) return json({ state: "pending", status: "PENDING", gateway });
        const { data: charge } = await supabase
          .from("woovi_charges").select("paid_at, status")
          .eq("subscription_id", sub.subscription_id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const paid = !!charge?.paid_at;
        return json({
          state: paid ? "active" : "pending",
          status: paid ? "CONFIRMED" : (sub.status || "PENDING"),
          gateway,
        });
      }
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
      : gateway === "woovi"
        ? "criar-pix-recorrente-woovi"
        : "criar-pix-recorrente-asaas";
    const { data, error } = await supabase.functions.invoke(fn, {
      body: offer && gateway === "woovi"
        ? { mode: "offer", offer, token, retentionOfferId: retentionOffer?.id || "" }
        : { mode: "reauthorize", token },
    });
    if (error) {
      console.error(`[pix-reauth-router] ${fn} falhou:`, error.message);
      return json({ error: "Não conseguimos gerar o QR Code agora. Tente em alguns minutos." }, 502);
    }
    if ((data as Record<string, unknown>)?.error) return json(data, 400);
    if (retentionOffer?.id && gateway === "woovi") {
      const authorizationId = String((data as Record<string, unknown>)?.authorizationId || "");
      await supabase.from("retention_offers").update({ provider_subscription_id: authorizationId || null }).eq("id", retentionOffer.id);
      await recordRetentionOfferEvent(supabase, retentionOffer.id, "accepted", "pix_reauth", authorizationId || null);
      await recordRetentionOfferEvent(supabase, retentionOffer.id, "payment_pending", "pix_reauth", authorizationId || null);
    }
    return json({ ...(data as object), gateway });
  } catch (err) {
    console.error("[pix-reauth-router] erro:", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
