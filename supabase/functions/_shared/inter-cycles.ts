// Motor de ciclos do PIX Automático do Banco Inter.
//
// Diferença estrutural em relação ao Asaas: o Asaas é um motor de assinatura
// (ele mesmo gera a fatura de cada ciclo). O Inter expõe a API Bacen crua —
// QUEM emite a cobrança de cada ciclo (`PUT /pix/v2/cobr/{txid}`) somos nós.
// Sem este módulo o mandato é autorizado e nunca debita.
//
// Regra de negócio deliberada: emitimos no ÚLTIMO dia permitido (D-2, mínimo do
// Bacen) e NUNCA mandamos aviso próprio antes do débito. Lembrar o cliente da
// cobrança que está por vir só abre janela pra ele revogar o mandato no app do
// banco — o cliente só ouve da gente depois do fato (renovação confirmada) ou
// quando falha (dunning).
import { interFetch, brtDate } from "./inter-pix.ts";

/** Antecedência mínima aceita pelo Bacen entre a emissão e o vencimento. */
export const COBR_LEAD_DAYS = 2;

/** Teto de retentativas do mandato (politicaRetentativa PERMITE_3R_7D). */
export const MAX_RETRIES = 3;

export const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semestral: 6, yearly: 12,
};

export function addDaysUTC(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export function addMonthsUTC(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

/** Data (YYYY-MM-DD) do ciclo seguinte a `date`. */
export function nextCycleDate(date: string, billing: string): string {
  const base = new Date(`${date}T12:00:00Z`);
  return brtDate(addMonthsUTC(base, CYCLE_MONTHS[billing] ?? 1));
}

/**
 * txid DETERMINÍSTICO por (mandato, ciclo): duas execuções do runner no mesmo
 * dia — ou o backstop da auditoria — nunca criam duas cobranças do mesmo ciclo.
 * O `PUT /cobr/{txid}` do Inter é idempotente por txid.
 */
export function cycleTxid(idRec: string, cycleIndex: number): string {
  const clean = (idRec || "").replace(/[^A-Za-z0-9]/g, "");
  const tail = clean.slice(-24);
  return `aurac${cycleIndex}${tail}`.slice(0, 35).padEnd(26, "0");
}

export type EmitResult = {
  ok: boolean;
  txid: string;
  status: number;
  reason?: string;
  skipped?: string;
};

/**
 * Emite a cobrança de um ciclo e registra em `inter_pix_charges`. Idempotente:
 * se já existe linha para o txid do ciclo, não chama o Inter de novo.
 */
export async function emitCycleCharge(
  supabase: any,
  rec: Record<string, any>,
  opts: { cycleIndex: number; dueDate: string; valueCents?: number },
): Promise<EmitResult> {
  const idRec = rec.id_rec as string;
  const txid = cycleTxid(idRec, opts.cycleIndex);
  const valueCents = opts.valueCents ?? (rec.value_cents as number);

  const { data: existing } = await supabase
    .from("inter_pix_charges").select("txid, status").eq("txid", txid).maybeSingle();
  if (existing) return { ok: true, txid, status: 200, skipped: "already_emitted" };

  const body: Record<string, unknown> = {
    idRec,
    calendario: { dataDeVencimento: opts.dueDate },
    valor: { original: (valueCents / 100).toFixed(2) },
    infoAdicional: `Aura ${rec.plan} ${rec.billing_period}`.slice(0, 140),
  };
  if (rec.customer_cpf) {
    body.devedor = { cpf: rec.customer_cpf, nome: String(rec.customer_name || "").slice(0, 200) };
  }

  const resp = await interFetch<Record<string, unknown>>(`/pix/v2/cobr/${txid}`, {
    method: "PUT",
    body,
  });

  if (!resp.ok) {
    await supabase.from("inter_pix_recurrences").update({
      last_error: `cobr ciclo ${opts.cycleIndex} recusada (HTTP ${resp.status}): ${resp.raw.slice(0, 240)}`,
      updated_at: new Date().toISOString(),
    }).eq("id_rec", idRec);
    return { ok: false, txid, status: resp.status, reason: resp.raw.slice(0, 240) };
  }

  const { error: insErr } = await supabase.from("inter_pix_charges").insert({
    txid,
    id_rec: idRec,
    user_id: rec.user_id || null,
    cycle_index: opts.cycleIndex,
    due_date: opts.dueDate,
    value_cents: valueCents,
    status: String((resp.data as Record<string, any>)?.status || "CRIADA"),
    raw_payload: resp.data as Record<string, unknown>,
  });
  if (insErr && insErr.code !== "23505") {
    console.warn(`[inter-cycles] cobr ${txid} emitida mas não persistida: ${insErr.message}`);
  }

  await supabase.from("inter_pix_recurrences").update({
    next_charge_date: nextCycleDate(opts.dueDate, rec.billing_period as string),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id_rec", idRec);

  console.log(`[inter-cycles] ✅ cobr ${txid} (ciclo ${opts.cycleIndex}) vence ${opts.dueDate}`);
  return { ok: true, txid, status: resp.status };
}

/**
 * Retentativa explícita de um débito rejeitado, respeitando o teto 3R/7D do
 * mandato. O Inter aceita a rota do Bacen `PUT /cobr/{txid}/retentativa/{data}`;
 * quando indisponível, cai para o PATCH da própria cobrança.
 */
export async function retryCharge(
  supabase: any,
  charge: Record<string, any>,
): Promise<{ retried: boolean; reason?: string; date?: string }> {
  const used = Number(charge.retry_count || 0);
  if (used >= MAX_RETRIES) return { retried: false, reason: "max_retries" };

  // Vencimento original + 7 dias é o limite da janela: espaçamos 2 dias por
  // tentativa para caber as três (D+2, D+4, D+6).
  const due = new Date(`${charge.due_date}T12:00:00Z`);
  const retryDate = brtDate(addDaysUTC(due, (used + 1) * 2));
  const limit = brtDate(addDaysUTC(due, 7));
  if (retryDate > limit) return { retried: false, reason: "outside_7d_window" };

  let resp = await interFetch(`/pix/v2/cobr/${charge.txid}/retentativa/${retryDate}`, {
    method: "PUT",
  });
  if (!resp.ok) {
    resp = await interFetch(`/pix/v2/cobr/${charge.txid}`, {
      method: "PATCH",
      body: { calendario: { dataDeVencimento: retryDate } },
    });
  }

  await supabase.from("inter_pix_charges").update({
    retry_count: resp.ok ? used + 1 : used,
    last_error: resp.ok ? null : `retentativa ${retryDate} recusada (HTTP ${resp.status})`,
    updated_at: new Date().toISOString(),
  }).eq("txid", charge.txid);

  if (!resp.ok) return { retried: false, reason: `http_${resp.status}` };
  console.log(`[inter-cycles] 🔁 retentativa ${used + 1}/${MAX_RETRIES} de ${charge.txid} em ${retryDate}`);
  return { retried: true, date: retryDate };
}

/** Cancela mandato e a cobrança aberta do ciclo corrente. */
export async function cancelMandate(
  supabase: any,
  idRec: string,
): Promise<{ ok: boolean; status: number; raw?: string }> {
  const resp = await interFetch(`/pix/v2/rec/${idRec}`, {
    method: "PATCH",
    body: { status: "CANCELADA" },
  });

  // Cobranças ainda não liquidadas do mandato saem junto.
  const { data: open } = await supabase
    .from("inter_pix_charges").select("txid, status")
    .eq("id_rec", idRec).is("paid_at", null);
  for (const c of open || []) {
    if (["CONCLUIDA", "CANCELADA", "REMOVIDA"].includes(String(c.status))) continue;
    const { data: charge } = await supabase.from("inter_pix_charges")
      .select("cycle_index").eq("txid", c.txid).maybeSingle();
    const chargePath = Number(charge?.cycle_index ?? 0) === 0 ? "cob" : "cobr";
    const removal = await interFetch(`/pix/v2/${chargePath}/${c.txid}`, {
      method: "PATCH",
      body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
    }).catch(() => null);
    if (removal?.ok) {
      await supabase.from("inter_pix_charges")
        .update({ status: "CANCELADA", last_error: null, updated_at: new Date().toISOString() })
        .eq("txid", c.txid);
    } else {
      await supabase.from("inter_pix_charges")
        .update({ last_error: `remoção remota não confirmada (${chargePath})`, updated_at: new Date().toISOString() })
        .eq("txid", c.txid);
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (resp.ok) {
    patch.status = "CANCELADA";
    patch.finish_date = brtDate();
    patch.last_error = null;
  } else {
    patch.last_error = `cancelamento recusado (HTTP ${resp.status}): ${resp.raw.slice(0, 200)}`;
  }
  await supabase.from("inter_pix_recurrences").update(patch).eq("id_rec", idRec);

  return { ok: resp.ok, status: resp.status, raw: resp.raw };
}