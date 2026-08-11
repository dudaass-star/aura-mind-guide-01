// Edge function (cron diário, 09h BRT): emite as cobranças dos ciclos do PIX
// Automático do Inter.
//
// O Inter não é motor de assinatura: sem esta função o mandato fica autorizado
// e nunca debita. Emitimos SEMPRE no último dia permitido (D-2, mínimo Bacen) e
// sem nenhum aviso nosso antes do débito — avisar antes só dá tempo do cliente
// revogar o mandato no app do banco.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { brtDate } from "../_shared/inter-pix.ts";
import {
  COBR_LEAD_DAYS,
  addDaysUTC,
  emitCycleCharge,
} from "../_shared/inter-cycles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_STATUSES = ["APROVADA", "ATIVA", "CRIADA"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body.dry_run === true;
  const onlyIdRec = typeof body.only_id_rec === "string" ? body.only_id_rec : null;

  const today = new Date();
  // Emitimos hoje tudo que vence até hoje + lead mínimo.
  const horizon = brtDate(addDaysUTC(today, COBR_LEAD_DAYS));
  const results: Record<string, unknown>[] = [];

  try {
    let query = supabase
      .from("inter_pix_recurrences")
      .select("*")
      .in("status", ACTIVE_STATUSES)
      .is("replaced_by_id_rec", null)
      .not("id_rec", "is", null)
      .not("next_charge_date", "is", null)
      .lte("next_charge_date", horizon)
      .limit(200);
    if (onlyIdRec) query = supabase
      .from("inter_pix_recurrences").select("*").eq("id_rec", onlyIdRec).limit(1);

    const { data: recs, error } = await query;
    if (error) throw new Error(error.message);

    for (const rec of recs || []) {
      const dueDate = rec.next_charge_date as string;

      // Mandato só debita depois do 1º pagamento (QR composto liquidado).
      const { data: paidFirst } = await supabase
        .from("inter_pix_charges").select("txid")
        .eq("id_rec", rec.id_rec).eq("cycle_index", 0)
        .not("paid_at", "is", null).maybeSingle();
      if (!paidFirst) {
        results.push({ id_rec: rec.id_rec, skipped: "primeiro_pagamento_pendente" });
        continue;
      }

      // Próximo índice de ciclo = maior existente + 1 (o 0 é o QR composto).
      const { data: last } = await supabase
        .from("inter_pix_charges").select("cycle_index")
        .eq("id_rec", rec.id_rec)
        .order("cycle_index", { ascending: false }).limit(1).maybeSingle();
      const cycleIndex = Number(last?.cycle_index ?? 0) + 1;

      if (dryRun) {
        results.push({ id_rec: rec.id_rec, would_emit: { cycleIndex, dueDate } });
        continue;
      }

      const emitted = await emitCycleCharge(supabase, rec, { cycleIndex, dueDate });
      results.push({ id_rec: rec.id_rec, cycleIndex, dueDate, ...emitted });

      // Rate limit do Inter é agressivo: serializa com respiro.
      await new Promise((r) => setTimeout(r, 400));
    }

    return new Response(
      JSON.stringify({ horizon, dryRun, processed: results.length, results }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[inter-pix-cycle-runner] erro:", err);
    return new Response(JSON.stringify({ error: String(err), results }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});