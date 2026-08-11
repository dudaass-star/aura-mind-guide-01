// Edge function (cron diário): auditoria/reconciliação do trilho PIX Automático
// do Inter — paridade com `asaas-pix-auto-audit`.
//
// Quatro varreduras:
//   1. Mandato parado em CRIADA além do TTL do QR (24h) → abandonado.
//   2. Cobrança liquidada no Inter sem `paid_at` local (webhook perdido) → replay.
//   3. Ciclo vencido sem cobrança emitida → backstop do cycle-runner.
//   4. Fatura gêmea do 1º ciclo (mesmo problema já conhecido no Asaas).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { interFetch, brtDate } from "../_shared/inter-pix.ts";
import { addDaysUTC, emitCycleCharge } from "../_shared/inter-cycles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Reenvia a liquidação pro webhook-inter: fonte única de verdade da ativação. */
async function replayToWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  try {
    const resp = await fetch(`${url}/functions/v1/webhook-inter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch (e) {
    console.warn("[inter-pix-audit] replay falhou:", (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body.dry_run === true;

  const report: Record<string, unknown[]> = {
    abandonados: [], recuperados: [], ciclos_emitidos: [], gemeas: [], erros: [],
  };

  try {
    const now = new Date();

    // ---- 1) Mandatos abandonados (QR expirado sem pagamento) ---------------
    const { data: stale } = await supabase
      .from("inter_pix_recurrences")
      .select("id_rec, customer_email, qr_expires_at, created_at")
      .eq("status", "CRIADA")
      .lt("qr_expires_at", now.toISOString())
      .is("replaced_by_id_rec", null)
      .limit(100);
    for (const rec of stale || []) {
      const { data: paid } = await supabase
        .from("inter_pix_charges").select("txid")
        .eq("id_rec", rec.id_rec).not("paid_at", "is", null).limit(1).maybeSingle();
      if (paid) continue;
      if (!dryRun) {
        await supabase.from("inter_pix_recurrences").update({
          status: "ABANDONADA",
          last_error: "QR expirou sem pagamento — mandato nunca autorizado",
          updated_at: new Date().toISOString(),
        }).eq("id_rec", rec.id_rec);
      }
      report.abandonados.push({ id_rec: rec.id_rec, email: rec.customer_email });
    }

    // ---- 2) Cobranças pagas no Inter e não registradas aqui ---------------
    const { data: openCharges } = await supabase
      .from("inter_pix_charges")
      .select("txid, id_rec, cycle_index, status, due_date")
      .is("paid_at", null)
      .gte("created_at", addDaysUTC(now, -45).toISOString())
      .limit(200);
    for (const c of openCharges || []) {
      // Ciclo 0 é `cob` (Pix Cobrança); ciclos seguintes são `cobr` (recorrente).
      const path = Number(c.cycle_index ?? 0) === 0
        ? `/pix/v2/cob/${c.txid}`
        : `/pix/v2/cobr/${c.txid}`;
      const resp = await interFetch<Record<string, any>>(path);
      await new Promise((r) => setTimeout(r, 300));
      if (!resp.ok || !resp.data) continue;
      const remote = resp.data as Record<string, any>;
      const remoteStatus = String(remote.status || "");
      const pixList = (remote.pix as Record<string, any>[]) || [];

      if (pixList.length > 0) {
        // Dinheiro entrou: replay como notificação de liquidação.
        if (!dryRun) {
          const ok = await replayToWebhook({ pix: pixList.map((p) => ({ ...p, txid: c.txid })) });
          if (ok) report.recuperados.push({ txid: c.txid, via: "pix" });
        } else {
          report.recuperados.push({ txid: c.txid, via: "pix", dryRun: true });
        }
        continue;
      }

      if (remoteStatus && remoteStatus !== c.status) {
        if (!dryRun) {
          const ok = await replayToWebhook({
            cobsr: [{ ...remote, txid: c.txid, idRec: c.id_rec, status: remoteStatus }],
          });
          if (ok) report.recuperados.push({ txid: c.txid, via: "cobr", status: remoteStatus });
        } else {
          report.recuperados.push({ txid: c.txid, via: "cobr", status: remoteStatus, dryRun: true });
        }
      }
    }

    // ---- 3) Backstop: ciclo vencido sem cobrança emitida ------------------
    const { data: due } = await supabase
      .from("inter_pix_recurrences")
      .select("*")
      .in("status", ["APROVADA", "ATIVA"])
      .is("replaced_by_id_rec", null)
      .not("next_charge_date", "is", null)
      .lte("next_charge_date", brtDate(now))
      .limit(100);
    for (const rec of due || []) {
      const { data: last } = await supabase
        .from("inter_pix_charges").select("cycle_index, due_date")
        .eq("id_rec", rec.id_rec)
        .order("cycle_index", { ascending: false }).limit(1).maybeSingle();
      if (last?.due_date === rec.next_charge_date) continue; // já emitida
      const cycleIndex = Number(last?.cycle_index ?? 0) + 1;
      if (dryRun) {
        report.ciclos_emitidos.push({ id_rec: rec.id_rec, cycleIndex, dryRun: true });
        continue;
      }
      // Vencimento no mínimo permitido: nunca retroativo.
      const dueDate = brtDate(addDaysUTC(now, 2));
      const emitted = await emitCycleCharge(supabase, rec, { cycleIndex, dueDate });
      report.ciclos_emitidos.push({ id_rec: rec.id_rec, cycleIndex, dueDate, ...emitted });
      await new Promise((r) => setTimeout(r, 400));
    }

    // ---- 4) Fatura gêmea do 1º ciclo -------------------------------------
    const { data: firstCycles } = await supabase
      .from("inter_pix_charges")
      .select("txid, id_rec, cycle_index, due_date, status, paid_at")
      .lte("cycle_index", 1)
      .gte("created_at", addDaysUTC(now, -45).toISOString())
      .limit(400);
    const byRec = new Map<string, Record<string, any>[]>();
    for (const c of firstCycles || []) {
      const arr = byRec.get(c.id_rec) || [];
      arr.push(c);
      byRec.set(c.id_rec, arr);
    }
    for (const [idRec, charges] of byRec) {
      const zero = charges.find((c) => Number(c.cycle_index) === 0);
      const one = charges.find((c) => Number(c.cycle_index) === 1);
      if (!zero?.paid_at || !one || one.paid_at) continue;
      // Ciclo 1 vencendo dentro de 2 dias do ciclo 0 pago = fatura gêmea.
      const gap = (new Date(`${one.due_date}T12:00:00Z`).getTime()
        - new Date(zero.paid_at).getTime()) / 86400000;
      if (gap > 2) continue;
      if (!dryRun) {
        await interFetch(`/pix/v2/cobr/${one.txid}`, {
          method: "PATCH", body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
        }).catch(() => {});
        await supabase.from("inter_pix_charges").update({
          status: "CANCELADA",
          last_error: "fatura gêmea do 1º ciclo — removida pela auditoria",
          updated_at: new Date().toISOString(),
        }).eq("txid", one.txid);
      }
      report.gemeas.push({ id_rec: idRec, txid: one.txid });
    }

    return new Response(JSON.stringify({ dryRun, report }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[inter-pix-audit] erro:", err);
    report.erros.push(String(err));
    return new Response(JSON.stringify({ report }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});