/**
 * Dados públicos do encontro avulso de R$ 6,90 (taster).
 *
 * Alimenta a página /pix/:token. Só devolve o que é necessário pra pagar:
 * valor, QR Code, copia-e-cola e status. Nada de telefone, e-mail ou histórico.
 * O token é aleatório (10 caracteres) e serve apenas como endereço da cobrança.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_RE = /^[a-z2-9]{6,32}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const url = new URL(req.url);
    let token = url.searchParams.get("token") || "";
    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = String((body as Record<string, unknown>)?.token || "");
    }
    token = token.trim().toLowerCase();

    if (!TOKEN_RE.test(token)) return json({ error: "Link inválido" }, 400);

    const { data: offer } = await supabase
      .from("taster_offers")
      .select("id, value_cents, qr_image_url, metadata, paid_at, charge_created_at, name")
      .eq("public_token", token)
      .maybeSingle();

    if (!offer) return json({ error: "Link inválido ou expirado" }, 404);

    const copyPaste = String((offer.metadata as Record<string, unknown> | null)?.copy_paste || "");
    // O QR da Woovi vale 24h; depois disso a página pede um código novo no WhatsApp.
    const created = offer.charge_created_at ? new Date(offer.charge_created_at).getTime() : 0;
    const expired = !offer.paid_at && created > 0 && Date.now() - created > 24 * 3600 * 1000;

    return json({
      ok: true,
      valueCents: offer.value_cents ?? 690,
      qrImage: offer.qr_image_url ?? null,
      copyPaste: expired ? null : copyPaste || null,
      paid: !!offer.paid_at,
      expired,
      firstName: offer.name ? String(offer.name).trim().split(/\s+/)[0] : null,
    });
  } catch (err) {
    console.error("[pix-taster-info] fatal:", err);
    return json({ error: "Erro interno" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
