/**
 * criar-pix-taster — cobrança avulsa de R$ 6,90 do encontro guiado (taster).
 *
 * Chamada apenas por processos internos (recovery-agent e o roteador de botões
 * do trilho PIX). Nunca exposta na UX do site: a oferta é carta na manga de
 * conversa, não item de vitrine.
 *
 * dryRun: calcula elegibilidade e valor SEM criar cobrança — é assim que o
 * trilho é validado antes de ser ligado.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkTasterEligibility, createTasterCharge, TASTER_VALUE_CENTS } from "../_shared/taster.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const phone = String(body.phone || "").trim();
    const dryRun = body.dryRun === true;
    const source = typeof body.source === "string" ? body.source : "porta_a";

    if (!phone) {
      return json({ ok: false, reason: "phone_obrigatorio" }, 400);
    }

    const elig = await checkTasterEligibility(supabase, {
      phone,
      email: (body.email as string) || null,
      checkoutSessionId: (body.checkoutSessionId as string) || null,
    });

    if (dryRun) {
      return json({
        ok: true, dry_run: true, value_cents: TASTER_VALUE_CENTS,
        eligible: elig.eligible, reason: elig.reason, checkout: elig.checkout ?? null,
      });
    }

    if (!elig.eligible) {
      console.log(`[criar-pix-taster] bloqueado phone=${elig.phone.slice(0, 6)}*** motivo=${elig.reason}`);
      return json({ ok: false, eligible: false, reason: elig.reason });
    }

    const charge = await createTasterCharge(supabase, {
      phone: elig.phone,
      name: (body.name as string) || elig.checkout?.name || null,
      email: (body.email as string) || elig.checkout?.email || null,
      cpf: (body.cpf as string) || null,
      plan: elig.checkout?.plan ?? null,
      billing: elig.checkout?.billing ?? null,
      checkoutSessionId: elig.checkout?.id ?? null,
      source,
    });

    if (!charge.ok) {
      console.error(`[criar-pix-taster] falha: ${charge.reason} ${charge.error ?? ""}`);
      return json({ ok: false, reason: charge.reason, error: charge.error ?? null });
    }

    console.log(`[criar-pix-taster] código gerado phone=${elig.phone.slice(0, 6)}*** corr=${charge.correlationId}`);
    return json({
      ok: true, copyPaste: charge.copyPaste, correlationId: charge.correlationId,
      value_cents: TASTER_VALUE_CENTS, offerId: charge.offerId ?? null, reason: charge.reason ?? "criado",
    });
  } catch (err) {
    console.error("[criar-pix-taster] fatal:", err);
    return json({ ok: false, error: (err as Error)?.message || "internal" }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
