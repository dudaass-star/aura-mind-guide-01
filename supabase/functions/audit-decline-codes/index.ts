import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// BIN ranges → banco emissor (parcial; cobre os principais BR)
// Referência: BINs públicos brasileiros. Para BINs não mapeados, mostramos só o BIN bruto.
const BIN_TO_BANK: Record<string, string> = {
  "515104": "Itaú",
  "549167": "Itaú",
  "552192": "Itaú",
  "636368": "Nubank",
  "650487": "Nubank",
  "536518": "Nubank",
  "627780": "Nubank",
  "467522": "Bradesco",
  "552532": "Bradesco",
  "548926": "Bradesco",
  "498419": "Santander",
  "552402": "Santander",
  "510917": "Caixa Econômica",
  "412138": "Banco do Brasil",
  "498408": "Banco do Brasil",
  "528421": "Banco do Brasil",
  "636297": "Mercado Pago",
  "504175": "Will Bank",
  "528933": "C6 Bank",
  "534818": "C6 Bank",
  "650462": "Inter",
  "627892": "Inter",
  "637095": "PicPay",
  "650513": "Original",
};

function labelBin(bin: string): string {
  return BIN_TO_BANK[bin] ? `${bin} (${BIN_TO_BANK[bin]})` : bin;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    // Permite override do range via body { days: 30 }
    let days = 30;
    try {
      const body = await req.json();
      if (body?.days && Number.isInteger(body.days) && body.days > 0 && body.days <= 90) {
        days = body.days;
      }
    } catch { /* sem body, usa default */ }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const sinceTs = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

    console.log(`[AUDIT-DECLINES] Scanning failed invoices/charges from last ${days}d (since ${new Date(sinceTs * 1000).toISOString()})`);

    // 1) Lista invoices que falharam ou ficaram em aberto
    const failedInvoices: Stripe.Invoice[] = [];
    let hasMore = true;
    let startingAfter: string | undefined = undefined;
    let pages = 0;
    const MAX_PAGES = 10; // hard limit p/ não estourar timeout

    while (hasMore && pages < MAX_PAGES) {
      const page: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
        limit: 100,
        created: { gte: sinceTs },
        ...(startingAfter && { starting_after: startingAfter }),
      });
      for (const inv of page.data) {
        if (inv.status === "open" || inv.status === "uncollectible") {
          failedInvoices.push(inv);
        } else if (inv.attempt_count > 1 && (inv.status === "paid" || inv.status === "draft")) {
          // Recuperadas após retry: também relevantes
          failedInvoices.push(inv);
        }
      }
      hasMore = page.has_more;
      if (hasMore) startingAfter = page.data[page.data.length - 1]?.id;
      pages++;
    }

    console.log(`[AUDIT-DECLINES] Found ${failedInvoices.length} candidate invoices`);

    const byDeclineCode: Record<string, number> = {};
    const byBankBin: Record<string, number> = {};
    const byBrand: Record<string, number> = {};
    const byNetworkStatus: Record<string, number> = {};
    const byInvoiceStatus: Record<string, number> = {};
    const samples: Array<{
      invoice_id: string;
      customer: string | null;
      amount: number;
      decline_code: string | null;
      network_status: string | null;
      bank: string;
      brand: string;
      created: string;
    }> = [];

    let analyzed = 0;
    let totalFailedCharges = 0;

    for (const inv of failedInvoices) {
      byInvoiceStatus[inv.status || "unknown"] = (byInvoiceStatus[inv.status || "unknown"] || 0) + 1;

      // Pega a charge mais recente do invoice (seja sucesso ou falha)
      const chargeId = (inv as any).charge as string | undefined;
      if (!chargeId) continue;

      try {
        const charge = await stripe.charges.retrieve(chargeId, {
          expand: ["payment_method_details"],
        });
        analyzed++;

        // Conta só falhas reais (status: failed) ou outcomes não-aprovados
        const failed = charge.status === "failed" || charge.outcome?.network_status !== "approved_by_network";
        if (!failed) continue;
        totalFailedCharges++;

        const declineCode = charge.outcome?.reason || charge.failure_code || charge.outcome?.type || "unknown";
        byDeclineCode[declineCode] = (byDeclineCode[declineCode] || 0) + 1;

        const networkStatus = charge.outcome?.network_status || "unknown";
        byNetworkStatus[networkStatus] = (byNetworkStatus[networkStatus] || 0) + 1;

        const card: any = charge.payment_method_details?.card;
        const bin: string = card?.bin || (card?.last4 ? "unknown" : "no_card");
        const brand: string = card?.brand || "unknown";

        const binKey = labelBin(bin);
        byBankBin[binKey] = (byBankBin[binKey] || 0) + 1;
        byBrand[brand] = (byBrand[brand] || 0) + 1;

        if (samples.length < 25) {
          samples.push({
            invoice_id: inv.id,
            customer: typeof inv.customer === "string" ? inv.customer : null,
            amount: (inv.amount_due || charge.amount || 0) / 100,
            decline_code: declineCode,
            network_status: networkStatus,
            bank: binKey,
            brand,
            created: new Date(charge.created * 1000).toISOString(),
          });
        }
      } catch (chErr) {
        console.warn(`[AUDIT-DECLINES] Failed to retrieve charge ${chargeId}:`, chErr instanceof Error ? chErr.message : chErr);
      }
    }

    // Ordena os rankings descendente
    const sortDesc = (obj: Record<string, number>) =>
      Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));

    // Insight automatizado
    const totalDeclines = totalFailedCharges;
    const doNotHonorPct = totalDeclines > 0
      ? Math.round(((byDeclineCode["do_not_honor"] || 0) / totalDeclines) * 100)
      : 0;
    const insufficientPct = totalDeclines > 0
      ? Math.round(((byDeclineCode["insufficient_funds"] || 0) / totalDeclines) * 100)
      : 0;

    let insight = "";
    if (totalDeclines === 0) {
      insight = "Nenhuma falha encontrada no período — saudável ou range curto demais.";
    } else if (doNotHonorPct >= 50) {
      insight = `${doNotHonorPct}% das recusas são 'do_not_honor' — forte indicador de problema MIT/3DS (banco bloqueando preventivamente). Considerar habilitar 3DS forte ('any') e validar Network Tokens no Dashboard.`;
    } else if (insufficientPct >= 40) {
      insight = `${insufficientPct}% das recusas são por saldo insuficiente — problema de público/timing, não técnico. Smart Retries deve recuperar parte; trocar gateway não resolve.`;
    } else {
      insight = `Distribuição mista: ${doNotHonorPct}% do_not_honor, ${insufficientPct}% insufficient_funds. Investigar bancos top do ranking individualmente.`;
    }

    const result = {
      period_days: days,
      scanned_invoices: failedInvoices.length,
      analyzed_charges: analyzed,
      total_failed_charges: totalFailedCharges,
      by_decline_code: sortDesc(byDeclineCode),
      by_network_status: sortDesc(byNetworkStatus),
      by_bank_bin: sortDesc(byBankBin),
      by_brand: sortDesc(byBrand),
      by_invoice_status: sortDesc(byInvoiceStatus),
      actionable_insight: insight,
      samples,
      generated_at: new Date().toISOString(),
    };

    console.log(`[AUDIT-DECLINES] Done. ${totalFailedCharges} failed charges. Top decline: ${Object.keys(result.by_decline_code)[0] || "n/a"}`);

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[AUDIT-DECLINES] ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});